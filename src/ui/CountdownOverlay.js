export class CountdownTimer {
  constructor({
    countFrom = 3,
    stepSeconds = 1,
    goSeconds = 0.65,
    onTick = null,
    onGo = null,
    onComplete = null,
  } = {}) {
    this.countFrom = Math.max(1, Math.floor(Number(countFrom) || 3));
    this.stepSeconds = Math.max(0.1, Number(stepSeconds) || 1);
    this.goSeconds = Math.max(0, Number(goSeconds) || 0.65);
    this.onTick = onTick;
    this.onGo = onGo;
    this.onComplete = onComplete;
    this.reset();
  }

  reset() {
    this.running = false;
    this.elapsed = 0;
    this.lastLabel = null;
    this.complete = false;
    return this.snapshot();
  }

  start() {
    this.reset();
    this.running = true;
    this._emitLabel(String(this.countFrom));
    return this.snapshot();
  }

  step(dt) {
    if (!this.running || this.complete) return this.snapshot();

    this.elapsed += Math.max(0, Number(dt) || 0);
    const countdownDuration = this.countFrom * this.stepSeconds;

    if (this.elapsed < countdownDuration) {
      const index = Math.min(
        this.countFrom - 1,
        Math.floor(this.elapsed / this.stepSeconds),
      );
      this._emitLabel(String(this.countFrom - index));
      return this.snapshot();
    }

    if (this.elapsed < countdownDuration + this.goSeconds) {
      this._emitLabel('GO');
      return this.snapshot();
    }

    this.running = false;
    this.complete = true;
    this.onComplete?.(this.snapshot());
    return this.snapshot();
  }

  _emitLabel(label) {
    if (label === this.lastLabel) return;
    this.lastLabel = label;
    if (label === 'GO') this.onGo?.(label);
    else this.onTick?.(Number(label));
  }

  snapshot() {
    return {
      running: this.running,
      elapsed: this.elapsed,
      label: this.lastLabel,
      complete: this.complete,
    };
  }
}

export class CountdownOverlay {
  constructor(stage, options = {}) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui-layer countdown-overlay';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'assertive');

    this.label = document.createElement('strong');
    this.label.className = 'countdown-label';
    this.root.append(this.label);
    stage.append(this.root);

    this.onComplete = options.onComplete;
    this.timer = new CountdownTimer({
      ...options,
      onTick: (value) => {
        this._showLabel(String(value));
        options.onTick?.(value);
      },
      onGo: () => {
        this._showLabel('GO');
        options.onGo?.();
      },
      onComplete: (snapshot) => {
        this.hide();
        this.onComplete?.(snapshot);
      },
    });
  }

  start() {
    this.root.hidden = false;
    this.root.classList.remove('is-go', 'is-prompt');
    const snapshot = this.timer.start();
    this._showLabel(snapshot.label || '3');
    return snapshot;
  }

  showPrompt(label = 'Press to Start') {
    this.timer.reset();
    this.root.hidden = false;
    this.root.classList.remove('is-go');
    this.root.classList.add('is-prompt');
    this._showLabel(label);
    return {
      running: false,
      elapsed: 0,
      label,
      complete: false,
      prompt: true,
    };
  }

  completePrompt() {
    if (this.root.hidden || !this.root.classList.contains('is-prompt')) return false;
    const snapshot = {
      ...this.timer.snapshot(),
      label: this.label.textContent,
      complete: true,
      prompt: true,
    };
    this.hide();
    this.onComplete?.(snapshot);
    return true;
  }

  step(dt) {
    const snapshot = this.timer.step(dt);
    if (snapshot.label === 'GO') this.root.classList.add('is-go');
    return snapshot;
  }

  hide() {
    this.root.hidden = true;
    this.root.classList.remove('is-go', 'is-prompt');
  }

  dispose() {
    this.root.remove();
  }

  _showLabel(label) {
    this.label.textContent = label;
    this.root.hidden = false;
  }
}
