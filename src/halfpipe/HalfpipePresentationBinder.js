import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from '../character/RiderPresentationState.js';

const tangent = new THREE.Vector2();
const normal = new THREE.Vector2();

export class HalfpipePresentationBinder {
  constructor(profile, rider) {
    this.profile = profile;
    this.rider = rider;
    this.lastSample = null;
    this.lastAngle = 0;
  }

  apply(nextState = {}) {
    const state = createRiderPresentationState({
      ...this.rider.presentationState,
      ...nextState,
    });
    const sample = this.profile.sample(state.pipeX);
    tangent.copy(sample.tangent);
    normal.copy(sample.normal);

    // HalfpipeProfile describes an undirected surface tangent. Presentation
    // keeps the skateboard's +X/nose axis consistently pointed toward world +X
    // so crossing the center never flips the rider upside down.
    if (tangent.x < 0) tangent.multiplyScalar(-1);
    if (normal.y < 0) normal.multiplyScalar(-1);

    const clearance = GAME_CONFIG.skateboard.surfaceClearance;
    const angle = Math.atan2(tangent.y, tangent.x) + state.rotation;
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
    this.rider.setPresentationState({ ...state, pipeX: sample.x });
    return this.lastSample;
  }
}
