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
const frontPitchDegrees = THREE.MathUtils.radToDeg(Math.asin(-baseDirection.y));
assert.ok(Math.abs(frontPitchDegrees - 2) < .001,
  `fixed low front angle must match the reference: ${frontPitchDegrees}`);
const highDirection = camera.target.clone().sub(camera.camera.position).normalize();
assert.ok(baseDirection.distanceTo(highDirection) < 1e-6,
  'vertical tracking must preserve the fixed viewing angle');
assert.equal(high.position[0], base.position[0], 'air tracking must not pan sideways');
assert.equal(high.position[2], base.position[2], 'air tracking must never dolly or zoom out');
assert.equal(Object.hasOwn(high, 'framingRetreat'), false, 'dynamic framing retreat must be removed');

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
const frontVertices = [];
const copingVertices = [];
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
      if (node.getName() === 'Object_8') copingVertices.push(point);
      if (/^FRENTE(?:\.\d+)?$/.test(primitive.getMaterial()?.getName() || '')) {
        frontVertices.push(point);
      }
    }
  }
}
assert.ok(vertices.length > 0, 'camera check must inspect actual ramp geometry');
const depthCenter = bounds.getCenter(new THREE.Vector3()).z;
for (const point of vertices) {
  point.y -= bounds.min.y;
  point.z -= depthCenter;
}
const frontZ = Math.max(...frontVertices.map(point => point.z));
const frontFace = frontVertices.filter(point => Math.abs(point.z - frontZ) < .001);
assert.ok(frontFace.length > 0, 'camera check must inspect the actual graffiti front plane');
camera.camera.updateMatrixWorld(true);
const projectedStructure = vertices.map(point => point.clone().project(camera.camera));
const projectedFront = frontFace.map(point => point.clone().project(camera.camera));
const desktopFrame = {
  structureLeft: Math.min(...projectedStructure.map(point => point.x)),
  structureRight: Math.max(...projectedStructure.map(point => point.x)),
  frontLeft: Math.min(...projectedFront.map(point => point.x)),
  frontRight: Math.max(...projectedFront.map(point => point.x)),
  bottom: Math.min(...projectedStructure.map(point => point.y)),
  top: Math.max(...projectedStructure.map(point => point.y)),
};
const copingBounds = new THREE.Box3().setFromPoints(copingVertices);
assert.ok(!copingBounds.isEmpty(), 'camera check must inspect both authored coping spans');
const copingY = copingBounds.getCenter(new THREE.Vector3()).y;
const frontCoping = new THREE.Vector3(copingBounds.max.x, copingY, copingBounds.max.z)
  .project(camera.camera);
const backCoping = new THREE.Vector3(copingBounds.max.x, copingY, copingBounds.min.z)
  .project(camera.camera);
const copingPerspective = {
  frontX: frontCoping.x,
  backX: backCoping.x,
  backToFrontRatio: Math.abs(backCoping.x / frontCoping.x),
  frontY: frontCoping.y,
  backY: backCoping.y,
};
assert.ok(Math.abs(copingPerspective.backToFrontRatio - .46) < .01,
  `fixed lens must match the reference's stronger front/back coping perspective: ${copingPerspective.backToFrontRatio}`);
assert.ok(copingPerspective.frontY > copingPerspective.backY,
  'the low front angle must put the near coping above the far coping, like the reference');
assert.ok(desktopFrame.frontLeft < -.99 && desktopFrame.frontLeft >= -1.001,
  `desktop graffiti left edge must nearly touch screen edge, not leave a side margin: ${desktopFrame.frontLeft}`);
assert.ok(desktopFrame.frontRight > .99 && desktopFrame.frontRight <= 1.001,
  `desktop graffiti right edge must nearly touch screen edge, not leave a side margin: ${desktopFrame.frontRight}`);
assert.ok(Math.abs(desktopFrame.bottom + 1) < .002,
  `desktop ramp bottom must touch the screen bottom, without under-ramp scenery: ${desktopFrame.bottom}`);
