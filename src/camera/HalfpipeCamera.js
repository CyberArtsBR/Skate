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
    this.verticalShift = 0;
    this.camera.lookAt(this.target);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  updateForRider({ y = 0, airborne = false } = {}, dt = 0) {
    const tracking = this.config.dynamicAirTracking;
    if (!tracking) return this.snapshot();

    if (this.dynamicActive) {
      if (!airborne || y <= tracking.exitHeight) this.dynamicActive = false;
    } else if (airborne && y >= tracking.enterHeight) {
      this.dynamicActive = true;
    }

    const rawShift = this.dynamicActive
      ? Math.max(0, y - tracking.enterHeight) * tracking.followRatio
      : 0;
    const desiredShift = THREE.MathUtils.clamp(
      rawShift,
      0,
      tracking.maxVerticalShift,
    );
    const response = desiredShift > this.verticalShift
      ? tracking.riseResponse
      : tracking.fallResponse;

    this.verticalShift = damp(
      this.verticalShift,
      desiredShift,
      response,
      dt,
    );
    this.dynamicAmount = tracking.maxVerticalShift > 0
      ? THREE.MathUtils.clamp(
        this.verticalShift / tracking.maxVerticalShift,
        0,
        1,
      )
      : 0;

    // Never zoom and never change the presentation angle. Moving both camera
    // and target by the exact same vertical offset preserves their direction
    // vector while allowing high airs to remain on-screen.
    this.camera.fov = this.config.fov;
    this.camera.position.copy(this.basePosition);
    this.camera.position.y += this.verticalShift;
    this.target.copy(this.baseTarget);
    this.target.y += this.verticalShift;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();

    return this.snapshot();
  }

  resetDynamic() {
    this.dynamicActive = false;
    this.dynamicAmount = 0;
    this.verticalShift = 0;
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
      verticalShift: this.verticalShift,
      fov: this.camera.fov,
      targetY: this.target.y,
      position: this.camera.position.toArray(),
    };
  }
}
