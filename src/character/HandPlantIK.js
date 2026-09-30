import * as THREE from 'three';
import { solveTwoBone } from './TwoBoneIK.js';

const jointPosition = new THREE.Vector3();
const effectorPosition = new THREE.Vector3();
const toEffector = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const worldDelta = new THREE.Quaternion();
const parentWorld = new THREE.Quaternion();
const localDelta = new THREE.Quaternion();
const axis = new THREE.Vector3();
const fallbackTarget = new THREE.Vector3();

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

  worldDelta.setFromUnitVectors(toEffector.normalize(), toTarget.normalize());
  limitQuaternion(worldDelta, maxAngle * clamp01(weight));
  joint.parent.getWorldQuaternion(parentWorld);
  localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld);
  joint.quaternion.premultiply(localDelta).normalize();
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
      const distance = hand.getWorldPosition(new THREE.Vector3()).distanceToSquared(target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = side;
      }
    }

    if (!Number.isFinite(bestDistance)) return Number(wallSide) < 0 ? 'left' : 'right';
    return best;
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
      this.selectedPlantHand = null;
      this.result.side = null;
      this.result.selectedPlantHand = null;
      return this.result;
    }

    const t = clamp01(progress);
    // Reach the coping earlier, hold a true planted phase through the middle of
    // the maneuver, then release late. This produces a clear contact beat and
    // prevents the hand from visibly floating away while the body is inverted.
    const reach = smoothstep(t / 0.26);
    const release = t <= 0.84 ? 1 : 1 - smoothstep((t - 0.84) / 0.16);
    const weight = clamp01(reach * release);

    const target = targetFromInput({ copingWorldPoint }, this.riderRoot, side).clone();
    this.riderRoot.updateWorldMatrix(true, true);

    // Select exactly once at maneuver start. Never switch hands during the
    // inverted pose even if the other hand becomes momentarily closer.
    if (!this.selectedPlantHand) {
      this.selectedPlantHand = this._selectSide(target, side);
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

    const pole = forearm.getWorldPosition(new THREE.Vector3());
    rotateJointToward(shoulder, hand, target, weight * 0.5, 0.095);
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
    this.result.plantHandWorldPosition = handWorld.clone();
    this.result.plantTargetWorldPosition = target.clone();
    return this.result;
  }
}
