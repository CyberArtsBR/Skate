import { AudioBus, clampAudioVolume } from './AudioBus.js';
import { createAudioManifest } from './AudioManifest.js';
import { SkateAudio } from './SkateAudio.js';

const DEFAULT_VOLUMES = Object.freeze({
  master: 0.1,
  music: 0.55,
  sfx: 0.9,
  ambience: 0.42,
});

const COOLDOWNS = Object.freeze({
  pump: 0.085,
  coping: 0.11,
  landing: 0.12,
  score: 0.08,
  combo: 0.16,
  countdown: 0.12,
  timer: 0.3,
  bail: 0.65,
});

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeType(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function eventValue(event, ...keys) {
  for (const key of keys) {
    if (event?.[key] !== undefined) return event[key];
    if (event?.data?.[key] !== undefined) return event.data[key];
    if (event?.detail?.[key] !== undefined) return event.detail[key];
  }
  return undefined;
}

function contextConstructor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function makeNoiseBuffer(context, seconds = 1.5) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * (0.65 + fade * 0.35);
  }
  return buffer;
}

function createProceduralRockBuffer(context) {
  const sampleRate = context.sampleRate;
  const bpm = 150;
  const beat = 60 / bpm;
  const eighth = beat * 0.5;
  const bars = 4;
  const duration = beat * 4 * bars;
  const frames = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(2, frames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Original retro hard-rock riff. The square/saw harmonic stack deliberately
  // evokes 32-bit-era game audio without copying any existing composition.
  const riff = [40, 40, 43, 45, 40, 47, 45, 43, 40, 40, 50, 47, 45, 43, 38, 43];
  const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const fract = (value) => value - Math.floor(value);

  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const eighthIndex = Math.floor(t / eighth);
    const note = riff[eighthIndex % riff.length];
    const noteTime = t - eighthIndex * eighth;
    const noteEnvelope = Math.min(1, noteTime / 0.008)
      * Math.pow(Math.max(0, 1 - noteTime / eighth), 0.45);
    const frequency = midiToHz(note);
    const phase = Math.PI * 2 * frequency * t;
    const guitarRaw =
      Math.sin(phase)
      + Math.sin(phase * 2) * 0.34
      + Math.sin(phase * 3) * 0.25
      + Math.sin(phase * 5) * 0.12;
    const guitar = Math.tanh(guitarRaw * 2.4) * 0.24 * noteEnvelope;

    const bassPhase = Math.PI * 2 * (frequency * 0.5) * t;
    const bass = Math.tanh(Math.sin(bassPhase) * 3.4)
      * 0.15 * noteEnvelope;

    const beatIndex = Math.floor(t / beat);
    const beatTime = t - beatIndex * beat;
    const kickEnvelope = Math.exp(-beatTime * 24);
    const kickFrequency = 52 + 72 * Math.exp(-beatTime * 34);
    const kick = Math.sin(Math.PI * 2 * kickFrequency * beatTime)
      * kickEnvelope * 0.34;

    const beatInBar = beatIndex % 4;
    const noise = fract(Math.sin((i + 1) * 12.9898) * 43758.5453) * 2 - 1;
    const snareEnvelope = (beatInBar === 1 || beatInBar === 3)
      ? Math.exp(-beatTime * 30)
      : 0;
    const snare = noise * snareEnvelope * 0.19;

    const hatTime = t - eighthIndex * eighth;
    const hat = noise * Math.exp(-hatTime * 95) * 0.055;

    const mono = Math.tanh((guitar + bass + kick + snare + hat) * 1.15);
    const side = Math.sin(phase * 1.006 + 0.7) * 0.018 * noteEnvelope;
    left[i] = Math.max(-0.92, Math.min(0.92, mono + side));
    right[i] = Math.max(-0.92, Math.min(0.92, mono - side));
  }

  return buffer;
}

