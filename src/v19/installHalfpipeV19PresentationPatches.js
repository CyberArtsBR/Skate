import * as THREE from 'three';
import { HalfpipeCamera } from '../camera/HalfpipeCamera.js';
import { SkatePoseController } from '../character/SkatePoseController.js';

let installed = false;

function responsiveVerticalFov(baseFov, aspect, {
  referenceAspect = 16 / 9,
  maxNarrowFov = 39,
} = {}) {
  const safeBase = THREE.MathUtils.clamp(Number(baseFov) || 30, 20, 70);
  const safeAspect = Math.max(0.5, Number(aspect) || referenceAspect);
  const safeReference = Math.max(0.5, Number(referenceAspect) || (16 / 9));

  // Wide displays keep the authored vertical FOV, naturally exposing more of
  // the scene horizontally. Narrow displays expand vertical FOV just enough to
  // preserve the same approximate horizontal gameplay safe area.
  if (safeAspect >= safeReference) return safeBase;

  const baseRadians = THREE.MathUtils.degToRad(safeBase);
  const widened = 2 * Math.atan(
    Math.tan(baseRadians * 0.5) * (safeReference / safeAspect),
  );
  return Math.min(
    Math.max(safeBase, Number(maxNarrowFov) || 39),
    THREE.MathUtils.radToDeg(widened),
  );
}

function applyResponsiveFov(controller) {
  const framing = controller?.config?.responsiveFraming;
  if (!framing || !controller?.camera) return;

  const nextFov = responsiveVerticalFov(
    controller.config.fov,
    controller.camera.aspect,
    framing,
  );
  if (Math.abs(controller.camera.fov - nextFov) < 1e-5) return;
  controller.camera.fov = nextFov;
  controller.camera.updateProjectionMatrix();
}

function patchResponsiveCamera() {
  const proto = HalfpipeCamera.prototype;
  if (proto.__halfpipeV19ResponsiveFramingPatched) return;
  proto.__halfpipeV19ResponsiveFramingPatched = true;

  const originalResize = proto.resize;
  proto.resize = function resizeV19(width, height) {
    const result = originalResize.call(this, width, height);
    applyResponsiveFov(this);
    return result;
  };

  const originalCompose = proto._composeCamera;
  proto._composeCamera = function composeCameraV19() {
    const result = originalCompose.call(this);
    applyResponsiveFov(this);
    return result;
  };
}

function patchRiderSecondaryMotion() {
  const proto = SkatePoseController.prototype;
  if (proto.__halfpipeV19SecondaryMotionPatched) return;
  proto.__halfpipeV19SecondaryMotionPatched = true;

  const originalEvaluate = proto.evaluate;
  proto.evaluate = function evaluateV19(state = {}) {
    const pose = originalEvaluate.call(this, state);

    // Presentation-only balance motion for quiet grounded moments. No
    // simulation value, collision value, trick state or scoring state changes.
    const grounded = !state.airborne && !state.trickVisualActive;
    const speed = THREE.MathUtils.clamp(Number(state.speedNormalized) || 0, 0, 1);
    const pump = THREE.MathUtils.clamp(Number(state.pumpCompression) || 0, 0, 1);
    const idleWeight = grounded
      ? (1 - THREE.MathUtils.smoothstep(speed, 0.05, 0.22))
        * (1 - THREE.MathUtils.smoothstep(pump, 0.08, 0.32))
      : 0;

    if (idleWeight <= 0.001) return pose;

    const time = Number.isFinite(Number(state.time)) ? Number(state.time) : 0;
    const breath = Math.sin(time * 1.45) * 0.012 * idleWeight;
    const balance = Math.sin(time * 1.92 + 0.55) * 0.016 * idleWeight;
    const counter = Math.sin(time * 1.92 + 2.4) * 0.012 * idleWeight;

    pose.compression = THREE.MathUtils.clamp(pose.compression + breath, 0, 1);
    pose.hipFlex += breath * 0.32;
    pose.kneeFlex += breath * 0.55;
    pose.torsoBalanceZ += balance;
    pose.headBalanceZ -= balance * 0.42;
    pose.leftArmBalance += counter;
    pose.rightArmBalance -= counter;
    pose.torsoSettle += breath * 0.18;

    return pose;
  };
}

export function installHalfpipeV19PresentationPatches() {
  if (installed) return false;
  installed = true;
  patchResponsiveCamera();
  patchRiderSecondaryMotion();
  return true;
}
