const KEY_INTENTS = new Map([
  ['ArrowUp', 1],
  ['KeyW', 1],
  ['ArrowDown', -1],
  ['KeyS', -1],
]);

function clampIntent(value) {
  if (value > 0.25) return 1;
  if (value < -0.25) return -1;
  return 0;
}

export class HalfpipePumpInput {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.keyboardIntent = 0;
    this.gamepadIntent = 0;
    this.intent = 0;

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

  pollGamepad() {
    const pads = globalThis.navigator?.getGamepads?.() || [];
    let nextIntent = 0;

    for (const pad of pads) {
      if (!pad?.connected) continue;

      const dpadUp = Boolean(pad.buttons?.[12]?.pressed);
      const dpadDown = Boolean(pad.buttons?.[13]?.pressed);
      const stickY = Number(pad.axes?.[1]) || 0;

      if (dpadUp !== dpadDown) {
        nextIntent = dpadUp ? 1 : -1;
      } else {
        // Browser gamepad Y is negative when the stick is pushed up.
        nextIntent = clampIntent(-stickY);
      }

      if (nextIntent) break;
    }

    this.gamepadIntent = nextIntent;
    return this._refreshIntent();
  }

  snapshot() {
    return {
      intent: this.intent,
      keyboardIntent: this.keyboardIntent,
      gamepadIntent: this.gamepadIntent,
    };
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.keys.clear();
    this.keyboardIntent = 0;
    this.gamepadIntent = 0;
    this.intent = 0;
  }
}
