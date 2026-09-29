import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from '../character/RiderPresentationState.js';
import { resolveContactClearance } from './HalfpipeContactClearance.js';

const tangent = new THREE.Vector2();
const normal = new THREE.Vector2();

export class HalfpipePresentationBinder {
  constructor(profile, rider, {
    visualSurface = null,
    visualSeparation = 0.02,
  } = {}) {
    this.profile = profile;
    this.rider = rider;
    this.visualSurface = visualSurface;
    this.visualSeparation = Math.max(0, Number(visualSeparation) || 0);
    this.lastSample = null;
    this.lastAngle = 0;
    this.lastContact = null;
    this.wasAirborne = false;
    this.airRootOffset = new THREE.Vector3();
    this.lastContactRootOffset = new THREE.Vector3();
    this._visualNormal = new THREE.Vector3();
    this._visualBase = new THREE.Vector3();
  }

  _resolveContact(sample, normalVector, angle) {
    const baseClearance = GAME_CONFIG.skateboard.surfaceClearance;
    const measuredWheelDiameter = Math.max(
      1e-4,
      Number(this.rider.skateboard.measuredWheelDiameter)
        || GAME_CONFIG.skateboard.wheelRadius * 2,
    );
    const slopeInfluence = Math.abs(tangent.y);
    const minimumSeparation = baseClearance + measuredWheelDiameter * slopeInfluence;
    const contact = resolveContactClearance({
      profile: this.profile,
      sample,
      normal: normalVector,
      angle,
      supportPoints: this.rider.skateboard.surfaceSupportPoints,
      baseClearance,
      minimumSeparation,
    });

    return {
      ...contact,
      measuredWheelDiameter,
      slopeInfluence,
      supportPointCount: this.rider.skateboard.surfaceSupportPoints.length,
    };
  }

  _resolveVisualContact(normalVector) {
    if (
      !this.visualSurface?.measureRidingSurfaceSeparation
      || !this.rider.skateboard.surfaceSupportPoints.length
    ) return null;

    this._visualNormal.set(normalVector.x, normalVector.y, 0).normalize();
    let totalAdjustment = 0;
    let minSeparation = null;
    let hitCount = 0;
    let iterations = 0;

    for (; iterations < 4; iterations += 1) {
      this.rider.root.updateWorldMatrix(true, true);
      const separations = [];

      for (const support of this.rider.skateboard.surfaceSupportPoints) {
        const worldPoint = this.rider.skateboard.root.localToWorld(
          support.position.clone(),
        );
        const hit = this.visualSurface.measureRidingSurfaceSeparation(
          worldPoint,
          this._visualNormal,
        );
        if (Number.isFinite(hit?.separation)) separations.push(hit.separation);
      }

      hitCount = separations.length;
      if (!hitCount) break;
      minSeparation = Math.min(...separations);
      const delta = THREE.MathUtils.clamp(
        this.visualSeparation - minSeparation,
        -0.5,
        0.5,
      );
      if (Math.abs(delta) <= 0.001) break;

      this.rider.root.position.addScaledVector(this._visualNormal, delta);
      totalAdjustment += delta;
    }

    this.rider.root.updateWorldMatrix(true, true);
    return {
      targetSeparation: this.visualSeparation,
      minSeparation,
      hitCount,
      adjustment: totalAdjustment,
      iterations,
    };
  }

  apply(nextState = {}) {
    const state = createRiderPresentationState({
      ...this.rider.presentationState,
      ...nextState,
    });
    const sample = this.profile.sample(state.pipeX);
    tangent.copy(sample.tangent);
    normal.copy(sample.normal);

    if (tangent.x < 0) tangent.multiplyScalar(-1);
    if (normal.y < 0) normal.multiplyScalar(-1);

    const angle = Math.atan2(tangent.y, tangent.x) + state.rotation;
    const contact = this._resolveContact(sample, normal, angle);

    if (state.airborne && state.worldY !== null) {
      // Preserve the exact contact-solver root offset at takeoff. Previously the
      // first airborne frame dropped this clearance and also snapped the center
      // to the mathematical lip, producing a visible micro-teleport on both
      // sides. The simulation now keeps the takeoff anchor X, while presentation
      // carries the same solved support offset through the entire air arc.
      if (!this.wasAirborne) {
        if (this.lastContactRootOffset.lengthSq() > 1e-8) {
          this.airRootOffset.copy(this.lastContactRootOffset);
        } else {
          this.airRootOffset.set(
            normal.x * contact.clearance,
            normal.y * contact.clearance,
            0,
          );
        }
      }

      this.rider.root.position.set(
        state.pipeX + this.airRootOffset.x,
        state.worldY + this.airRootOffset.y,
        0,
      );
      this.rider.root.rotation.set(0, 0, angle);
      this.rider.root.updateWorldMatrix(true, true);

      this.lastSample = {
        ...sample,
        tangent: tangent.clone(),
        normal: normal.clone(),
      };
      this.lastAngle = angle;
      this.lastContact = null;
      this.wasAirborne = true;
      this.rider.setPresentationState({ ...state, pipeX: state.pipeX });
      return this.lastSample;
    }

    const clearance = contact.clearance;
    this.rider.root.position.set(
      sample.x + normal.x * clearance,
      sample.y + normal.y * clearance,
      0,
    );
    this.rider.root.rotation.set(0, 0, angle);
    this.rider.root.updateWorldMatrix(true, true);
    const visualContact = this._resolveVisualContact(normal);
    this.lastContactRootOffset
      .copy(this.rider.root.position)
      .sub(this._visualBase.set(sample.x, sample.y, 0));

    this.lastSample = {
      ...sample,
      tangent: tangent.clone(),
      normal: normal.clone(),
    };
    this.lastAngle = angle;
    this.lastContact = {
      ...contact,
      visualContact,
      visualMinSeparation: visualContact?.minSeparation ?? null,
      visualAdjustment: visualContact?.adjustment ?? 0,
    };
    this.wasAirborne = false;
    this.rider.setPresentationState({ ...state, pipeX: sample.x });
    return this.lastSample;
  }
}
