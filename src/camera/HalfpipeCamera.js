import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

function damp(current, target, response, dt) {
  const t = 1 - Math.exp(-Math.max(0, response) * Math.max(0, dt));
  return THREE.MathUtils.lerp(current, target, t);
}

export class HalfpipeCamera {
  constructor() {
    const config = GAME_CONFIG.camera;
    this.config = config;
    this.camera = new THREE.PerspectiveCamera(config.fov, 16 / 9, config.near, config.far);
    this.camera.name = 'halfpipe-camera';
    this.camera.position.fromArray(config.position);
    this.basePosition = new THREE.Vector3().fromArray(config.position);
    this.baseTarget = new THREE.Vector3().fromArray(config.target);
    this.target = this.baseTarget.clone();
    this.dynamicActive = false;
    this.dynamicAmount = 0;
    this.camera.lookAt(this.target);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  updateForRider({ y = 0, airborne = false } = {}, dt = 0) {
    const dynamic = this.config.dynamicAirFraming;
    if (!dynamic) return this.snapshot();

    if (this.dynamicActive) {
      if (!airborne || y <= dynamic.exitHeight) this.dynamicActive = false;
    } else if (airborne && y >= dynamic.enterHeight) {
      this.dynamicActive = true;
    }

    const heightRange = Math.max(0.001, dynamic.maxTrackedHeight - dynamic.enterHeight);
    const desiredAmount = this.dynamicActive
      ? THREE.MathUtils.clamp((y - dynamic.enterHeight) / heightRange, 0, 1)
      : 0;

    this.dynamicAmount = damp(
      this.dynamicAmount,
      desiredAmount,
      dynamic.response,
      dt,
    );

    const desiredFov = THREE.MathUtils.lerp(
      this.config.fov,
      dynamic.maxFov,
      this.dynamicAmount,
    );
    const desiredTargetY = THREE.MathUtils.lerp(
      this.baseTarget.y,
      dynamic.maxTargetY,
      this.dynamicAmount,
    );

    this.camera.fov = damp(this.camera.fov, desiredFov, dynamic.response, dt);
    this.target.y = damp(this.target.y, desiredTargetY, dynamic.response, dt);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();

    return this.snapshot();
  }

  resetDynamic() {
    this.dynamicActive = false;
    this.dynamicAmount = 0;
    this.camera.fov = this.config.fov;
    this.camera.position.copy(this.basePosition);
    this.target.copy(this.baseTarget);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    return this.snapshot();
  }

  snapshot() {
    return {
      dynamicActive: this.dynamicActive,
      dynamicAmount: this.dynamicAmount,
      fov: this.camera.fov,
      targetY: this.target.y,
      position: this.camera.position.toArray(),
    };
  }
}
