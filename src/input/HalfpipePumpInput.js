const KEY_INTENTS = new Map([
  ['ArrowUp', 1],
  ['KeyW', 1],
  ['ArrowDown', -1],
  ['KeyS', -1],
]);

const GAMEPAD_BUTTON = Object.freeze({
  primary: 0, // Xbox A / PlayStation Cross
  back: 8,    // Xbox View / PlayStation Share
  start: 9,   // Xbox Menu / PlayStation Options
  dpadUp: 12,
  dpadDown: 13,
});

function clampIntent(value) {
  if (value > 0.25) return 1;
  if (value < -0.25) return -1;
  return 0;
}

function buttonPressed(pad, index) {
  return Boolean(pad?.buttons?.[index]?.pressed);
}

export class HalfpipePumpInput {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.keyboardIntent = 0;
    this.gamepadIntent = 0;
    this.intent = 0;
    this.gamepadConnected = false;
    this.gamepadId = '';

    this._previousGamepadButtons = {
      primary: false,
      start: false,
      back: false,
    };
    this._queuedActions = {
      confirm: false,
      pause: false,
      reset: false,
    };

    this._onKeyDown = (event) => {
      if (!KEY_INTENTS.has(event.code)) return;
      this.keys.add(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    this._onKeyUp = (event) => {
      if (!KEY_INTENTS.has(event.code)) return;
      this.keys.delete(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp, { passive: false });
  }

  _refreshKeyboard() {
    let up = false;
    let down = false;
    for (const code of this.keys) {
      const intent = KEY_INTENTS.get(code);
      if (intent > 0) up = true;
      if (intent < 0) down = true;
    }
    this.keyboardIntent = up === down ? 0 : up ? 1 : -1;
    this._refreshIntent();
  }

  _refreshIntent() {
    this.intent = this.keyboardIntent || this.gamepadIntent;
    return this.intent;
  }

  _queueEdge(action, pressed) {
    const previous = this._previousGamepadButtons[action];
    if (pressed && !previous) {
      if (action === 'primary') this._queuedActions.confirm = true;
      if (action === 'start') this._queuedActions.pause = true;
      if (action === 'back') this._queuedActions.reset = true;
    }
    this._previousGamepadButtons[action] = pressed;
  }

  pollGamepad(padsOverride = null) {
    const pads = padsOverride || globalThis.navigator?.getGamepads?.() || [];
    let activePad = null;

    for (const pad of pads) {
      if (pad?.connected) {
        activePad = pad;
        break;
      }
    }

    if (!activePad) {
      this.gamepadConnected = false;
      this.gamepadId = '';
      this.gamepadIntent = 0;
      this._queueEdge('primary', false);
      this._queueEdge('start', false);
      this._queueEdge('back', false);
      return this._refreshIntent();
    }

    this.gamepadConnected = true;
    this.gamepadId = String(activePad.id || 'Gamepad');

    const dpadUp = buttonPressed(activePad, GAMEPAD_BUTTON.dpadUp);
    const dpadDown = buttonPressed(activePad, GAMEPAD_BUTTON.dpadDown);
    const stickY = Number(activePad.axes?.[1]) || 0;

    if (dpadUp !== dpadDown) {
      this.gamepadIntent = dpadUp ? 1 : -1;
    } else {
      // Standard browser Gamepad API: left-stick Y is negative when pushed up.
      this.gamepadIntent = clampIntent(-stickY);
    }

    this._queueEdge('primary', buttonPressed(activePad, GAMEPAD_BUTTON.primary));
    this._queueEdge('start', buttonPressed(activePad, GAMEPAD_BUTTON.start));
    this._queueEdge('back', buttonPressed(activePad, GAMEPAD_BUTTON.back));

    return this._refreshIntent();
  }

  consumeActions() {
    const actions = { ...this._queuedActions };
    this._queuedActions.confirm = false;
    this._queuedActions.pause = false;
    this._queuedActions.reset = false;
    return actions;
  }

  snapshot() {
    return {
      intent: this.intent,
      keyboardIntent: this.keyboardIntent,
      gamepadIntent: this.gamepadIntent,
      gamepadConnected: this.gamepadConnected,
      gamepadId: this.gamepadId,
    };
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.keyboardIntent = 0;
    this.gamepadIntent = 0;
    this.intent = 0;
    this.gamepadConnected = false;
    this.gamepadId = '';
  }
}