for (const point of projectedStructure) {
  assert.ok(Math.abs(point.x) <= 1.001 && Math.abs(point.y) <= 1.001,
    'tight desktop base frame must still contain the complete structure');
}
assert.ok(new THREE.Vector3(0, -.1, frontZ).project(camera.camera).y < -1,
  'the area immediately underneath the ramp must be below the desktop view');

// Native aspect may crop the sides on narrower screens, but resize must not
// retreat, widen the FOV, or change the physical camera. Aerial follow likewise
// moves only Y; retaining the floor during a high air is deliberately not a goal.
const viewports = [[1920, 1080], [2560, 1080], [640, 400], [800, 600], [720, 720], [360, 640]];
const frames = [];
for (const [width, height] of viewports) {
  const controller = new HalfpipeCamera();
  const initialPosition = controller.camera.position.toArray();
  controller.resize(width, height);
  assert.deepEqual(controller.camera.position.toArray(), initialPosition,
    'viewport resize must not dolly or change camera position');
  assert.equal(controller.camera.fov, GAME_CONFIG.camera.fov,
    'viewport resize must not change the fixed field of view');
  for (const state of [
    { y: 0, airborne: false },
    { y: 6.62, airborne: false },
    { y: 10.8, airborne: true, verticalVelocity: 15 },
    { y: 22, airborne: true, verticalVelocity: 0 },
    { y: 6.4, airborne: true, verticalVelocity: -8 },
    { y: 0, airborne: false },
  ]) {
    for (let index = 0; index < 180; index += 1) {
      controller.updateForRider(state, 1 / 120);
      assert.equal(controller.camera.position.x, GAME_CONFIG.camera.position[0]);
      assert.equal(controller.camera.position.z, GAME_CONFIG.camera.position[2],
        'no frame of an aerial or landing may move the camera backward');
      assert.equal(controller.camera.fov, GAME_CONFIG.camera.fov);
    }
    controller.addImpact({ strength: 0.45, duration: 0.18 });
    controller.updateForRider(state, 0.03);
    controller.camera.updateMatrixWorld(true);
    let extentX = 0;
    let extentY = 0;
    for (const point of vertices) {
      const projected = point.clone().project(controller.camera);
      extentX = Math.max(extentX, Math.abs(projected.x));
      extentY = Math.max(extentY, Math.abs(projected.y));
      assert.ok(projected.z >= -1 && projected.z <= 1, 'ramp must stay between near/far planes');
    }
    const top = state.y + GAME_CONFIG.rider.targetHeight + .25;
    for (const x of [-7.97, 7.97]) {
      const projected = new THREE.Vector3(x, top, 0).project(controller.camera);
      assert.ok(Math.abs(projected.y) <= 1.01,
        `${width}x${height}, y=${state.y}: vertical follow must keep the aerial rider in frame`);
      if (width / height >= 16 / 9) {
        assert.ok(Math.abs(projected.x) <= 1,
          `${width}x${height}, y=${state.y}: landscape aerial rider must remain in frame`);
      }
    }
    assert.ok(baseDirection.distanceTo(controller.target.clone()
      .sub(controller.camera.position).normalize()) < 1e-6,
      'all viewports and aerial heights must preserve the centered front angle');
    const snapshot = controller.snapshot();
    assert.equal(snapshot.position[0], initialPosition[0]);
    assert.equal(snapshot.position[2], initialPosition[2],
      'maximum landing impact must not add depth motion');
    assert.equal(snapshot.impact.offset[2], 0, 'impact offset must remain strictly vertical');
    assert.ok(Math.abs((snapshot.position[1] - GAME_CONFIG.camera.position[1])
      - (snapshot.targetY - GAME_CONFIG.camera.target[1])) < 1e-6,
    'camera and target must follow by the exact same Y amount');
    frames.push({ width, height, riderY: state.y, extentX, extentY,
      cameraPosition: snapshot.position });
  }
  controller.resetDynamic();
  assert.equal(controller.snapshot().verticalShift, 0);
}

console.log(JSON.stringify({ base, high, descending, reset, assetPath,
  geometryVertices: vertices.length, desktopFrame, copingPerspective,
  frontPitchDegrees,
  frames }, null, 2));
