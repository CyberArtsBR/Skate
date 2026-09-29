import assert from 'node:assert/strict';
import { HalfpipePumpInput } from '../src/input/HalfpipePumpInput.js';

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  emit(type, event = {}) {
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
}

function makePad({
  buttons = {},
  stickX = 0,
  stickY = 0,
  index = 0,
  id = 'Xbox Wireless Controller',
} = {}) {
  const list = Array.from({ length: 16 }, () => ({ pressed: false }));
  for (const [buttonIndex, pressed] of Object.entries(buttons)) {
    list[Number(buttonIndex)] = { pressed: Boolean(pressed) };
  }
  return {
    connected: true,
    index,
    id,
    buttons: list,
    axes: [stickX, stickY, 0, 0],
  };
}

const target = new FakeTarget();
const documentTarget = new FakeTarget();
documentTarget.hidden = false;
let pauseRequests = 0;

const input = new HalfpipePumpInput(target, {
  documentTarget,
  onPauseRequest() {
    pauseRequests += 1;
  },
});

assert.equal(input.pollGamepad([makePad({ buttons: { 12: true } })]), 1);
assert.equal(input.snapshot().gamepadConnected, true);
assert.equal(input.snapshot().gamepadId, 'Xbox Wireless Controller');
assert.equal(input.snapshot().gamepadFamily, 'xbox');
assert.equal(input.snapshot().activeGamepadIndex, 0);

assert.equal(input.pollGamepad([makePad({ buttons: { 13: true } })]), -1);
assert.equal(input.pollGamepad([makePad({ stickY: -0.8 })]), 1);
assert.equal(input.pollGamepad([makePad({ stickY: 0.8 })]), -1);
assert.equal(input.pollGamepad([makePad({ stickY: 0.1 })]), 0);

input.pollGamepad([makePad({ buttons: { 14: true } })]);
assert.equal(input.snapshot().gamepadTurnIntent, -1);
input.pollGamepad([makePad({ buttons: { 15: true } })]);
assert.equal(input.snapshot().gamepadTurnIntent, 1);
input.pollGamepad([makePad({ stickX: -0.8 })]);
assert.equal(input.snapshot().gamepadTurnIntent, -1);
input.pollGamepad([makePad({ stickX: 0.8 })]);
assert.equal(input.snapshot().gamepadTurnIntent, 1);
input.pollGamepad([makePad({ stickX: 0.1 })]);
assert.equal(input.snapshot().gamepadTurnIntent, 0);

for (const buttonIndex of [0, 1, 2]) {
  input.pollGamepad([makePad({ buttons: { [buttonIndex]: true } })]);
  assert.equal(
    input.snapshot().handPlantHeld,
    true,
    'button ' + buttonIndex + ' should activate hand plant',
  );
  input.pollGamepad([makePad()]);
  input.consumeActions();
  input.consumeUIActions();
  assert.equal(input.snapshot().handPlantHeld, false);
}

input.pollGamepad([makePad({ buttons: { 0: true } })]);
assert.deepEqual(input.consumeActions(), {
  confirm: true,
  pause: false,
  reset: false,
});

// Holding primary must not repeatedly confirm every frame.
input.pollGamepad([makePad({ buttons: { 0: true } })]);
assert.equal(input.consumeActions().confirm, false);
input.pollGamepad([makePad()]);
input.consumeActions();
input.pollGamepad([makePad({ buttons: { 0: true } })]);
assert.equal(input.consumeActions().confirm, true);

input.pollGamepad([makePad()]);
input.consumeActions();
input.pollGamepad([makePad({ buttons: { 9: true } })]);
assert.deepEqual(input.consumeActions(), {
  confirm: false,
  pause: true,
  reset: false,
});

// A View/Share tap is non-destructive.
input.pollGamepad([makePad()], 0.016);
input.consumeActions();
input.pollGamepad([makePad({ buttons: { 8: true } })], 0.2);
assert.equal(input.consumeActions().reset, false);
assert.ok(input.snapshot().resetHoldProgress > 0);
input.pollGamepad([makePad()], 0.016);
assert.equal(input.consumeActions().reset, false);
assert.equal(input.snapshot().resetHoldProgress, 0);

// Holding View/Share for ~1 second emits exactly one reset.
for (let index = 0; index < 4; index += 1) {
  input.pollGamepad([makePad({ buttons: { 8: true } })], 0.25);
}
assert.equal(input.consumeActions().reset, true);
input.pollGamepad([makePad({ buttons: { 8: true } })], 0.25);
assert.equal(input.consumeActions().reset, false);
input.pollGamepad([makePad()], 0.016);

// Most recently active connected pad wins.
input.pollGamepad([
  makePad({ index: 0 }),
  makePad({ index: 1, id: 'DualSense Wireless Controller', stickX: 0.8 }),
]);
assert.equal(input.snapshot().activeGamepadIndex, 1);
assert.equal(input.snapshot().gamepadFamily, 'playstation');

input.pollGamepad([
  makePad({ index: 0, stickY: -0.9 }),
  makePad({ index: 1, id: 'DualSense Wireless Controller' }),
]);
assert.equal(input.snapshot().activeGamepadIndex, 0);
assert.equal(input.snapshot().gamepadFamily, 'xbox');

// Focus loss must clear held keyboard state and request pause.
target.emit('keydown', {
  code: 'ArrowUp',
  preventDefault() {},
});
assert.equal(input.snapshot().keyboardIntent, 1);
target.emit('blur');
assert.equal(input.snapshot().keyboardIntent, 0);
assert.equal(input.snapshot().turnIntent, 0);
assert.equal(input.snapshot().handPlantHeld, false);
assert.equal(pauseRequests, 1);

documentTarget.hidden = true;
documentTarget.emit('visibilitychange');
assert.equal(pauseRequests, 2);

input.pollGamepad([]);
assert.equal(input.snapshot().gamepadConnected, false);
assert.equal(input.snapshot().gamepadIntent, 0);
assert.equal(input.snapshot().gamepadTurnIntent, 0);
assert.equal(input.snapshot().handPlantHeld, false);

input.dispose();

console.log('controller input regression passed');
