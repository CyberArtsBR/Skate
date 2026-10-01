import * as THREE from 'three';
import { solveTwoBone } from './TwoBoneIK.js';
import { HANDPLANT_CLEARANCE as PLANT_TUNING } from '../gameplay/CrashPresentationTuning.js';

const jointPosition = new THREE.Vector3();
const effectorPosition = new THREE.Vector3();
const toEffector = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const worldDelta = new THREE.Quaternion();
const inverseParent = new THREE.Matrix4();
const axis = new THREE.Vector3();
const fallbackTarget = new THREE.Vector3();
const SHOULDER_FOLLOW_LIMIT = 0.06;

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function limitQuaternion(quaternion, maxAngle) {
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(quaternion.w, -1, 1));
  if (angle <= maxAngle || angle < 1e-6) return quaternion;
  axis.set(quaternion.x, quaternion.y, quaternion.z);
  if (axis.lengthSq() < 1e-8) return quaternion.identity();
  return quaternion.setFromAxisAngle(axis.normalize(), maxAngle);
}

function rotateJointToward(joint, effector, target, weight, maxAngle) {
  if (!joint || !effector || !joint.parent) return;
  joint.getWorldPosition(jointPosition);
  effector.getWorldPosition(effectorPosition);
  toEffector.copy(effectorPosition).sub(jointPosition);
  toTarget.copy(target).sub(jointPosition);
  if (toEffector.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) return;

  // Full parent matrices preserve mirrored avatar scales as well as rotation.
  inverseParent.copy(joint.parent.matrixWorld).invert();
  toEffector.transformDirection(inverseParent);
  toTarget.transformDirection(inverseParent);
  worldDelta.setFromUnitVectors(toEffector.normalize(), toTarget.normalize());
  limitQuaternion(worldDelta, maxAngle * clamp01(weight));
  joint.quaternion.premultiply(worldDelta).normalize();
}

function targetFromInput(input, riderRoot, side) {
  const point = input?.copingWorldPoint;
  if (point && [point.x, point.y, point.z].every(Number.isFinite)) {
    return fallbackTarget.set(point.x, point.y, point.z);
  }

  riderRoot.updateWorldMatrix(true, true);
  riderRoot.getWorldPosition(fallbackTarget);
  fallbackTarget.x += (Number(side) || 1) * 0.16;
  fallbackTarget.y += 0.06;
  return fallbackTarget;
}

export class HandPlantIK {
  constructor({ rigAdapter, riderRoot }) {
    this.rigAdapter = rigAdapter;
    this.riderRoot = riderRoot;
    this.selectedPlantHand = null;
    this.plantFacingSign = 1;
    this.contactTarget = null;
    this.elbowDepthSign = 1;
    this.result = {
      active: false,
      side: null,
      selectedPlantHand: null,
      weight: 0,
      error: 0,
      contactError: 0,
      plantHandWorldPosition: null,
      plantTargetWorldPosition: null,
      degraded: false,
    };
  }

  _availableSides() {
    const capabilities = this.rigAdapter?.capabilities || {};
    const sides = [];
    if (capabilities.leftArm) sides.push('left');
    if (capabilities.rightArm) sides.push('right');
    return sides;
  }

  _selectSide(target, wallSide) {
    const sides = this._availableSides();
    if (sides.length <= 1) return sides[0] || null;

    let best = sides[0];
    let bestDistance = Infinity;
    for (const side of sides) {
      const hand = this.rigAdapter.rig[`${side}Hand`];
      if (!hand) continue;
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      // The coping runs along Z. Measure the closest wrist to the actual bar,
      // rather than to its center or an already-inverted animation pose.
      // Measuring in world space automatically respects regular/fakie facing.
      const distance = (wrist.x - target.x) ** 2 + (wrist.y - target.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = side;
      }
    }

    if (!Number.isFinite(bestDistance)) return Number(wallSide) < 0 ? 'left' : 'right';
    return best;
  }

  resetPlant() {
    this.selectedPlantHand = null;
    this.contactTarget = null;
  }

  beginPlant({ copingWorldPoint = null, side = 0, facingYaw = 0 } = {}) {
    this.resetPlant();
    if (!this.rigAdapter || !this.riderRoot) return null;
    this.riderRoot.updateWorldMatrix(true, true);
    const target = targetFromInput({ copingWorldPoint }, this.riderRoot, side).clone();
    this.selectedPlantHand = this._selectSide(target, side);
    this.plantFacingSign = Math.cos(facingYaw) < 0 ? -1 : 1;
    if (!this.selectedPlantHand) return null;
    const rig = this.rigAdapter.rig;
    const wrist = rig[`${this.selectedPlantHand}Hand`].getWorldPosition(new THREE.Vector3());
    const elbow = rig[`${this.selectedPlantHand}Forearm`].getWorldPosition(new THREE.Vector3());
    // Plant beside the incoming shoulder, not across the rider's body at the
    // midpoint of the rail. This point stays fixed throughout the 180 turn.
    target.z = THREE.MathUtils.clamp(wrist.z, -3.7, 3.7);
    this.contactTarget = target;
    this.elbowDepthSign = Math.sign(elbow.z - target.z) || this.plantFacingSign;
    return { side: this.selectedPlantHand, target: target.clone(), facingSign: this.plantFacingSign };
  }

