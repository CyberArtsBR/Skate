const VERTICAL_KEYS = new Map([
  ['ArrowUp', 1],
  ['KeyW', 1],
  ['ArrowDown', -1],
  ['KeyS', -1],
]);

const HORIZONTAL_KEYS = new Map([
  ['ArrowLeft', -1],
  ['KeyA', -1],
  ['ArrowRight', 1],
  ['KeyD', 1],
]);

const GAMEPAD_BUTTON = Object.freeze({
  primary: 0,   // Xbox A / PlayStation Cross
  secondary: 1, // Xbox B / PlayStation Circle
  back: 8,      // Xbox View / PlayStation Share
  start: 9,     // Xbox Menu / PlayStation Options
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
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
    this.keyboardTurnIntent = 0;
    this.gamepadIntent = 0;
    this.gamepadTurnIntent = 0;
    this.intent = 0;
    this.turnIntent = 0;
    this.keyboardHandPlantHeld = false;
    this.gamepadHandPlantHeld = false;
    this.handPlantHeld = false;
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
      const gameplayKey = VERTICAL_KEYS.has(event.code)
        || HORIZONTAL_KEYS.has(event.code)
        || event.code === 'KeyK';
      if (!gameplayKey) return;

      this.keys.add(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    this._onKeyUp = (event) => {
      const gameplayKey = VERTICAL_KEYS.has(event.code)
        || HORIZONTAL_KEYS.has(event.code)
        || event.code === 'KeyK';
      if (!gameplayKey) return;

      this.keys.delete(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp, { passive: false });
  }

  _axisFromKeys(map) {
    let negative = false;
    let positive = false;
    for (const code of this.keys) {
      const direction = map.get(code);
      if (direction < 0) negative = true;
      if (direction > 0) positive = true;
    }
    return negative === positive ? 0 : positive ? 1 : -1;
  }

  _refreshKeyboard() {
    this.keyboardIntent = this._axisFromKeys(VERTICAL_KEYS);
    this.keyboardTurnIntent = this._axisFromKeys(HORIZONTAL_KEYS);
    this.keyboardHandPlantHeld = this.keys.has('KeyK');
    this.handPlantHeld = this.keyboardHandPlantHeld || this.gamepadHandPlantHeld;
    this._refreshIntent();
  }

  _refreshIntent() {
    this.intent = this.keyboardIntent || this.gamepadIntent;
    this.turnIntent = this.keyboardTurnIntent || this.gamepadTurnIntent;
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
      this.gamepadTurnIntent = 0;
      this.gamepadHandPlantHeld = false;
      this.handPlantHeld = this.keyboardHandPlantHeld;
      this._queueEdge('primary', false);
      this._queueEdge('start', false);
      this._queueEdge('back', false);
      return this._refreshIntent();
    }

    this.gamepadConnected = true;
    this.gamepadId = String(activePad.id || 'Gamepad');

    const dpadUp = buttonPressed(activePad, GAMEPAD_BUTTON.dpadUp);
    const dpadDown = buttonPressed(activePad, GAMEPAD_BUTTON.dpadDown);
    const dpadLeft = buttonPressed(activePad, GAMEPAD_BUTTON.dpadLeft);
    const dpadRight = buttonPressed(activePad, GAMEPAD_BUTTON.dpadRight);
    const stickX = Number(activePad.axes?.[0]) || 0;
    const stickY = Number(activePad.axes?.[1]) || 0;

    if (dpadUp !== dpadDown) {
      this.gamepadIntent = dpadUp ? 1 : -1;
    } else {
      this.gamepadIntent = clampIntent(-stickY);
    }

    if (dpadLeft !== dpadRight) {
      this.gamepadTurnIntent = dpadRight ? 1 : -1;
    } else {
      this.gamepadTurnIntent = clampIntent(stickX);
    }

    this.gamepadHandPlantHeld = buttonPressed(activePad, GAMEPAD_BUTTON.secondary);
    this.handPlantHeld = this.keyboardHandPlantHeld || this.gamepadHandPlantHeld;

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
      turnIntent: this.turnIntent,
      handPlantHeld: this.handPlantHeld,
      keyboardHandPlantHeld: this.keyboardHandPlantHeld,
      gamepadHandPlantHeld: this.gamepadHandPlantHeld,
      keyboardIntent: this.keyboardIntent,
      keyboardTurnIntent: this.keyboardTurnIntent,
      gamepadIntent: this.gamepadIntent,
      gamepadTurnIntent: this.gamepadTurnIntent,
      gamepadConnected: this.gamepadConnected,
      gamepadId: this.gamepadId,
    };
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.keyboardIntent = 0;
    this.keyboardTurnIntent = 0;
    this.gamepadIntent = 0;
    this.gamepadTurnIntent = 0;
    this.intent = 0;
    this.turnIntent = 0;
    this.keyboardHandPlantHeld = false;
    this.gamepadHandPlantHeld = false;
    this.handPlantHeld = false;
    this.gamepadConnected = false;
    this.gamepadId = '';
  }
}
