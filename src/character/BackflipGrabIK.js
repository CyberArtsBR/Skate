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

  _deckTargets() {
    const halfSpan = THREE.MathUtils.clamp(
      Number(this.skateboard?.stanceHalfLength) * 0.56 || 0.135,
      0.10,
      0.18,
    );
    const deckY = Number(this.skateboard?.deckSurfaceY) || 0;
    this.skateboard.root.updateWorldMatrix(true, true);
    targetA.set(-halfSpan, deckY + 0.018, 0);
    targetB.set(halfSpan, deckY + 0.018, 0);
    this.skateboard.root.localToWorld(targetA);
    this.skateboard.root.localToWorld(targetB);
    return [targetA, targetB];
  }

  _solveArm(side, target, weight) {
    const upperArm = this.rigAdapter.rig[`${side}UpperArm`];
    const forearm = this.rigAdapter.rig[`${side}Forearm`];
    const hand = this.rigAdapter.rig[`${side}Hand`];
    const shoulder = this.rigAdapter.rig[`${side}Shoulder`];
    if (!upperArm || !forearm || !hand) return 0;

    const pole = forearm.getWorldPosition(new THREE.Vector3());
    rotateJointToward(shoulder, hand, target, weight * 0.5, 0.095);
    this.riderRoot.updateWorldMatrix(true, true);
    solveTwoBone(upperArm, forearm, hand, target, pole, weight);

    const error = hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
    return Number.isFinite(error) ? error : 0;
  }

  update({ active = false, progress = 0 } = {}) {
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
    const weight = clamp01(reach * release);
    this.result.weight = weight;
    if (weight <= 0.001) return this.result;

    const [a, b] = this._deckTargets();
    this.riderRoot.updateWorldMatrix(true, true);

    let leftTarget = a;
    let rightTarget = b;
    if (leftReady && rightReady) {
      const leftHand = this.rigAdapter.rig.leftHand.getWorldPosition(new THREE.Vector3());
      const rightHand = this.rigAdapter.rig.rightHand.getWorldPosition(new THREE.Vector3());
      const direct = leftHand.distanceToSquared(a) + rightHand.distanceToSquared(b);
      const crossed = leftHand.distanceToSquared(b) + rightHand.distanceToSquared(a);
      if (crossed < direct) {
        leftTarget = b;
        rightTarget = a;
      }
    }

    if (leftReady) this.result.leftError = this._solveArm('left', leftTarget, weight);
    if (rightReady) this.result.rightError = this._solveArm('right', rightTarget, weight);
    this.result.maxError = Math.max(this.result.leftError, this.result.rightError);
    this.result.active = true;
    this.result.degraded = !(leftReady && rightReady);
    return this.result;
  }
}
