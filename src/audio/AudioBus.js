const DEFAULT_RAMP_SECONDS = 0.025;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export class AudioBus {
  constructor(context, { name = 'BUS', destination, volume = 1 } = {}) {
    if (!context) throw new TypeError('AudioBus requires an AudioContext');
    if (!destination) throw new TypeError('AudioBus requires a destination AudioNode');

    this.context = context;
    this.name = name;
    this.volume = clamp01(volume);
    this.gain = context.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(destination);
    this.disposed = false;
  }

  setVolume(value, rampSeconds = DEFAULT_RAMP_SECONDS) {
    this.volume = clamp01(value);
    if (this.disposed) return this.volume;

    const now = this.context.currentTime;
    const ramp = Math.max(0, Number(rampSeconds) || 0);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(this.volume, now, Math.max(0.001, ramp));
    return this.volume;
  }

  connect(node) {
    if (this.disposed || !node) return false;
    this.gain.connect(node);
    return true;
  }

  disconnect() {
    if (this.disposed) return;
    this.gain.disconnect();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.disconnect();
  }
}

export function clampAudioVolume(value) {
  return clamp01(value);
}
