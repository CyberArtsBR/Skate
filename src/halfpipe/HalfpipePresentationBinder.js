import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from '../character/RiderPresentationState.js';
import { resolveContactClearance } from './HalfpipeContactClearance.js';

const tangent = new THREE.Vector2();
const normal = new THREE.Vector2();

export class HalfpipePresentationBinder {
  constructor(profile, rider) {
    this.profile = profile;
    this.rider = rider;
    this.lastSample = null;
    this.lastAngle = 0;
    this.lastContact = null;
    this.wasAirborne = false;
    this.airRootOffset = new THREE.Vector3();
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
        this.airRootOffset.set(
          normal.x * contact.clearance,
          normal.y * contact.clearance,
          0,
        );
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

    this.lastSample = {
      ...sample,
      tangent: tangent.clone(),
      normal: normal.clone(),
    };
    this.lastAngle = angle;
    this.lastContact = contact;
    this.wasAirborne = false;
    this.rider.setPresentationState({ ...state, pipeX: sample.x });
    return this.lastSample;
  }
}
