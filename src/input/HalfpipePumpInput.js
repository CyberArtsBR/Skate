import { detectControllerFamily } from '../ui/ControllerGlyphs.js';

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

const BACKFLIP_KEYS = new Set(['Space', 'KeyJ', 'KeyK', 'KeyL']);

const GAMEPAD_BUTTON = Object.freeze({
  primary: 0,
  secondary: 1,
  tertiary: 2,
  quaternary: 3,
  back: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
});

const RELEVANT_BUTTONS = Object.values(GAMEPAD_BUTTON);

function clampIntent(value, deadzone = 0.25) {
  if (value > deadzone) return 1;
  if (value < -deadzone) return -1;
  return 0;
}

function buttonPressed(pad, index) {
  return Boolean(pad?.buttons?.[index]?.pressed);
}

function padKey(pad, fallbackIndex) {
  const index = Number.isInteger(pad?.index) ? pad.index : fallbackIndex;
  return index;
}

function activitySignature(pad, deadzone) {
  const axes = Array.from(pad?.axes || [], (value) => {
    const number = Number(value) || 0;
    return Math.abs(number) > deadzone ? Math.round(number * 20) / 20 : 0;
  });
  const buttons = RELEVANT_BUTTONS.map((index) => buttonPressed(pad, index) ? 1 : 0);
  const active = axes.some(Boolean) || buttons.some(Boolean);
  return {
    active,
    signature: axes.join(',') + '|' + buttons.join(''),
  };
}

