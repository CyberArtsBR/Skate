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
const targetA = new THREE.Vector3();
const targetB = new THREE.Vector3();

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

function armAvailable(rigAdapter, side) {
  return Boolean(
    rigAdapter?.capabilities?.[`${side}Arm`]
    && rigAdapter?.rig?.[`${side}UpperArm`]
    && rigAdapter?.rig?.[`${side}Forearm`]
    && rigAdapter?.rig?.[`${side}Hand`],
  );
}

export class BackflipGrabIK {
  constructor({ rigAdapter, riderRoot, skateboard }) {
    this.rigAdapter = rigAdapter;
    this.riderRoot = riderRoot;
    this.skateboard = skateboard;
    this.result = {
      active: false,
      weight: 0,
      leftError: 0,
      rightError: 0,
      maxError: 0,
      degraded: false,
    };
  }

  _downwardTargets() {
    const deckY = Number(this.skateboard?.deckSurfaceY) || 0;
    this.skateboard.root.updateWorldMatrix(true, true);
    for (const [side, target] of [['left', targetA], ['right', targetB]]) {
      const rig = this.rigAdapter.rig;
      const upper = rig[`${side}UpperArm`];
      const forearm = rig[`${side}Forearm`];
      const hand = rig[`${side}Hand`];
      if (!upper || !forearm || !hand) continue;
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = forearm.getWorldPosition(new THREE.Vector3());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
      const localShoulder = this.skateboard.root.worldToLocal(shoulder);
      const knee = rig[`${side}Shin`]?.getWorldPosition(new THREE.Vector3());
      if (knee) this.skateboard.root.worldToLocal(knee);
      // Reach below each shoulder beside its knee, not across the chest or
      // toward a shared deck-center point. This scales with each avatar's arms
      // and remains downward relative to the board even during inversion/yaw.
      target.set(
        localShoulder.x * 0.75 + (knee?.x ?? localShoulder.x) * 0.25,
        Math.max(deckY + 0.035, localShoulder.y - reach * 0.88),
        localShoulder.z * 0.65 + (knee?.z ?? localShoulder.z) * 0.35 + reach * 0.035,
      );
      this.skateboard.root.localToWorld(target);
    }
    return [targetA, targetB];
  }

  _solveArm(side, target, weight) {
    const upperArm = this.rigAdapter.rig[`${side}UpperArm`];
    const forearm = this.rigAdapter.rig[`${side}Forearm`];
    const hand = this.rigAdapter.rig[`${side}Hand`];
    const shoulder = this.rigAdapter.rig[`${side}Shoulder`];
    if (!upperArm || !forearm || !hand) return 0;

    const pole = upperArm.getWorldPosition(new THREE.Vector3());
    this.skateboard.root.worldToLocal(pole);
    const lateral = Math.sign(pole.x) || (side === 'left' ? 1 : -1);
    pole.x += lateral * 0.20;
    pole.y -= 0.18;
    pole.z += 0.22;
    this.skateboard.root.localToWorld(pole);
    rotateJointToward(shoulder, hand, target, weight * 0.5, 0.095);
    this.riderRoot.updateWorldMatrix(true, true);
    solveTwoBone(upperArm, forearm, hand, target, pole, weight);

    const error = hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
    return Number.isFinite(error) ? error : 0;
  }

  update({ active = false, progress = 0, crouchWeight = null } = {}) {
    this.result.active = false;
    this.result.weight = 0;
    this.result.leftError = 0;
    this.result.rightError = 0;
    this.result.maxError = 0;
    this.result.degraded = false;

    if (!active || !this.rigAdapter || !this.riderRoot || !this.skateboard?.root) {
      return this.result;
    }

    const leftReady = armAvailable(this.rigAdapter, 'left');
    const rightReady = armAvailable(this.rigAdapter, 'right');
    if (!leftReady && !rightReady) {
      this.result.degraded = true;
      return this.result;
    }

    const t = clamp01(progress);
    const reach = smoothstep(t / 0.18);
    const release = t <= 0.78 ? 1 : 1 - smoothstep((t - 0.78) / 0.22);
    const weight = crouchWeight === null
      ? clamp01(reach * release)
      : clamp01(crouchWeight);
    this.result.weight = weight;
    if (weight <= 0.001) return this.result;

    this.riderRoot.updateWorldMatrix(true, true);
    const [leftTarget, rightTarget] = this._downwardTargets();
    if (leftReady) this.result.leftError = this._solveArm('left', leftTarget, weight);
    if (rightReady) this.result.rightError = this._solveArm('right', rightTarget, weight);
    this.result.maxError = Math.max(this.result.leftError, this.result.rightError);
    this.result.active = true;
    this.result.degraded = !(leftReady && rightReady);
    return this.result;
  }
}
