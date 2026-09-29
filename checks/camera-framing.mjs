import assert from 'node:assert/strict';
import { HalfpipeCamera } from '../src/camera/HalfpipeCamera.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

const camera = new HalfpipeCamera();
const base = camera.snapshot();

assert.equal(base.dynamicActive, false);
assert.equal(base.fov, GAME_CONFIG.camera.fov);
assert.equal(base.targetY, GAME_CONFIG.camera.target[1]);
assert.equal(base.verticalShift, 0);

for (let index = 0; index < 120; index += 1) {
  camera.updateForRider({ y: 10.8, airborne: true }, 1 / 120);
}

const high = camera.snapshot();
assert.equal(high.dynamicActive, true);
assert.ok(
  high.verticalShift > 2,
  `high-air camera should move upward instead of zooming: ${high.verticalShift}`,
);
assert.equal(
  high.fov,
  GAME_CONFIG.camera.fov,
  'high-air tracking must never widen or narrow the FOV',
);
assert.ok(
  high.position[1] > base.position[1] + 2,
  `camera body should follow the rider upward: ${high.position[1]}`,
);
assert.ok(
  Math.abs(
    (high.position[1] - base.position[1])
      - (high.targetY - base.targetY)
  ) < 1e-6,
  'camera and target must rise together to preserve the fixed viewing angle',
);

for (let index = 0; index < 180; index += 1) {
  camera.updateForRider({ y: 6.4, airborne: true }, 1 / 120);
}

const descending = camera.snapshot();
assert.equal(descending.dynamicActive, false);
assert.equal(
  descending.fov,
  GAME_CONFIG.camera.fov,
  'descending must keep the original FOV',
);
assert.ok(
  descending.verticalShift < high.verticalShift,
  'camera should return downward after the rider crosses the exit height',
);
assert.ok(
  descending.position[1] < high.position[1],
  'camera body should travel back toward its original height',
);

const reset = camera.resetDynamic();
assert.equal(reset.fov, GAME_CONFIG.camera.fov);
assert.equal(reset.targetY, GAME_CONFIG.camera.target[1]);
assert.equal(reset.position[1], GAME_CONFIG.camera.position[1]);
assert.equal(reset.dynamicAmount, 0);
assert.equal(reset.verticalShift, 0);

console.log(JSON.stringify({ base, high, descending, reset }, null, 2));
