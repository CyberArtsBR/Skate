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
  pause: new Set(['run', 'controls', 'title']),
  results: new Set(['countdown', 'character-select', 'title']),
});

export class HalfpipeGameFlow {
  constructor({
    initialState = HALFPIPE_FLOW_STATE.TITLE,
    callbacks = {},
  } = {}) {
    this.state = initialState;
    this.previousState = null;
    this.callbacks = { ...callbacks };
    this.listeners = new Set();
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

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return {
      state: this.state,
      previousState: this.previousState,
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