export class HalfpipeAudio {
  constructor(options = {}) {
    this.manifest = createAudioManifest(options.manifest);
    this.volumes = {
      master: clampAudioVolume(options.masterVolume ?? DEFAULT_VOLUMES.master),
      music: clampAudioVolume(options.musicVolume ?? DEFAULT_VOLUMES.music),
      sfx: clampAudioVolume(options.sfxVolume ?? DEFAULT_VOLUMES.sfx),
      ambience: clampAudioVolume(options.ambienceVolume ?? DEFAULT_VOLUMES.ambience),
    };

    this.muted = Boolean(options.muted);
    this.vibrationEnabled = options.vibrationEnabled !== false;
    this.onHaptics = typeof options.onHaptics === 'function' ? options.onHaptics : null;
    this.contextFactory = options.contextFactory || null;

    this.context = null;
    this.ownsContext = false;
    this.unlocked = false;
    this.disposed = false;

    this.masterGain = null;
    this.limiter = null;
    this.buses = null;
    this.skate = null;
    this.noiseBuffer = null;

    this.buffers = new Map();
    this.loading = new Map();
    this.cooldowns = new Map();
    this.musicVoices = new Set();
    this.ambienceVoices = new Map();
    this.currentMusic = null;
    this.proceduralRockBuffer = null;
    this.paused = false;

    this.lastComboMultiplier = 1;
    this.timerWarningsPlayed = new Set();
    this.lastRemaining = null;
  }

  get isReady() {
    return Boolean(
      this.context
      && this.unlocked
      && this.context.state === 'running'
      && !this.disposed
    );
  }

  async unlock({ context = null, preload = true } = {}) {
    if (this.disposed) return false;

    if (!this.context) {
      if (context) {
        this.context = context;
      } else {
        const Context = this.contextFactory || contextConstructor();
        if (!Context) return false;
        this.context = new Context();
        this.ownsContext = true;
      }
      this._createGraph();
    }

    if (this.context.state !== 'running' && this.context.state !== 'closed') {
      await this.context.resume();
    }

    this.unlocked = this.context.state === 'running';
    if (this.unlocked && preload) await this.preload();
    return this.unlocked;
  }

  _createGraph() {
    const context = this.context;

    this.masterGain = context.createGain();
    this.masterGain.gain.value = 0.5;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.masterGain.connect(this.limiter).connect(context.destination);

    this.buses = {
      MASTER: new AudioBus(context, {
        name: 'MASTER',
        destination: this.masterGain,
        volume: this.muted ? 0 : this.volumes.master,
      }),
    };

    this.buses.MUSIC = new AudioBus(context, {
      name: 'MUSIC',
      destination: this.buses.MASTER.gain,
      volume: this.volumes.music,
    });
    this.buses.SFX = new AudioBus(context, {
      name: 'SFX',
      destination: this.buses.MASTER.gain,
      volume: this.volumes.sfx,
    });
    this.buses.AMBIENCE = new AudioBus(context, {
      name: 'AMBIENCE',
      destination: this.buses.MASTER.gain,
      volume: this.volumes.ambience,
    });

    this.noiseBuffer = makeNoiseBuffer(context);
    this.skate = new SkateAudio(context, this.buses.SFX.gain);
  }

  async preload() {
    if (!this.isReady) return [];

    const entries = [];
    for (const group of ['music', 'ambience', 'sfx', 'continuous']) {
      for (const [name, descriptor] of Object.entries(this.manifest[group] || {})) {
        if (descriptor?.url) entries.push([group + '.' + name, descriptor.url]);
      }
    }

    const results = await Promise.all(entries.map(async ([key, url]) => {
      try {
        await this._loadBuffer(key, url);
        return { key, loaded: true };
      } catch (error) {
        console.warn('[HalfpipeAudio] Optional audio asset failed: ' + key, error);
        return { key, loaded: false, error };
      }
    }));

    this.skate?.setContinuousBuffers({
      wheelRoll: this.buffers.get('continuous.wheelRoll'),
      rampTexture: this.buffers.get('continuous.rampTexture'),
      wind: this.buffers.get('continuous.wind'),
    });
    this.skate?.setDeckImpactBuffer(this.buffers.get('sfx.deckImpact'));

    return results;
  }

