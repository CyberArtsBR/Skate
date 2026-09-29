import assert from 'node:assert/strict';
import { HalfpipePumpInput } from '../src/input/HalfpipePumpInput.js';

class FakeTarget {
  addEventListener() {}
  removeEventListener() {}
}

function makePad({ buttons = {}, stickX = 0, stickY = 0 } = {}) {
  const list = Array.from({ length: 16 }, () => ({ pressed: false }));
  for (const [index, pressed] of Object.entries(buttons)) {
    list[Number(index)] = { pressed: Boolean(pressed) };
  }
  return {
    connected: true,
    id: 'Test Controller',
    buttons: list,
    axes: [stickX, stickY, 0, 0],
  };
}

const input = new HalfpipePumpInput(new FakeTarget());

assert.equal(input.pollGamepad([makePad({ buttons: { 12: true } })]), 1);
assert.equal(input.snapshot().gamepadConnected, true);
assert.equal(input.snapshot().gamepadId, 'Test Controller');

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
    `button ${buttonIndex} should activate hand plant`,
  );
  input.pollGamepad([makePad()]);
  input.consumeActions();
  assert.equal(input.snapshot().handPlantHeld, false);
}

input.pollGamepad([makePad({ buttons: { 0: true } })]);
assert.deepEqual(input.consumeActions(), {
  confirm: true,
  pause: false,
  reset: false,
});

// Holding A must not repeatedly start/confirm every frame.
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

input.pollGamepad([makePad()]);
input.consumeActions();
input.pollGamepad([makePad({ buttons: { 8: true } })]);
assert.deepEqual(input.consumeActions(), {
  confirm: false,
  pause: false,
  reset: true,
});

input.pollGamepad([]);
assert.equal(input.snapshot().gamepadConnected, false);
assert.equal(input.snapshot().gamepadIntent, 0);
assert.equal(input.snapshot().gamepadTurnIntent, 0);
assert.equal(input.snapshot().handPlantHeld, false);

input.dispose();

console.log('controller input regression passed');