export class HalfpipePumpInput {
  constructor(target = globalThis.window, {
    documentTarget = globalThis.document,
    deadzone = 0.25,
    resetHoldSeconds = 1,
    onPauseRequest = null,
    onResetHoldProgress = null,
  } = {}) {
    this.target = target;
    this.documentTarget = documentTarget;
    this.deadzone = Math.max(0.05, Math.min(0.8, Number(deadzone) || 0.25));
    this.resetHoldSeconds = Math.max(0.5, Number(resetHoldSeconds) || 1);
    this.onPauseRequest = onPauseRequest;
    this.onResetHoldProgress = onResetHoldProgress;

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
    this.keyboardBackflipHeld = false;
    this.gamepadBackflipHeld = false;
    this.backflipHeld = false;

    this.gamepadConnected = false;
    this.gamepadId = '';
    this.gamepadFamily = 'keyboard';
    this.activeGamepadIndex = null;

    this._activitySerial = 0;
    this._padLastActivity = new Map();
    this._padSignatures = new Map();
    this._lastPollTime = null;
    this._viewHoldElapsed = 0;
    this._viewResetTriggered = false;
    this.resetHoldProgress = 0;

    this._previousGamepadButtons = {
      primary: false,
      start: false,
    };
    this._previousAnyGamepadButton = false;
    this._previousUiButtons = {
      up: false,
      down: false,
      left: false,
      right: false,
      cancel: false,
    };
    this._queuedActions = {
      confirm: false,
      pause: false,
      reset: false,
    };
    this._queuedUiActions = {
      confirm: false,
      cancel: false,
      up: false,
      down: false,
      left: false,
      right: false,
      pause: false,
      anyButton: false,
    };

    this._onKeyDown = (event) => {
      const gameplayKey = VERTICAL_KEYS.has(event.code)
        || HORIZONTAL_KEYS.has(event.code)
        || event.code === 'KeyK'
        || BACKFLIP_KEYS.has(event.code);
      if (!gameplayKey) return;

      this.keys.add(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    this._onKeyUp = (event) => {
      const gameplayKey = VERTICAL_KEYS.has(event.code)
        || HORIZONTAL_KEYS.has(event.code)
        || event.code === 'KeyK'
        || BACKFLIP_KEYS.has(event.code);
      if (!gameplayKey) return;

      this.keys.delete(event.code);
      this._refreshKeyboard();
      event.preventDefault();
    };

    this._onBlur = () => this._handleFocusLoss('blur');
    this._onVisibilityChange = () => {
      if (this.documentTarget?.hidden) this._handleFocusLoss('hidden');
    };

    target?.addEventListener?.('keydown', this._onKeyDown, { passive: false });
    target?.addEventListener?.('keyup', this._onKeyUp, { passive: false });
    target?.addEventListener?.('blur', this._onBlur);
    this.documentTarget?.addEventListener?.('visibilitychange', this._onVisibilityChange);
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
    this.keyboardBackflipHeld = Array.from(BACKFLIP_KEYS).some((code) => this.keys.has(code));
    this.handPlantHeld = this.keyboardHandPlantHeld || this.gamepadHandPlantHeld;
    this.backflipHeld = this.keyboardBackflipHeld || this.gamepadBackflipHeld;
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
      if (action === 'primary') {
        this._queuedActions.confirm = true;
        this._queuedUiActions.confirm = true;
      }
      if (action === 'start') {
        this._queuedActions.pause = true;
        this._queuedUiActions.pause = true;
      }
    }
    this._previousGamepadButtons[action] = pressed;
  }

  _queueUiEdge(action, pressed) {
    const previous = this._previousUiButtons[action];
    if (pressed && !previous) this._queuedUiActions[action] = true;
    this._previousUiButtons[action] = pressed;
  }

  _markPadActivity(pad, fallbackIndex) {
    const key = padKey(pad, fallbackIndex);
    const sample = activitySignature(pad, this.deadzone);
    const previous = this._padSignatures.get(key);
    this._padSignatures.set(key, sample.signature);
    if (sample.active && sample.signature !== previous) {
      this._activitySerial += 1;
      this._padLastActivity.set(key, this._activitySerial);
    }
    return { key, ...sample };
  }

  _selectActivePad(pads) {
    const connected = [];
    for (let index = 0; index < pads.length; index += 1) {
      const pad = pads[index];
      if (!pad?.connected) continue;
      const activity = this._markPadActivity(pad, index);
      connected.push({ pad, index: activity.key });
    }

    if (!connected.length) return null;

    let selected = connected.find(({ index }) => index === this.activeGamepadIndex) || null;
    let selectedActivity = selected
      ? (this._padLastActivity.get(selected.index) || 0)
      : -1;

    for (const candidate of connected) {
      const activity = this._padLastActivity.get(candidate.index) || 0;
      if (!selected || activity > selectedActivity) {
        selected = candidate;
        selectedActivity = activity;
      }
    }

    return selected;
  }

  _updateResetHold(backPressed, dt) {
    if (!backPressed) {
      if (this._viewHoldElapsed > 0 || this.resetHoldProgress > 0) {
        this._viewHoldElapsed = 0;
        this.resetHoldProgress = 0;
        this._viewResetTriggered = false;
        this.onResetHoldProgress?.(0);
      }
      return;
    }

    if (this._viewResetTriggered) return;

    this._viewHoldElapsed += Math.max(0, dt);
    this.resetHoldProgress = Math.min(1, this._viewHoldElapsed / this.resetHoldSeconds);
    this.onResetHoldProgress?.(this.resetHoldProgress);

    if (this._viewHoldElapsed >= this.resetHoldSeconds) {
      this._queuedActions.reset = true;
      this._viewResetTriggered = true;
      this.resetHoldProgress = 1;
      this.onResetHoldProgress?.(1);
    }
  }

  pollGamepad(padsOverride = null, deltaSeconds = null) {
    const pads = padsOverride || globalThis.navigator?.getGamepads?.() || [];
    const now = globalThis.performance?.now?.() ?? Date.now();
    const measuredDt = this._lastPollTime === null
      ? 0
      : Math.max(0, Math.min(0.1, (now - this._lastPollTime) / 1000));
    this._lastPollTime = now;
    const dt = deltaSeconds === null
      ? measuredDt
      : Math.max(0, Number(deltaSeconds) || 0);

    const selected = this._selectActivePad(Array.from(pads));
    if (!selected) {
      this._clearGamepadState();
      return this._refreshIntent();
    }

    const activePad = selected.pad;
    const previousIndex = this.activeGamepadIndex;
    this.activeGamepadIndex = selected.index;
    this.gamepadConnected = true;
    this.gamepadId = String(activePad.id || 'Gamepad');
    this.gamepadFamily = detectControllerFamily(this.gamepadId);

    if (previousIndex !== null && previousIndex !== this.activeGamepadIndex) {
      this._previousGamepadButtons.primary = false;
      this._previousGamepadButtons.start = false;
      this._previousAnyGamepadButton = false;
      for (const key of Object.keys(this._previousUiButtons)) {
        this._previousUiButtons[key] = false;
      }
      this._viewHoldElapsed = 0;
      this.resetHoldProgress = 0;
      this._viewResetTriggered = false;
    }

    const dpadUp = buttonPressed(activePad, GAMEPAD_BUTTON.dpadUp);
    const dpadDown = buttonPressed(activePad, GAMEPAD_BUTTON.dpadDown);
    const dpadLeft = buttonPressed(activePad, GAMEPAD_BUTTON.dpadLeft);
    const dpadRight = buttonPressed(activePad, GAMEPAD_BUTTON.dpadRight);
    const stickX = Number(activePad.axes?.[0]) || 0;
    const stickY = Number(activePad.axes?.[1]) || 0;
    const axisVertical = clampIntent(-stickY, this.deadzone);
    const axisHorizontal = clampIntent(stickX, this.deadzone);

    if (dpadUp !== dpadDown) {
      this.gamepadIntent = dpadUp ? 1 : -1;
    } else {
      this.gamepadIntent = axisVertical;
    }

    if (dpadLeft !== dpadRight) {
      this.gamepadTurnIntent = dpadRight ? 1 : -1;
    } else {
      this.gamepadTurnIntent = axisHorizontal;
    }

    this.gamepadHandPlantHeld = (
      buttonPressed(activePad, GAMEPAD_BUTTON.primary)
      || buttonPressed(activePad, GAMEPAD_BUTTON.secondary)
      || buttonPressed(activePad, GAMEPAD_BUTTON.tertiary)
    );
    this.gamepadBackflipHeld = (
      buttonPressed(activePad, GAMEPAD_BUTTON.primary)
      || buttonPressed(activePad, GAMEPAD_BUTTON.secondary)
      || buttonPressed(activePad, GAMEPAD_BUTTON.tertiary)
      || buttonPressed(activePad, GAMEPAD_BUTTON.quaternary)
    );

    const anyGamepadButton = RELEVANT_BUTTONS.some(
      (index) => buttonPressed(activePad, index),
    );
    if (anyGamepadButton && !this._previousAnyGamepadButton) {
      this._queuedUiActions.anyButton = true;
    }
    this._previousAnyGamepadButton = anyGamepadButton;

    this.handPlantHeld = this.keyboardHandPlantHeld || this.gamepadHandPlantHeld;
    this.backflipHeld = this.keyboardBackflipHeld || this.gamepadBackflipHeld;

    this._queueEdge('primary', buttonPressed(activePad, GAMEPAD_BUTTON.primary));
    this._queueEdge('start', buttonPressed(activePad, GAMEPAD_BUTTON.start));
    this._queueUiEdge('cancel', buttonPressed(activePad, GAMEPAD_BUTTON.secondary));
    this._queueUiEdge('up', dpadUp || axisVertical > 0);
    this._queueUiEdge('down', dpadDown || axisVertical < 0);
    this._queueUiEdge('left', dpadLeft || axisHorizontal < 0);
    this._queueUiEdge('right', dpadRight || axisHorizontal > 0);
    this._updateResetHold(buttonPressed(activePad, GAMEPAD_BUTTON.back), dt);

    return this._refreshIntent();
  }

  consumeActions() {
    const actions = { ...this._queuedActions };
    this._queuedActions.confirm = false;
    this._queuedActions.pause = false;
    this._queuedActions.reset = false;
    return actions;
  }

  consumeUIActions() {
    const actions = { ...this._queuedUiActions };
    for (const key of Object.keys(this._queuedUiActions)) {
      this._queuedUiActions[key] = false;
    }
    return actions;
  }

  clearHeldState() {
    this.keys.clear();
    this.keyboardIntent = 0;
    this.keyboardTurnIntent = 0;
    this.keyboardHandPlantHeld = false;
    this.keyboardBackflipHeld = false;
    this.gamepadIntent = 0;
    this.gamepadTurnIntent = 0;
    this.gamepadHandPlantHeld = false;
    this.gamepadBackflipHeld = false;
    this.handPlantHeld = false;
    this.backflipHeld = false;
    this.intent = 0;
    this.turnIntent = 0;
    this._viewHoldElapsed = 0;
    this.resetHoldProgress = 0;
    this._viewResetTriggered = false;
    this.onResetHoldProgress?.(0);
  }

  snapshot() {
    return {
      intent: this.intent,
      turnIntent: this.turnIntent,
      handPlantHeld: this.handPlantHeld,
      keyboardHandPlantHeld: this.keyboardHandPlantHeld,
      gamepadHandPlantHeld: this.gamepadHandPlantHeld,
      backflipHeld: this.backflipHeld,
      keyboardBackflipHeld: this.keyboardBackflipHeld,
      gamepadBackflipHeld: this.gamepadBackflipHeld,
      keyboardIntent: this.keyboardIntent,
      keyboardTurnIntent: this.keyboardTurnIntent,
      gamepadIntent: this.gamepadIntent,
      gamepadTurnIntent: this.gamepadTurnIntent,
      gamepadConnected: this.gamepadConnected,
      gamepadId: this.gamepadId,
      gamepadFamily: this.gamepadFamily,
      activeGamepadIndex: this.activeGamepadIndex,
      resetHoldProgress: this.resetHoldProgress,
    };
  }

  dispose() {
    this.target?.removeEventListener?.('keydown', this._onKeyDown);
    this.target?.removeEventListener?.('keyup', this._onKeyUp);
    this.target?.removeEventListener?.('blur', this._onBlur);
    this.documentTarget?.removeEventListener?.('visibilitychange', this._onVisibilityChange);
    this.clearHeldState();
    this._clearGamepadState();
    this._padLastActivity.clear();
    this._padSignatures.clear();
  }

  _clearQueuedActions() {
    for (const key of Object.keys(this._queuedActions)) {
      this._queuedActions[key] = false;
    }
    for (const key of Object.keys(this._queuedUiActions)) {
      this._queuedUiActions[key] = false;
    }
  }

  _handleFocusLoss(reason) {
    this.clearHeldState();
    this._clearQueuedActions();
    this._previousGamepadButtons.primary = false;
    this._previousGamepadButtons.start = false;
    this._previousAnyGamepadButton = false;
    for (const key of Object.keys(this._previousUiButtons)) {
      this._previousUiButtons[key] = false;
    }
    this.onPauseRequest?.({ reason });
  }

  _clearGamepadState() {
    this._clearQueuedActions();
    this.gamepadConnected = false;
    this.gamepadId = '';
    this.gamepadFamily = 'keyboard';
    this.activeGamepadIndex = null;
    this.gamepadIntent = 0;
    this.gamepadTurnIntent = 0;
    this.gamepadHandPlantHeld = false;
    this.gamepadBackflipHeld = false;
    this.handPlantHeld = this.keyboardHandPlantHeld;
    this.backflipHeld = this.keyboardBackflipHeld;
    this._previousGamepadButtons.primary = false;
    this._previousGamepadButtons.start = false;
    this._previousAnyGamepadButton = false;
    for (const key of Object.keys(this._previousUiButtons)) {
      this._previousUiButtons[key] = false;
    }
    this._viewHoldElapsed = 0;
    this.resetHoldProgress = 0;
    this._viewResetTriggered = false;
    this.onResetHoldProgress?.(0);
  }
}
