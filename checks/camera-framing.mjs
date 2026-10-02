import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
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
const baseDirection = new THREE.Vector3().fromArray(GAME_CONFIG.camera.target)
  .sub(new THREE.Vector3().fromArray(GAME_CONFIG.camera.position)).normalize();
const highDirection = camera.target.clone().sub(camera.camera.position).normalize();
assert.ok(baseDirection.distanceTo(highDirection) < 1e-6,
  'vertical tracking and framing dolly must preserve the fixed viewing angle');
assert.ok(high.framingRetreat > 0,
  'high airs must also retain the complete front structure instead of cropping its floor');

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

// Project the actual active GLB, not only the narrower playable surface. The
// runtime aligns the visible source's bottom and depth center to the origin.
const assetPath = fileURLToPath(new URL(`../public${GAME_CONFIG.assets.halfpipe}`, import.meta.url));
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(assetPath);
const vertices = [];
const bounds = new THREE.Box3();
for (const node of document.getRoot().listNodes()) {
  if (!node.getMesh() || /ground/i.test(node.getName())) continue;
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of node.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute('POSITION')?.getArray();
    if (!positions) continue;
    for (let offset = 0; offset < positions.length; offset += 3) {
      const point = new THREE.Vector3().fromArray(positions, offset).applyMatrix4(matrix);
      bounds.expandByPoint(point);
      vertices.push(point);
    }
  }
}
assert.ok(vertices.length > 0, 'camera check must inspect actual ramp geometry');
const depthCenter = bounds.getCenter(new THREE.Vector3()).z;
for (const point of vertices) {
  point.y -= bounds.min.y;
  point.z -= depthCenter;
}
const viewports = [[1920, 1080], [2560, 1080], [640, 400], [800, 600], [720, 720], [360, 640]];
const frames = [];
for (const [width, height] of viewports) {
  const controller = new HalfpipeCamera();
  controller.resize(width, height);
  for (const state of [
    { y: 0, airborne: false },
    { y: 6.62, airborne: false },
    { y: 10.8, airborne: true, verticalVelocity: 15 },
    { y: 22, airborne: true, verticalVelocity: 0 },
    { y: 6.4, airborne: true, verticalVelocity: -8 },
    { y: 0, airborne: false },
  ]) {
    for (let index = 0; index < 180; index += 1) controller.updateForRider(state, 1 / 120);
    controller.addImpact({ strength: 0.45, duration: 0.18 });
    controller.updateForRider(state, 0.03);
    controller.camera.updateMatrixWorld(true);
    let extentX = 0;
    let extentY = 0;
    for (const point of vertices) {
      const projected = point.clone().project(controller.camera);
      extentX = Math.max(extentX, Math.abs(projected.x));
      extentY = Math.max(extentY, Math.abs(projected.y));
      assert.ok(Math.abs(projected.x) <= .940001 && Math.abs(projected.y) <= .940001,
        `${width}x${height}, y=${state.y}: complete structure must remain inside the framing inset`);
      assert.ok(projected.z >= -1 && projected.z <= 1, 'ramp must stay between near/far planes');
    }
    const top = state.y + GAME_CONFIG.rider.targetHeight + .25;
    for (const x of [-7.97, 7.97]) {
      const projected = new THREE.Vector3(x, top, 0).project(controller.camera);
      assert.ok(Math.abs(projected.x) <= .940001 && Math.abs(projected.y) <= .940001,
        `${width}x${height}, y=${state.y}: aerial rider must remain in frame`);
    }
    assert.ok(baseDirection.distanceTo(controller.target.clone()
      .sub(controller.camera.position).normalize()) < 1e-6,
    'all viewports and aerial heights must preserve the centered front angle');
    frames.push({ width, height, riderY: state.y, extentX, extentY,
      retreat: controller.snapshot().framingRetreat });
  }
  controller.resetDynamic();
  assert.equal(controller.snapshot().verticalShift, 0);
}

console.log(JSON.stringify({ base, high, descending, reset, assetPath,
  geometryVertices: vertices.length, frontPitchDegrees: THREE.MathUtils.radToDeg(Math.asin(-baseDirection.y)),
  frames }, null, 2));
