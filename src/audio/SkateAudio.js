import { SKATE_SOUND, createSkateTexture, createDeckImpactBank,
  createVariedRollBuffer, createRecordedImpactBank, createPhysicalContactBank } from './SkateSoundDesign.js';

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export class SkateAudio {
  constructor(context, destination, { speedReference = SKATE_SOUND.referenceSpeed } = {}) {
    if (!context) throw new TypeError('SkateAudio requires an AudioContext');
    if (!destination) throw new TypeError('SkateAudio requires a destination AudioNode');

    this.context = context;
    this.panner = context.createStereoPanner?.() || context.createGain();
    this.panner.connect(destination);
    this.destination = this.panner;
    this.speedReference = Math.max(1, Number(speedReference) || 18);
    this.disposed = false;
    this.paused = false;
    this.distance = 0;
    this.previousSpeed = 0;
    this.loopPhase = 0;
    this.impactIndex = 0;
    this.lastImpactVariant = -1;
    this.impactVoices = new Set();
    this.lastPanel = 0;
    this.lastPanelTime = -Infinity;
    this.wasAirborne = false;
    this.impactBank = createDeckImpactBank(context);
    this.contactBanks = Object.fromEntries(['hand', 'metal', 'panel', 'skid'].map(
      (kind) => [kind, createPhysicalContactBank(context, kind)],
    ));
    this.contactIndices = {};

    this.noiseBuffer = createSkateTexture(context, 'wind');

    this.rollFilter = context.createBiquadFilter();
    // Separate dry urethane and truck textures. Optional recordings can still
    // replace either layer through setContinuousBuffers().
    this.rollFilter.type = 'lowpass';
    this.rollFilter.Q.value = 0.42;
    this.rollGain = context.createGain();
    this.rollGain.gain.value = 0;
    this.wheelGrain = context.createGain();
    this.wheelGrain.gain.value = 1;
    this.wheelModulation = context.createOscillator();
    this.wheelModulation.type = 'triangle';
    this.wheelModulation.frequency.value = 1;
    this.wheelModulationGain = context.createGain();
    this.wheelModulationGain.gain.value = 0.045;
    this.wheelModulation.connect(this.wheelModulationGain).connect(this.wheelGrain.gain);
    this.wheelModulation.start();
    this.rollFilter.connect(this.wheelGrain).connect(this.rollGain).connect(this.destination);

    this.rampFilter = context.createBiquadFilter();
    this.rampFilter.type = 'bandpass';
    this.rampFilter.frequency.value = 1850;
    this.rampFilter.Q.value = 0.65;
    this.rampGain = context.createGain();
    this.rampGain.gain.value = 0;
    this.rampFilter.connect(this.rampGain).connect(this.destination);

    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 900;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    this.windFilter.connect(this.windGain).connect(this.destination);

    this.rollSource = this._createLoopSource(createSkateTexture(context, 'wheel'), this.rollFilter);
    this.rampSource = this._createLoopSource(createSkateTexture(context, 'truck'), this.rampFilter);
    this.windSource = this._createLoopSource(this.noiseBuffer, this.windFilter);
  }

  _createLoopSource(buffer, destination) {
    const source = this.context.createBufferSource();
    source.buffer = buffer || this.noiseBuffer;
    source.loop = true;
    source.connect(destination);
    this.loopPhase = (this.loopPhase + 0.731) % source.buffer.duration;
    source.start(this.context.currentTime, this.loopPhase);
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
    if (wheelRoll) this._replaceLoopSource('rollSource', createVariedRollBuffer(this.context, wheelRoll), this.rollFilter);
    if (rampTexture) this._replaceLoopSource('rampSource', rampTexture, this.rampFilter);
    if (wind) this._replaceLoopSource('windSource', wind, this.windFilter);
  }

  setDeckImpactBuffer(buffer) {
    if (!buffer || this.disposed) return;
    // All variants retain the player's selected raw-street recording.
    this.impactBank = createRecordedImpactBank(this.context, buffer);
    this.impactIndex = 0;
    this.lastImpactVariant = -1;
  }

  playDeckImpact(intensity = 0.5, { delay = 0, gainScale = 1, pitch = 1, rating = 'CLEAN' } = {}) {
    const amount = clamp01(intensity);
    // Neighboring variants vary the tail/tone without repeating exactly, while
    // heavier landings keep the longer resonant body of the same source.
    const base = Math.min(this.impactBank.length - 1, Math.floor(amount * this.impactBank.length));
    const offset = this.impactIndex++ % 2;
    let index = (base + offset) % this.impactBank.length;
    if (index === this.lastImpactVariant && this.impactBank.length > 1) index = (index + 1) % this.impactBank.length;
    this.lastImpactVariant = index;
    const scratch = rating === 'SKETCHY' || rating === 'BAIL';
    this._playContactBuffer(this.impactBank[index], amount, {
      delay, gainScale: gainScale * (scratch ? 0.9 : 1), pitch,
    });
    if (scratch) this.playContact('skid', amount, { delay: delay + 0.018, gainScale: 0.22 });
  }

  playContact(kind = 'metal', intensity = 0.5, options = {}) {
    const bank = this.contactBanks[kind];
    if (!bank) return;
    const index = (this.contactIndices[kind] || 0) % bank.length;
    this.contactIndices[kind] = index + 1;
    this._playContactBuffer(bank[index], intensity, options);
  }

  _playContactBuffer(buffer, intensity, { delay = 0, gainScale = 1, pitch = 1 } = {}) {
    if (this.disposed || this.paused || this.impactVoices.size >= SKATE_SOUND.maxImpactVoices) return;
    const amount = clamp01(intensity);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch * (1.08 - amount * 0.17);
    gain.gain.value = (0.07 + amount * 0.24) * gainScale;
    source.connect(gain).connect(this.destination);
    const voice = { source, gain };
    this.impactVoices.add(voice);
    source.addEventListener('ended', () => {
      source.disconnect(); gain.disconnect(); this.impactVoices.delete(voice);
    }, { once: true });
    source.start(this.context.currentTime + Math.max(0, delay));
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
    const pan = Number.isFinite(Number(state.audioPan)) ? Number(state.audioPan)
      : (Number(state.pipeX) || 0) * 0.025;
    this.panner.pan?.setTargetAtTime(Math.max(-0.35, Math.min(0.35, pan)), now, 0.07);
    if (this.paused) {
      this.rollGain.gain.setTargetAtTime(0, now, 0.018);
      this.rampGain.gain.setTargetAtTime(0, now, 0.018);
      this.windGain.gain.setTargetAtTime(0, now, 0.018);
      return;
    }
    const smoothing = SKATE_SOUND.contactAttack;
    const mode = state.mode || 'contact';
    const speed = Math.abs(Number(
      state.speed ?? state.tangentVelocity ?? state.velocity ?? 0,
    ) || 0);
    const normalizedSpeed = clamp01(speed / this.speedReference);
    const circumference = Math.PI * Math.max(0.02, Number(state.wheelDiameter) || 0.1);
    this.wheelModulation.frequency.setTargetAtTime(Math.max(1, Math.min(180, speed / circumference)), now, 0.04);
    const frameDt = Math.max(0.001, Math.min(0.1, Number(dt) || 1 / 60));
    const acceleration = Math.min(1, Math.abs(speed - this.previousSpeed) / frameDt / 35);
    this.previousSpeed = speed;
    const fastSpeed = smoothstep((normalizedSpeed - 0.45) / 0.55);
    const region = String(state.region || 'flat').toLowerCase();
    const airborne = mode === 'airborne' || state.airborne === true || state.surfaceTrickActive;
    const contactSmoothing = airborne ? SKATE_SOUND.contactRelease : smoothing;

    const transition = region.includes('transition') || region.includes('wall');
    const flat = !transition && !airborne;
    const moving = smoothstep(speed / 1.2);
    if (!airborne) this.distance = (this.distance + speed * frameDt) % 1000;
    // Quiet distance-based grain avoids a static loop without allocating
    // voices every frame. Wheels stop at rest and lose contact in the air.
    const grain = 1 + 0.045 * Math.sin(this.distance * 5.4)
      + 0.025 * Math.sin(this.distance * 13.7);
    const rollIntensity = airborne ? 0 : moving * (0.025 + 0.4 * Math.sqrt(normalizedSpeed)) * grain;
    const transitionBoost = transition ? 1.12 : flat ? 0.94 : 1;
    const rollTarget = rollIntensity * transitionBoost;

    const rollFrequency = 850 + normalizedSpeed * 2100;
    const rollQ = 0.38 + fastSpeed * 0.32;
    this.rollGain.gain.setTargetAtTime(rollTarget, now, contactSmoothing);
    this.rollFilter.frequency.setTargetAtTime(rollFrequency, now, smoothing);
    this.rollFilter.Q.setTargetAtTime(rollQ, now, smoothing);
    this.rollSource.playbackRate.setTargetAtTime(0.6 + normalizedSpeed * 1.5, now, smoothing);

    const rampTarget = airborne ? 0 : moving * (transition
      ? 0.012 + 0.09 * fastSpeed + acceleration * 0.012
      : 0.01 * normalizedSpeed);
    this.rampGain.gain.setTargetAtTime(rampTarget, now, contactSmoothing);
    this.rampFilter.frequency.setTargetAtTime(1200 + normalizedSpeed * 1200, now, smoothing);
    this.rampSource.playbackRate.setTargetAtTime(0.7 + normalizedSpeed * 0.8, now, smoothing);

    const panel = Math.floor(this.distance / SKATE_SOUND.panelSpacing);
    if (!airborne && !this.wasAirborne && speed > 1.4 && panel !== this.lastPanel
      && now - this.lastPanelTime >= SKATE_SOUND.panelCooldown) {
      this.playContact('panel', normalizedSpeed * 0.35, { gainScale: 0.12, pitch: 1.06 });
      this.lastPanelTime = now;
    }
    this.lastPanel = panel;
    this.wasAirborne = airborne;

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
    try { this.wheelModulation.stop(); } catch {}
    for (const { source, gain } of this.impactVoices) {
      try { source.stop(); } catch {}
      source.disconnect(); gain.disconnect();
    }
    this.impactVoices.clear();
    this.impactBank = [];
    this.contactBanks = {};

    for (const source of [this.rollSource, this.rampSource, this.windSource]) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    for (const node of [
      this.rollFilter, this.rollGain,
      this.wheelGrain, this.wheelModulation, this.wheelModulationGain,
      this.rampFilter, this.rampGain,
      this.windFilter, this.windGain,
      this.panner,
    ]) {
      try { node.disconnect(); } catch {}
    }
  }
}
