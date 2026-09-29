export class HalfpipeSession {
  constructor({ durationSeconds = 75 } = {}) {
    this.durationSeconds = Math.max(1, Number(durationSeconds) || 75);
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.elapsed = 0;
    this.remaining = this.durationSeconds;
    this.score = 0;
    return this.snapshot();
  }

  beginCountdown() {
    if (this.phase !== 'ready') return false;
    this.phase = 'countdown';
    return true;
  }

  completeCountdown() {
    if (this.phase !== 'countdown') return false;
    this.phase = 'running';
    return true;
  }

  start() {
    if (this.phase === 'finished') return false;
    if (this.phase === 'countdown') return this.completeCountdown();
    if (this.phase !== 'running') this.phase = 'running';
    return true;
  }

  pause() {
    if (this.phase === 'running') {
      this.phase = 'paused';
      return true;
    }
    return false;
  }

  resume() {
    if (this.phase === 'paused') {
      this.phase = 'running';
      return true;
    }
    return false;
  }

  togglePause() {
    if (this.phase === 'running') return this.pause();
    if (this.phase === 'paused') return this.resume();
    return false;
  }

  finish() {
    this.elapsed = this.durationSeconds;
    this.remaining = 0;
    this.phase = 'finished';
    return this.snapshot();
  }

  setScore(score) {
    this.score = Math.max(0, Math.round(Number(score) || 0));
    return this.score;
  }

  step(dt) {
    if (this.phase !== 'running') return this.snapshot();

    const delta = Math.max(0, Number(dt) || 0);
    this.elapsed = Math.min(this.durationSeconds, this.elapsed + delta);
    this.remaining = Math.max(0, this.durationSeconds - this.elapsed);

    if (this.remaining <= 0) this.finish();
    return this.snapshot();
  }

  snapshot() {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      remaining: this.remaining,
      duration: this.durationSeconds,
      score: this.score,
    };
  }
}

export function formatSessionTime(seconds) {
  const clamped = Math.max(0, Number(seconds) || 0);
  const whole = Math.ceil(clamped);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return minutes + ':' + String(remainder).padStart(2, '0');
}
