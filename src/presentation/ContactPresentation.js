import * as THREE from 'three';

const normal = new THREE.Vector3();
const average = new THREE.Vector3();

export function measureBoardContacts(rider, profile, ramp, state, { project = false } = {}) {
  const board = rider?.skateboard;
  if (!board?.root) return null;
  const sample = profile.sample(state.pipeX || 0);
  normal.set(sample.normal.x, sample.normal.y, 0).normalize();
  board.root.updateWorldMatrix(true, false);
  const wheels = board.contactPoints.map(point => point.clone().applyMatrix4(board.root.matrixWorld));
  average.set(0, 0, 0);
  const rampPositions = [];
  for (const point of wheels) {
    const hit = project && ramp?.measureRidingSurfaceSeparation(point, normal, { padding: 0.5, far: 1.5 });
    const surfacePoint = hit?.point || point;
    rampPositions.push(surfacePoint.clone());
    average.add(surfacePoint);
    if (hit?.normal) normal.copy(hit.normal);
  }
  if (wheels.length) average.multiplyScalar(1 / wheels.length);
  else board.root.getWorldPosition(average);
  return {
    wheelPositions: wheels,
    rampContactPositions: rampPositions,
    contactPosition: average.clone(),
    surfaceNormal: normal.clone(),
    worldVelocity: new THREE.Vector3(
      (Number(state.tangentVelocity) || 0) * sample.tangent.x,
      state.mode === 'airborne' ? Number(state.airVerticalVelocity) || 0
        : (Number(state.tangentVelocity) || 0) * sample.tangent.y, 0),
  };
}

export class ContactPresentation {
  constructor({ rider, profile, ramp }) {
    Object.assign(this, { rider, profile, ramp });
    this.pendingPlant = null;
    this.plantContactPlayed = false;
  }

  reset() {
    this.pendingPlant = null;
    this.plantContactPlayed = false;
  }

  enrich(raw, state) {
    const type = String(raw.type || '').toUpperCase();
    const contactEvent = ['LANDING', 'BAIL', 'COPING_HIT', 'TAKEOFF'].includes(type);
    const measurements = measureBoardContacts(this.rider, this.profile, this.ramp, state,
      { project: contactEvent && state.mode !== 'airborne' });
    const event = { ...raw, ...measurements,
      worldVelocity: raw.worldVelocity || measurements?.worldVelocity };
    const side = Number(raw.side) || Math.sign(state.pipeX) || 1;
    const plant = String(raw.maneuver || raw.trick || '').toLowerCase() === 'hand-plant';
    const hand = this.rider.root.userData.handPlantIK;
    if (plant && hand?.plantTargetWorldPosition) event.handContactPosition = hand.plantTargetWorldPosition.clone();
    if (type === 'COPING_HIT') {
      event.contactKind = plant ? 'hand' : 'metal';
      const coping = this.ramp.getCopingContactPoint(side, measurements?.contactPosition.z || 0);
      if (coping) {
        event.contactPosition = coping;
        event.surfaceNormal = new THREE.Vector3(0, 1, 0);
      }
      if (plant) {
        this.pendingPlant = event;
        this.plantContactPlayed = false;
      }
    } else {
      event.contactKind = raw.contactKind || 'wheel';
      if (type === 'TAKEOFF') {
        const coping = this.ramp.getCopingContactPoint(side, measurements?.contactPosition.z || 0);
        if (coping) event.contactPosition = coping;
      }
    }
    event.worldPosition = event.contactPosition || raw.position;
    // Landing+BAIL are one physical contact even though gameplay emits two
    // semantic events. The audio/VFX layers share this stable contact identity.
    if (contactEvent) event.contactId = `${type === 'LANDING' || type === 'BAIL' ? 'landing' : 'lip'}:${raw.time ?? state.time}`;
    return event;
  }

  pollHandContact(state) {
    const hand = this.rider.root.userData.handPlantIK;
    const planting = this.rider.presentationState?.trickType === 'hand-plant'
      && this.rider.presentationState?.trickVisualActive;
    if (!planting) {
      this.reset();
      return null;
    }
    if (!this.pendingPlant || this.plantContactPlayed || !hand?.active
      || hand.weight < 0.9 || hand.contactError > 0.07 || !hand.plantTargetWorldPosition) return null;
    this.plantContactPlayed = true;
    const target = hand.plantTargetWorldPosition.clone();
    const event = { ...this.pendingPlant, type: 'HAND_PLANT_CONTACT', time: state.time,
      handContactPosition: target, plantedHandPosition: hand.plantHandWorldPosition?.clone(),
      plantHandWorldPosition: hand.plantHandWorldPosition?.clone(),
      contactPosition: target, worldPosition: target, contactKind: 'hand',
      contactId: `plant:${this.pendingPlant.time ?? state.time}`,
    };
    return event;
  }
}
