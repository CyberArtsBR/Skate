function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function createNoiseBuffer(context, seconds = 2) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.72 + white * 0.28;
    data[i] = previous;
  }
  return buffer;
}

export class SkateAudio {
  constructor(context, destination, { speedReference = 18 } = {}) {
    if (!context) throw new TypeError('SkateAudio requires an AudioContext');
    if (!destination) throw new TypeError('SkateAudio requires a destination AudioNode');

    this.context = context;
    this.destination = destination;
    this.speedReference = Math.max(1, Number(speedReference) || 18);
    this.disposed = false;
    this.paused = false;

    this.noiseBuffer = createNoiseBuffer(context);

    this.rollFilter = context.createBiquadFilter();
    // The procedural fallback is intentionally soft and broadband. A real
    // seamless wheel sample can replace it through setContinuousBuffers().
    this.rollFilter.type = 'lowpass';
    this.rollFilter.Q.value = 0.42;
    this.rollGain = context.createGain();
    this.rollGain.gain.value = 0;
    this.rollFilter.connect(this.rollGain).connect(destination);

    this.rampFilter = context.createBiquadFilter();
    this.rampFilter.type = 'highpass';
    this.rampFilter.frequency.value = 380;
    this.rampGain = context.createGain();
    this.rampGain.gain.value = 0;
    this.rampFilter.connect(this.rampGain).connect(destination);

    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 900;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    this.windFilter.connect(this.windGain).connect(destination);

    this.rollSource = this._createLoopSource(this.noiseBuffer, this.rollFilter);
    this.rampSource = this._createLoopSource(this.noiseBuffer, this.rampFilter);
    this.windSource = this._createLoopSource(this.noiseBuffer, this.windFilter);
  }

  _createLoopSource(buffer, destination) {
    const source = this.context.createBufferSource();
    source.buffer = buffer || this.noiseBuffer;
    source.loop = true;
    source.connect(destination);
    source.start(this.context.currentTime);
    return source;
  }

  _replaceLoopSource(slot, buffer, destination) {
    if (!buffer || this.disposed) return false;
    const previous = this[slot];
    try { previous?.stop(); } catch {}
    try { previous?.disconnect(); } catch {}
    this[slot] = this._createLoopSource(buffer, destination);
    return true;
  }

  setContinuousBuffers({ wheelRoll, rampTexture, wind } = {}) {
    if (wheelRoll) this._replaceLoopSource('rollSource', wheelRoll, this.rollFilter);
    if (rampTexture) this._replaceLoopSource('rampSource', rampTexture, this.rampFilter);
    if (wind) this._replaceLoopSource('windSource', wind, this.windFilter);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (!this.context || this.disposed) return this.paused;
    const now = this.context.currentTime;
    const target = this.paused ? 0 : undefined;
    if (target === 0) {
      this.rollGain.gain.cancelScheduledValues(now);
      this.rampGain.gain.cancelScheduledValues(now);
      this.windGain.gain.cancelScheduledValues(now);
      this.rollGain.gain.setTargetAtTime(0, now, 0.018);
      this.rampGain.gain.setTargetAtTime(0, now, 0.018);
      this.windGain.gain.setTargetAtTime(0, now, 0.018);
    }
    return this.paused;
  }

  update(state = {}, dt = 1 / 60) {
    if (this.disposed) return;

    const now = this.context.currentTime;
    if (this.paused) {
      this.rollGain.gain.setTargetAtTime(0, now, 0.018);
      this.rampGain.gain.setTargetAtTime(0, now, 0.018);
      this.windGain.gain.setTargetAtTime(0, now, 0.018);
      return;
    }
    const smoothing = Math.max(0.025, Math.min(0.18, (Number(dt) || 0.016) * 5));
    const mode = state.mode || 'contact';
    const speed = Math.abs(Number(
      state.speed ?? state.tangentVelocity ?? state.velocity ?? 0,
    ) || 0);
    const normalizedSpeed = clamp01(speed / this.speedReference);
    const fastSpeed = smoothstep((normalizedSpeed - 0.45) / 0.55);
    const region = String(state.region || 'flat').toLowerCase();
    const airborne = mode === 'airborne' || state.airborne === true;

    const transition = region.includes('transition') || region.includes('wall');
    const flat = !transition && !airborne;
    const rollIntensity = airborne ? 0 : (0.018 + 0.24 * smoothstep(normalizedSpeed));
    const transitionBoost = transition ? 1.16 : flat ? 0.9 : 1;
    const rollTarget = rollIntensity * transitionBoost;

    const rollFrequency = 520 + normalizedSpeed * 1380;
    const rollQ = 0.38 + fastSpeed * 0.32;
    this.rollGain.gain.setTargetAtTime(rollTarget, now, smoothing);
    this.rollFilter.frequency.setTargetAtTime(rollFrequency, now, smoothing);
    this.rollFilter.Q.setTargetAtTime(rollQ, now, smoothing);

    const rampTarget = airborne ? 0 : (transition ? 0.02 + 0.16 * fastSpeed : 0.012 * normalizedSpeed);
    this.rampGain.gain.setTargetAtTime(rampTarget, now, smoothing * 1.2);
    this.rampFilter.frequency.setTargetAtTime(330 + normalizedSpeed * 640, now, smoothing);

    const baseY = Number(state.airBaseY ?? state.baseY ?? 0) || 0;
    const airY = Number(state.airY ?? state.height ?? baseY) || baseY;
    const height = Math.max(0, airY - baseY);
    const verticalSpeed = Math.abs(Number(state.airVerticalVelocity ?? state.verticalSpeed ?? 0) || 0);
    const windByHeight = clamp01(height / 5.5);
    const windByVelocity = clamp01(verticalSpeed / 18);
    const windTarget = airborne
      ? 0.015 + 0.13 * smoothstep(Math.max(windByHeight, windByVelocity))
      : 0;
    this.windGain.gain.setTargetAtTime(windTarget, now, smoothing * 1.5);
    this.windFilter.frequency.setTargetAtTime(
      520 + 760 * Math.max(windByHeight, windByVelocity),
      now,
      smoothing,
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const source of [this.rollSource, this.rampSource, this.windSource]) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    for (const node of [
      this.rollFilter, this.rollGain,
      this.rampFilter, this.rampGain,
      this.windFilter, this.windGain,
    ]) {
      try { node.disconnect(); } catch {}
    }
  }
}
