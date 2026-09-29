import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

function clampDt(dt, maxDt = 0.1) {
  return THREE.MathUtils.clamp(Number(dt) || 0, 0, maxDt);
}

function damp(current, target, response, dt) {
  const t = 1 - Math.exp(-Math.max(0, response) * Math.max(0, dt));
  return THREE.MathUtils.lerp(current, target, t);
}

export class HalfpipeCamera {
  constructor({ reducedMotion = false } = {}) {
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
    this.reducedMotion = Boolean(reducedMotion);

    this.impactStrength = 0;
    this.impactDuration = 0;
    this.impactElapsed = 0;
    this.impactOffset = new THREE.Vector3();
    this._composedOffset = new THREE.Vector3();

    this.camera.lookAt(this.target);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    if (this.reducedMotion) this._clearImpact();
    return this.reducedMotion;
  }

  addImpact({ strength = 0, duration = 0.18 } = {}) {
    const motionScale = this.reducedMotion ? 0 : 1;
    const nextStrength = THREE.MathUtils.clamp(
      Math.abs(Number(strength) || 0) * motionScale,
      0,
      0.45,
    );
    const nextDuration = THREE.MathUtils.clamp(
      Number(duration) || 0,
      0.04,
      0.6,
    );

    if (nextStrength <= 0) {
      this._clearImpact();
      return this.snapshot();
    }

    // Stronger incoming impacts replace weaker ones while preserving a small
    // amount of the current impulse so repeated landings never stack without bound.
    this.impactStrength = Math.max(nextStrength, this.impactStrength * 0.35);
    this.impactDuration = nextDuration;
    this.impactElapsed = 0;
    return this.snapshot();
  }

  updateForRider({
    y = 0,
    airborne = false,
    verticalVelocity = 0,
  } = {}, presentationDt = 0) {
    const tracking = this.config.dynamicAirTracking;
    const dt = clampDt(presentationDt);
    if (!tracking) {
      this._updateImpact(dt);
      this._composeCamera();
      return this.snapshot();
    }

    const velocityY = Number(verticalVelocity) || 0;
    const risingFast = airborne && velocityY > 1.5;
    const descending = airborne && velocityY < -0.5;
    const anticipation = risingFast
      ? THREE.MathUtils.clamp(velocityY * 0.055, 0, 1.05)
      : 0;
    const anticipatedY = y + anticipation;

    if (this.dynamicActive) {
      // Height hysteresis is intentionally based on the real rider height.
      // Anticipation can engage tracking early but cannot keep it latched forever.
      if (!airborne || y <= tracking.exitHeight) this.dynamicActive = false;
    } else if (airborne && anticipatedY >= tracking.enterHeight) {
      this.dynamicActive = true;
    }

    const trackedY = THREE.MathUtils.clamp(
      anticipatedY,
      tracking.enterHeight,
      tracking.maxTrackedHeight,
    );
    const rawShift = this.dynamicActive
      ? Math.max(0, trackedY - tracking.enterHeight) * tracking.followRatio
      : 0;
    const desiredShift = THREE.MathUtils.clamp(
      rawShift,
      0,
      tracking.maxVerticalShift,
    );

    let response = desiredShift > this.verticalShift
      ? tracking.riseResponse
      : tracking.fallResponse;
    if (descending || (!airborne && desiredShift < this.verticalShift)) {
      response *= 0.68;
    }

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

    this._updateImpact(dt);
    this._composeCamera();
    return this.snapshot();
  }

  _updateImpact(dt) {
    if (this.reducedMotion || this.impactStrength <= 0 || this.impactDuration <= 0) {
      this._clearImpact();
      return;
    }

    this.impactElapsed = Math.min(this.impactDuration, this.impactElapsed + dt);
    const progress = this.impactDuration > 0
      ? this.impactElapsed / this.impactDuration
      : 1;
    const envelope = Math.pow(Math.max(0, 1 - progress), 2.35);
    const oscillation = Math.sin(progress * Math.PI * 3.25);
    const offset = this.impactStrength * envelope * oscillation;

    // Position and target receive the same offset, preserving the base viewing
    // direction. The small Z component reads as impact without becoming a zoom.
    this.impactOffset.set(0, offset * 0.7, offset * 0.22);

    if (progress >= 1) this._clearImpact();
  }

  _clearImpact() {
    this.impactStrength = 0;
    this.impactDuration = 0;
    this.impactElapsed = 0;
    this.impactOffset.set(0, 0, 0);
  }

  _composeCamera() {
    this.camera.fov = this.config.fov;
    this._composedOffset.set(0, this.verticalShift, 0).add(this.impactOffset);
    this.camera.position.copy(this.basePosition).add(this._composedOffset);
    this.target.copy(this.baseTarget).add(this._composedOffset);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  resetDynamic() {
    this.dynamicActive = false;
    this.dynamicAmount = 0;
    this.verticalShift = 0;
    this._clearImpact();
    this._composeCamera();
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
      impact: {
        strength: this.impactStrength,
        duration: this.impactDuration,
        elapsed: this.impactElapsed,
        offset: this.impactOffset.toArray(),
      },
      reducedMotion: this.reducedMotion,
    };
  }
}
