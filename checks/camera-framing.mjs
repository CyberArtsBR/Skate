import assert from 'node:assert/strict';
import { HalfpipeCamera } from '../src/camera/HalfpipeCamera.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

const camera = new HalfpipeCamera();
const base = camera.snapshot();

assert.equal(base.dynamicActive, false);
assert.equal(base.fov, GAME_CONFIG.camera.fov);
assert.equal(base.targetY, GAME_CONFIG.camera.target[1]);

for (let index = 0; index < 120; index += 1) {
  camera.updateForRider({ y: 10.2, airborne: true }, 1 / 120);
}

const high = camera.snapshot();
assert.equal(high.dynamicActive, true);
assert.ok(high.dynamicAmount > 0.7, `dynamic amount should engage high in air: ${high.dynamicAmount}`);
assert.ok(high.fov > GAME_CONFIG.camera.fov + 4, `high-air framing should widen FOV: ${high.fov}`);
assert.ok(high.targetY > GAME_CONFIG.camera.target[1] + 1, `camera target should track upward: ${high.targetY}`);

for (let index = 0; index < 180; index += 1) {
  camera.updateForRider({ y: 6.5, airborne: true }, 1 / 120);
}

const descending = camera.snapshot();
assert.equal(descending.dynamicActive, false);
assert.ok(descending.fov < high.fov, 'descending below exit height should tighten framing');
assert.ok(descending.targetY < high.targetY, 'descending below exit height should lower camera target');

const reset = camera.resetDynamic();
assert.equal(reset.fov, GAME_CONFIG.camera.fov);
assert.equal(reset.targetY, GAME_CONFIG.camera.target[1]);
assert.equal(reset.dynamicAmount, 0);

console.log(JSON.stringify({ base, high, descending, reset }, null, 2));