  getReachConstraint({ copingWorldPoint = null, side = 0, progress = 0 } = {}) {
    if (!this.rigAdapter || !this.riderRoot) return null;
    const target = this.contactTarget?.clone()
      || targetFromInput({ copingWorldPoint }, this.riderRoot, side).clone();
    this.riderRoot.updateWorldMatrix(true, true);
    if (!this.selectedPlantHand) this.selectedPlantHand = this._selectSide(target, side);
    const plantSide = this.selectedPlantHand;
    if (!plantSide) return null;
    const rig = this.rigAdapter.rig;
    const upper = rig[`${plantSide}UpperArm`], lower = rig[`${plantSide}Forearm`], hand = rig[`${plantSide}Hand`];
    if (!upper || !lower || !hand) return null;
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbow = lower.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const upperLength = shoulder.distanceTo(elbow), lowerLength = elbow.distanceTo(wrist);
    const t = clamp01(progress);
    const weight = smoothstep(t / PLANT_TUNING.enterEnd)
      * (1 - smoothstep((t - PLANT_TUNING.releaseStart) / (1 - PLANT_TUNING.releaseStart)));
    return { side: plantSide, target, shoulder, wrist,
      minimum: Math.abs(upperLength - lowerLength) + Math.min(upperLength, lowerLength) * 0.035,
      maximum: Math.max(0.02, (upperLength + lowerLength) * 0.985), weight };
  }

  update({
    active = false,
    progress = 0,
    side = 0,
    copingWorldPoint = null,
    facingYaw = 0,
  } = {}) {
    this.result.active = false;
    this.result.weight = 0;
    this.result.error = 0;
    this.result.contactError = 0;
    this.result.plantHandWorldPosition = null;
    this.result.plantTargetWorldPosition = null;
    this.result.degraded = false;

    if (!active || !this.rigAdapter || !this.riderRoot) {
      this.resetPlant();
      this.result.side = null;
      this.result.selectedPlantHand = null;
      return this.result;
    }

    const t = clamp01(progress);
    // Reach the coping earlier, hold a true planted phase through the middle of
    // the maneuver, then release late. This produces a clear contact beat and
    // prevents the hand from visibly floating away while the body is inverted.
    const reach = smoothstep(t / PLANT_TUNING.enterEnd);
    const release = 1 - smoothstep((t - PLANT_TUNING.releaseStart) / (1 - PLANT_TUNING.releaseStart));
    const weight = clamp01(reach * release);

    const target = this.contactTarget?.clone()
      || targetFromInput({ copingWorldPoint }, this.riderRoot, side).clone();
    this.riderRoot.updateWorldMatrix(true, true);

    // Select exactly once at maneuver start. Never switch hands during the
    // inverted pose even if the other hand becomes momentarily closer.
    if (!this.selectedPlantHand) {
      this.beginPlant({ copingWorldPoint, side, facingYaw });
      if (this.contactTarget) target.copy(this.contactTarget);
    }
    const plantSide = this.selectedPlantHand;
    if (!plantSide) {
      this.result.degraded = true;
      return this.result;
    }

    const upperArm = this.rigAdapter.rig[`${plantSide}UpperArm`];
    const forearm = this.rigAdapter.rig[`${plantSide}Forearm`];
    const hand = this.rigAdapter.rig[`${plantSide}Hand`];
    const shoulder = this.rigAdapter.rig[`${plantSide}Shoulder`];
    if (!upperArm || !forearm || !hand) {
      this.result.degraded = true;
      return this.result;
    }

    const shoulderPoint = upperArm.getWorldPosition(new THREE.Vector3());
    const elbowPoint = forearm.getWorldPosition(new THREE.Vector3());
    const wristPoint = hand.getWorldPosition(new THREE.Vector3());
    const armLength = shoulderPoint.distanceTo(elbowPoint) + elbowPoint.distanceTo(wristPoint);
    const supportPole = shoulderPoint.clone().lerp(target, 0.5);
    // A stable coping-space bend plane prevents elbow flips as the rider turns
    // from normal to fakie. All offsets scale with this avatar's measured arm.
    supportPole.x -= (Math.sign(side) || 1) * armLength * 0.30;
    supportPole.y += armLength * 0.10;
    supportPole.z += this.elbowDepthSign * armLength * 0.28;
    const pole = elbowPoint.lerp(supportPole, smoothstep(weight));
    rotateJointToward(shoulder, hand, target, weight * 0.25, SHOULDER_FOLLOW_LIMIT);
    this.riderRoot.updateWorldMatrix(true, true);
    solveTwoBone(upperArm, forearm, hand, target, pole, weight);

    const handWorld = hand.getWorldPosition(new THREE.Vector3());
    const error = handWorld.distanceTo(target);
    this.result.active = weight > 0.001;
    this.result.side = plantSide;
    this.result.selectedPlantHand = plantSide;
    this.result.weight = weight;
    this.result.error = Number.isFinite(error) ? error : 0;
    this.result.contactError = this.result.error;
    this.result.degraded = weight > 0.98 && error > 0.035;
    this.result.plantHandWorldPosition = handWorld.clone();
    this.result.plantTargetWorldPosition = target.clone();
    return this.result;
  }
}