  async _loadBuffer(key, url) {
    if (!url || !this.context) return null;
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.loading.has(key)) return this.loading.get(key);

    const task = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' loading ' + url);
        }
        return response.arrayBuffer();
      })
      .then((data) => this.context.decodeAudioData(data.slice(0)))
      .then((buffer) => {
        this.buffers.set(key, buffer);
        this.loading.delete(key);
        return buffer;
      })
      .catch((error) => {
        this.loading.delete(key);
        throw error;
      });

    this.loading.set(key, task);
    return task;
  }

  _allowed(key, seconds = 0) {
    if (!this.isReady) return false;
    const now = this.context.currentTime;
    const next = this.cooldowns.get(key) || 0;
    if (now < next) return false;
    this.cooldowns.set(key, now + Math.max(0, seconds));
    return true;
  }

  _playBuffer(key, busName = 'SFX', options = {}) {
    if (!this.isReady) return null;
    const buffer = this.buffers.get(key);
    const bus = this.buses?.[busName];
    if (!buffer || !bus) return null;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const delay = Math.max(0, Number(options.delay) || 0);
    source.buffer = buffer;
    source.loop = Boolean(options.loop);
    source.playbackRate.value = Math.max(0.25, Math.min(4, Number(options.rate) || 1));
    gain.gain.value = Math.max(0, Number(options.gain ?? 1));

    source.connect(gain).connect(bus.gain);
    source.start(this.context.currentTime + delay);
    source.addEventListener('ended', () => {
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    }, { once: true });

    return { source, gain };
  }

  _tone({
    frequency = 440,
    endFrequency = null,
    duration = 0.09,
    gain = 0.12,
    type = 'sine',
    delay = 0,
    busName = 'SFX',
  } = {}) {
    if (!this.isReady) return null;
    const bus = this.buses?.[busName];
    if (!bus) return null;

    const start = this.context.currentTime + Math.max(0, delay);
    const end = start + Math.max(0.015, duration);
    const oscillator = this.context.createOscillator();
    const voiceGain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(25, frequency), start);
    if (Number.isFinite(endFrequency)) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(25, endFrequency),
        end,
      );
    }

    voiceGain.gain.setValueAtTime(0.0001, start);
    voiceGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gain),
      start + 0.008,
    );
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(voiceGain).connect(bus.gain);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
    oscillator.addEventListener('ended', () => {
      try { oscillator.disconnect(); } catch {}
      try { voiceGain.disconnect(); } catch {}
    }, { once: true });

    return oscillator;
  }

  _noiseBurst({
    duration = 0.08,
    gain = 0.08,
    frequency = 900,
    type = 'bandpass',
    q = 0.8,
    delay = 0,
    busName = 'SFX',
  } = {}) {
    if (!this.isReady || !this.noiseBuffer) return null;
    const bus = this.buses?.[busName];
    if (!bus) return null;

    const start = this.context.currentTime + Math.max(0, delay);
    const end = start + Math.max(0.02, duration);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const voiceGain = this.context.createGain();

    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.value = Math.max(40, frequency);
    filter.Q.value = Math.max(0.001, q);
    voiceGain.gain.setValueAtTime(Math.max(0, gain), start);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(filter).connect(voiceGain).connect(bus.gain);
    source.start(start, Math.random() * 0.3);
    source.stop(end + 0.01);
    source.addEventListener('ended', () => {
      try { source.disconnect(); } catch {}
      try { filter.disconnect(); } catch {}
      try { voiceGain.disconnect(); } catch {}
    }, { once: true });

    return source;
  }

  _assetOr(key, fallback, options = {}) {
    const descriptor = key.split('.').reduce(
      (value, part) => value?.[part],
      this.manifest,
    );

    const voice = this._playBuffer(key, options.busName || 'SFX', {
      gain: (descriptor?.gain ?? 1) * (options.gain ?? 1),
      rate: options.rate ?? 1,
      loop: Boolean(options.loop),
      delay: options.delay ?? 0,
    });

    return voice || fallback?.() || null;
  }

  _haptic(recommendation) {
    if (!this.vibrationEnabled || !this.onHaptics || !recommendation) return;
    this.onHaptics({
      weakMagnitude: clamp01(recommendation.weakMagnitude),
      strongMagnitude: clamp01(recommendation.strongMagnitude),
      durationMs: Math.max(0, Math.round(Number(recommendation.durationMs) || 0)),
      reason: recommendation.reason || 'audio-event',
    });
  }

  _pumpCue(event) {
    if (!this._allowed('pump', COOLDOWNS.pump)) return;

    const explicit = normalizeType(
      eventValue(event, 'rating', 'qualityLabel', 'grade'),
    );
    const quality = clamp01(
      eventValue(event, 'quality', 'value', 'timingQuality'),
    );
    const wrong = (
      eventValue(event, 'wrong', 'missed') === true
      || explicit === 'MISS'
      || explicit === 'WRONG'
    );

    if (wrong) return;

    const rating = explicit || (
      quality >= 0.82
        ? 'PERFECT'
        : quality >= 0.55
          ? 'GOOD'
          : quality > 0
            ? 'WEAK'
            : ''
    );

    if (!rating) return;

    if (rating === 'PERFECT') {
      this._assetOr('sfx.pumpPerfect', () => {
        this._noiseBurst({
          duration: 0.11,
          gain: 0.085,
          frequency: 760,
        });
        this._tone({
          frequency: 270,
          endFrequency: 410,
          duration: 0.1,
          gain: 0.055,
          type: 'triangle',
        });
      });
      this._haptic({
        weakMagnitude: 0.22,
        strongMagnitude: 0.08,
        durationMs: 45,
        reason: 'pump-perfect',
      });
      return;
    }

    if (rating === 'GOOD') {
      this._assetOr('sfx.pumpGood', () => {
        this._noiseBurst({
          duration: 0.09,
          gain: 0.055,
          frequency: 680,
        });
        this._tone({
          frequency: 245,
          endFrequency: 320,
          duration: 0.08,
          gain: 0.035,
          type: 'triangle',
        });
      });
      return;
    }

    if (rating === 'WEAK') {
      this._assetOr('sfx.pumpWeak', () => {
        this._noiseBurst({
          duration: 0.07,
          gain: 0.025,
          frequency: 520,
        });
      });
    }
  }

  _copingCue(event) {
    if (!this._allowed('coping', COOLDOWNS.coping)) return;

    const action = normalizeType(
      eventValue(event, 'action', 'subtype', 'trickType'),
    );
    const intensity = clamp01(
      eventValue(event, 'intensity', 'impact') ?? 0.6,
    );

    if (action === 'HAND_PLANT' || action === 'HANDPLANT') {
      this._assetOr('sfx.handPlant', () => {
        this._noiseBurst({
          duration: 0.09,
          gain: 0.09 + intensity * 0.035,
          frequency: 1250,
          q: 1.8,
        });
        this._tone({
          frequency: 180,
          endFrequency: 120,
          duration: 0.11,
          gain: 0.05,
          type: 'triangle',
        });
      });
      this._haptic({
        weakMagnitude: 0.25,
        strongMagnitude: 0.34,
        durationMs: 80,
        reason: 'hand-plant',
      });
      return;
    }

    if (action === 'KICK_TURN' || action === 'KICKTURN') {
      this._assetOr('sfx.kickTurn', () => {
        this._noiseBurst({
          duration: 0.13,
          gain: 0.075 + intensity * 0.03,
          frequency: 1650,
          q: 2.2,
        });
        this._tone({
          frequency: 330,
          endFrequency: 220,
          duration: 0.1,
          gain: 0.035,
          type: 'square',
        });
      });
      this._haptic({
        weakMagnitude: 0.28,
        strongMagnitude: 0.22,
        durationMs: 65,
        reason: 'kick-turn',
      });
      return;
    }

    this._assetOr('sfx.copingHit', () => {
      this._noiseBurst({
        duration: 0.07,
        gain: 0.06 + intensity * 0.05,
        frequency: 1900,
        q: 2.6,
      });
      this._tone({
        frequency: 420,
        endFrequency: 300,
        duration: 0.055,
        gain: 0.025,
        type: 'square',
      });
    });
    this._haptic({
      weakMagnitude: 0.12,
      strongMagnitude: 0.18 + intensity * 0.18,
      durationMs: 42,
      reason: 'coping-hit',
    });
  }

  _takeoffCue(event) {
    if (!this._allowed('takeoff', 0.1)) return;
    const intensity = clamp01(
      eventValue(event, 'intensity', 'speed') ?? 0.55,
    );

    this._assetOr('sfx.takeoff', () => {
      this._noiseBurst({
        duration: 0.075,
        gain: 0.045 + intensity * 0.04,
        frequency: 820,
      });
      this._tone({
        frequency: 150,
        endFrequency: 230,
        duration: 0.07,
        gain: 0.035 + intensity * 0.015,
        type: 'triangle',
      });
    }, { gain: 0.65 + intensity * 0.35, rate: 1.04 - intensity * 0.08 });

    this._haptic({
      weakMagnitude: 0.18 + intensity * 0.12,
      strongMagnitude: 0.06,
      durationMs: 42,
      reason: 'takeoff',
    });
  }

  _landingCue(event) {
    if (!this._allowed('landing', COOLDOWNS.landing)) return;

    const rating = normalizeType(
      eventValue(event, 'rating', 'quality', 'grade'),
    ) || 'CLEAN';
    // LANDING.impact is velocity in game units, not a normalized gain.
    // Clamping it directly made nearly every landing sound equally hard.
    const explicitIntensity = eventValue(event, 'intensity', 'impactIntensity');
    const impactSpeed = Number(eventValue(event, 'impact'));
    const intensity = clamp01(explicitIntensity
      ?? (Number.isFinite(impactSpeed) ? impactSpeed / 20 : 0.55));

    if (rating === 'BAIL') {
      this._bailCue(event);
      return;
    }

    const keyByRating = {
      PERFECT: 'sfx.landingPerfect',
      CLEAN: 'sfx.landingClean',
      SKETCHY: 'sfx.landingSketchy',
      HEAVY: 'sfx.landingHeavy',
    };
    const key = keyByRating[rating] || keyByRating.CLEAN;

    this._assetOr(key, () => {
      this.skate?.playDeckImpact(intensity);
    }, { gain: 0.55 + intensity * 0.6, rate: 1.04 - intensity * 0.1 });

    const strong = (
      rating === 'HEAVY'
        ? 0.48 + intensity * 0.4
        : 0.15 + intensity * 0.28
    );

    this._haptic({
      weakMagnitude: 0.18 + intensity * 0.25,
      strongMagnitude: strong,
      durationMs: rating === 'HEAVY' ? 110 : 70,
      reason: 'landing-' + rating.toLowerCase(),
    });
  }

  _bailCue(event) {
    if (!this._allowed('bail', COOLDOWNS.bail)) return;
    // The skater never falls: use a brief deck/wheel stumble, no body slam,
    // synthetic crowd vowel or emergency sound.
    this.skate?.playDeckImpact(0.45, { gainScale: 0.75 });
    this._noiseBurst({ duration: 0.075, gain: 0.025, frequency: 1850, q: 0.7 });
    this._haptic({ weakMagnitude: 0.2, strongMagnitude: 0.15, durationMs: 55, reason: 'missed-trick' });
  }

  _scoreCue(event) {
    if (!this._allowed('score', COOLDOWNS.score)) return;

    const points = Math.max(
      0,
      Number(eventValue(event, 'points', 'scoreDelta', 'value')) || 0,
    );
    const lift = clamp01(points / 1000);

    this._assetOr('sfx.scoreConfirm', () => {
      this._tone({
        frequency: 440 + lift * 100,
        endFrequency: 560 + lift * 160,
        duration: 0.075,
        gain: 0.03 + lift * 0.015,
        type: 'sine',
      });
    });
  }

  _comboCue(event) {
    const multiplier = Math.max(
      1,
      Number(eventValue(event, 'multiplier', 'combo', 'value')) || 1,
    );

    if (multiplier <= this.lastComboMultiplier) {
      this.lastComboMultiplier = multiplier;
      return;
    }
    this.lastComboMultiplier = multiplier;

    if (!this._allowed('combo', COOLDOWNS.combo)) return;
    const step = Math.min(6, Math.max(0, multiplier - 1));

    this._assetOr('sfx.comboTick', () => {
      this._tone({
        frequency: 500 + step * 70,
        endFrequency: 575 + step * 82,
        duration: 0.055,
        gain: 0.025,
        type: 'sine',
      });
    });
  }

  _countdownCue(event) {
    if (!this._allowed('countdown', COOLDOWNS.countdown)) return;

    const raw = eventValue(event, 'value', 'count', 'label', 'step');
    const value = normalizeType(raw);
    const isGo = value === 'GO' || Number(raw) === 0;

    if (isGo) {
      this._assetOr('sfx.countdownGo', () => {
        this._tone({
          frequency: 440,
          endFrequency: 660,
          duration: 0.22,
          gain: 0.075,
          type: 'triangle',
        });
      });
      return;
    }

    const count = Math.max(1, Math.min(3, Number(raw) || 1));
    this._assetOr('sfx.countdown', () => {
      this._tone({
        frequency: 280 + (3 - count) * 35,
        duration: 0.1,
        gain: 0.05,
        type: 'sine',
      });
    });
  }

  _timerCue(seconds) {
    const second = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (![10, 5, 3, 2, 1].includes(second)) return;
    if (this.timerWarningsPlayed.has(second)) return;
    if (!this._allowed('timer-' + second, COOLDOWNS.timer)) return;

    this.timerWarningsPlayed.add(second);
    this._assetOr('sfx.timerWarning', () => {
      const urgent = second <= 3;
      this._tone({
        frequency: urgent ? 510 : 390,
        duration: urgent ? 0.065 : 0.085,
        gain: urgent ? 0.035 : 0.028,
        type: 'sine',
      });
    });
  }

  _sessionEndCue() {
    if (!this._allowed('session-end', 1)) return;

    this._assetOr('sfx.sessionEnd', () => {
      this._tone({
        frequency: 520,
        endFrequency: 390,
        duration: 0.2,
        gain: 0.055,
        type: 'triangle',
      });
      this._tone({
        frequency: 390,
        endFrequency: 300,
        duration: 0.26,
        gain: 0.04,
        type: 'triangle',
        delay: 0.12,
      });
    });

    this.stopMusic({ fadeSeconds: 0.45 });
    void this.playMusic('results', { fadeSeconds: 0.55 });
  }

  handleEvent(event) {
    if (!event || this.disposed) return false;

    const type = normalizeType(
      event.type || event.name || event.event,
    );
    if (!type) return false;

    switch (type) {
      case 'PUMP_RATING':
        this._pumpCue(event);
        break;
      case 'COPING_HIT':
        this._copingCue(event);
        break;
      case 'TAKEOFF':
        this._takeoffCue(event);
        break;
      case 'AIR_APEX':
        if (this._allowed('air-apex', 0.18)) {
          this._noiseBurst({
            duration: 0.08,
            gain: 0.018,
            frequency: 1100,
            q: 0.7,
          });
        }
        break;
      case 'TRICK_STARTED': {
        const trick = normalizeType(
          eventValue(event, 'trickType', 'trick', 'name'),
        );
        if (trick === 'HAND_PLANT' || trick === 'HANDPLANT') {
          this._copingCue({ ...event, action: 'HAND_PLANT' });
        } else if (trick === 'KICK_TURN' || trick === 'KICKTURN') {
          this._copingCue({ ...event, action: 'KICK_TURN' });
        }
        break;
      }
      case 'TRICK_COMPLETED':
        this._scoreCue(event);
        break;
      case 'TRICK_FAILED':
        if (this._allowed('trick-failed', 0.2)) {
          this._noiseBurst({
            duration: 0.07,
            gain: 0.025,
            frequency: 420,
            type: 'lowpass',
            q: 0.5,
          });
        }
        break;
      case 'LANDING':
        this._landingCue(event);
        break;
      case 'BAIL':
      case 'CRASH':
        this._bailCue(event);
        break;
      case 'COMBO_CHANGED':
        this._comboCue(event);
        break;
      case 'COUNTDOWN':
        this._countdownCue(event);
        break;
      case 'TIMER_WARNING':
        this._timerCue(
          eventValue(event, 'seconds', 'remaining', 'value'),
        );
        break;
      case 'SESSION_FINISHED':
        this._sessionEndCue();
        break;
      default:
        return false;
    }

    return true;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.skate?.setPaused(this.paused);
    return this.paused;
  }

  update(state = {}, dt = 1 / 60) {
    if (this.disposed) return;

    if (this.isReady) {
      this.skate?.setPaused(this.paused);
      this.skate?.update(state, dt);
    }

    const remaining = Number(
      state.sessionRemaining
      ?? state.remaining
      ?? state.session?.remaining,
    );

    if (!Number.isFinite(remaining)) return;

    if (
      this.lastRemaining !== null
      && remaining > this.lastRemaining + 1
    ) {
      this.timerWarningsPlayed.clear();
    }

    for (const threshold of [10, 5, 3, 2, 1]) {
      if (
        this.lastRemaining !== null
        && this.lastRemaining > threshold
        && remaining <= threshold
      ) {
        this._timerCue(threshold);
      }
    }

    this.lastRemaining = remaining;
  }

  async playMusic(name, { fadeSeconds = 0.45, restart = false } = {}) {
    if (!this.isReady) return false;
    if (this.currentMusic?.name === name && !restart) return true;

    const descriptor = this.manifest.music?.[name];
    if (!descriptor) return false;

    const key = 'music.' + name;
    let buffer = this.buffers.get(key);
    if (
      !buffer
      && descriptor.placeholder === 'procedural-32bit-hard-rock'
      && this.context
    ) {
      this.proceduralRockBuffer ||= createProceduralRockBuffer(this.context);
      buffer = this.proceduralRockBuffer;
      this.buffers.set(key, buffer);
    } else if (!buffer && descriptor.url) {
      try {
        buffer = await this._loadBuffer(key, descriptor.url);
      } catch {
        return false;
      }
    }

    if (!buffer || !this.isReady) return false;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const fade = Math.max(0.01, Number(fadeSeconds) || 0.45);
    const target = Math.max(0, Number(descriptor.gain ?? 1));

    source.buffer = buffer;
    source.loop = descriptor.loop !== false;
    gain.gain.value = 0.0001;
    source.connect(gain).connect(this.buses.MUSIC.gain);
    source.start();
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, target),
      this.context.currentTime + fade,
    );

    const old = this.currentMusic;
    this.currentMusic = { name, source, gain };
    this.musicVoices.add(this.currentMusic);
    if (old) this._fadeAndStopVoice(old, fade);

    return true;
  }

  stopMusic({ fadeSeconds = 0.35 } = {}) {
    const voice = this.currentMusic;
    this.currentMusic = null;
    if (!voice || !this.context) return false;

    this._fadeAndStopVoice(voice, fadeSeconds);
    return true;
  }

  _fadeAndStopVoice(voice, fadeSeconds) {
    if (!voice || !this.context) return;

    const fade = Math.max(0.01, Number(fadeSeconds) || 0.2);
    const now = this.context.currentTime;

    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, fade / 3);
      voice.source.stop(now + fade + 0.05);
    } catch {}

    voice.source.addEventListener('ended', () => {
      this.musicVoices.delete(voice);
      try { voice.source.disconnect(); } catch {}
      try { voice.gain.disconnect(); } catch {}
    }, { once: true });
  }

  async playAmbience(name, { gain = 1 } = {}) {
    if (!this.isReady) return false;
    if (this.ambienceVoices.has(name)) return true;

    const descriptor = this.manifest.ambience?.[name];
    if (!descriptor?.url) return false;

    const key = 'ambience.' + name;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      try {
        buffer = await this._loadBuffer(key, descriptor.url);
      } catch {
        return false;
      }
    }

    if (!buffer || !this.isReady) return false;

    const source = this.context.createBufferSource();
    const voiceGain = this.context.createGain();
    source.buffer = buffer;
    source.loop = descriptor.loop !== false;
    voiceGain.gain.value = Math.max(
      0,
      (descriptor.gain ?? 1) * gain,
    );
    source.connect(voiceGain).connect(this.buses.AMBIENCE.gain);
    source.start();

    this.ambienceVoices.set(name, {
      source,
      gain: voiceGain,
    });
    return true;
  }

  stopAmbience(name, { fadeSeconds = 0.3 } = {}) {
    const voice = this.ambienceVoices.get(name);
    if (!voice || !this.context) return false;

    this.ambienceVoices.delete(name);
    const now = this.context.currentTime;
    const fade = Math.max(0.01, Number(fadeSeconds) || 0.3);

    try {
      voice.gain.gain.setTargetAtTime(0.0001, now, fade / 3);
      voice.source.stop(now + fade + 0.05);
    } catch {}

    return true;
  }

  setMasterVolume(value) {
    this.volumes.master = clampAudioVolume(value);
    this.buses?.MASTER?.setVolume(
      this.muted ? 0 : this.volumes.master,
    );
    return this.volumes.master;
  }

  setMusicVolume(value) {
    this.volumes.music = clampAudioVolume(value);
    this.buses?.MUSIC?.setVolume(this.volumes.music);
    return this.volumes.music;
  }

  setSfxVolume(value) {
    this.volumes.sfx = clampAudioVolume(value);
    this.buses?.SFX?.setVolume(this.volumes.sfx);
    return this.volumes.sfx;
  }

  setAmbienceVolume(value) {
    this.volumes.ambience = clampAudioVolume(value);
    this.buses?.AMBIENCE?.setVolume(this.volumes.ambience);
    return this.volumes.ambience;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.buses?.MASTER?.setVolume(
      this.muted ? 0 : this.volumes.master,
      0.02,
    );
    return this.muted;
  }

  setVibrationEnabled(enabled) {
    this.vibrationEnabled = Boolean(enabled);
    return this.vibrationEnabled;
  }

  resetSessionAudioState() {
    this.lastComboMultiplier = 1;
    this.timerWarningsPlayed.clear();
    this.lastRemaining = null;
    this.cooldowns.clear();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.skate?.dispose();
    this.skate = null;

    for (const voice of this.musicVoices) {
      try { voice.source.stop(); } catch {}
      try { voice.source.disconnect(); } catch {}
      try { voice.gain.disconnect(); } catch {}
    }
    this.musicVoices.clear();

    for (const voice of this.ambienceVoices.values()) {
      try { voice.source.stop(); } catch {}
      try { voice.source.disconnect(); } catch {}
      try { voice.gain.disconnect(); } catch {}
    }
    this.ambienceVoices.clear();

    for (const bus of Object.values(this.buses || {})) {
      bus.dispose();
    }
    this.buses = null;

    try { this.masterGain?.disconnect(); } catch {}
    try { this.limiter?.disconnect(); } catch {}

    this.buffers.clear();
    this.loading.clear();
    this.cooldowns.clear();
    this.proceduralRockBuffer = null;

    if (
      this.ownsContext
      && this.context
      && this.context.state !== 'closed'
    ) {
      try {
        await this.context.close();
      } catch {}
    }

    this.context = null;
    this.unlocked = false;
  }
}
