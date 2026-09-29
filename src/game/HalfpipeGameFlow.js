export const HALFPIPE_FLOW_STATE = Object.freeze({
  TITLE: 'title',
  CHARACTER_SELECT: 'character-select',
  CONTROLS: 'controls',
  COUNTDOWN: 'countdown',
  RUN: 'run',
  PAUSE: 'pause',
  RESULTS: 'results',
});

const ALLOWED = Object.freeze({
  title: new Set(['character-select', 'controls', 'countdown']),
  'character-select': new Set(['title', 'controls', 'countdown']),
  controls: new Set(['title', 'character-select', 'countdown', 'pause']),
  countdown: new Set(['run', 'title']),
  run: new Set(['pause', 'results', 'title']),
  pause: new Set(['run', 'controls', 'countdown', 'title']),
  results: new Set(['countdown', 'character-select', 'title']),
});

const DEFAULT_SETTINGS = Object.freeze({
  reducedCameraMotion: false,
  highContrastHud: false,
  uiScale: 1,
  controllerVibration: true,
  audioVolume: 1,
});

export class HalfpipeGameFlow {
  constructor({
    initialState = HALFPIPE_FLOW_STATE.TITLE,
    callbacks = {},
    settings = {},
  } = {}) {
    this.state = initialState;
    this.previousState = null;
    this.callbacks = { ...callbacks };
    this.listeners = new Set();
    this.settings = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      ...settings,
    });
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    return this;
  }

  canTransitionTo(nextState) {
    if (nextState === this.state) return true;
    return Boolean(ALLOWED[this.state]?.has(nextState));
  }

  transitionTo(nextState, detail = {}) {
    if (!ALLOWED[nextState] && nextState !== HALFPIPE_FLOW_STATE.TITLE) {
      throw new Error('Unknown halfpipe flow state: ' + nextState);
    }
    if (!this.canTransitionTo(nextState)) return false;

    const previous = this.state;
    this.previousState = previous;
    this.state = nextState;

    const payload = {
      previous,
      state: nextState,
      detail: { ...detail },
    };

    this.callbacks.onTransition?.(payload);
    this.callbacks[stateCallbackName(nextState)]?.(payload);
    for (const listener of this.listeners) listener(payload);
    return true;
  }

  setSettings(patch = {}) {
    const previous = { ...this.settings };
    this.settings = sanitizeSettings({
      ...this.settings,
      ...patch,
    });

    const payload = {
      previous,
      settings: { ...this.settings },
      changed: Object.keys(this.settings).filter(
        (key) => this.settings[key] !== previous[key],
      ),
    };

    if (payload.changed.length) {
      this.callbacks.onSettingsChange?.(payload);
      if (payload.changed.includes('reducedCameraMotion')) {
        this.callbacks.onReducedCameraMotionChange?.(
          this.settings.reducedCameraMotion,
        );
      }
      if (payload.changed.includes('controllerVibration')) {
        this.callbacks.onControllerVibrationChange?.(
          this.settings.controllerVibration,
        );
      }
      if (payload.changed.includes('audioVolume')) {
        this.callbacks.onAudioVolumeChange?.(this.settings.audioVolume);
      }
      if (
        payload.changed.includes('highContrastHud')
        || payload.changed.includes('uiScale')
      ) {
        this.callbacks.onHudAccessibilityChange?.({
          highContrast: this.settings.highContrastHud,
          uiScale: this.settings.uiScale,
        });
      }
    }

    return { ...this.settings };
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return {
      state: this.state,
      previousState: this.previousState,
      settings: { ...this.settings },
    };
  }
}

function stateCallbackName(state) {
  const suffix = state
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  return 'on' + suffix;
}

function sanitizeSettings(settings) {
  return {
    reducedCameraMotion: Boolean(settings.reducedCameraMotion),
    highContrastHud: Boolean(settings.highContrastHud),
    uiScale: Math.max(0.85, Math.min(1.5, Number(settings.uiScale) || 1)),
    controllerVibration: settings.controllerVibration !== false,
    audioVolume: Math.max(0, Math.min(1, Number(settings.audioVolume) || 0)),
  };
}
