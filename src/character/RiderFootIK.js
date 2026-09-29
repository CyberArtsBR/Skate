import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

const worldJointPosition = new THREE.Vector3();
const worldEffectorPosition = new THREE.Vector3();
const toEffector = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const worldDelta = new THREE.Quaternion();
const parentWorld = new THREE.Quaternion();
const localDelta = new THREE.Quaternion();
const rotationAxis = new THREE.Vector3();

function limitQuaternion(quaternion, maxAngle) {
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(quaternion.w, -1, 1));
  if (angle <= maxAngle || angle < 1e-5) return quaternion;
  rotationAxis.set(quaternion.x, quaternion.y, quaternion.z);
  if (rotationAxis.lengthSq() < 1e-8) return quaternion.identity();
  return quaternion.setFromAxisAngle(rotationAxis.normalize(), maxAngle);
}

function rotateJointToward(joint, effector, target, weight, maxAngle) {
  joint.getWorldPosition(worldJointPosition);
  effector.getWorldPosition(worldEffectorPosition);
  toEffector.copy(worldEffectorPosition).sub(worldJointPosition);
  toTarget.copy(target).sub(worldJointPosition);
  if (toEffector.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) return;

  worldDelta.setFromUnitVectors(toEffector.normalize(), toTarget.normalize());
  limitQuaternion(worldDelta, maxAngle * weight);
  joint.parent.getWorldQuaternion(parentWorld);
  localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld);
  joint.quaternion.premultiply(localDelta).normalize();
}

function localFootPosition(root, foot) {
  root.updateWorldMatrix(true, true);
  return root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
}

function finiteVector(vector) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

export class RiderFootIK {
  constructor({ rigAdapter, riderRoot, skateboard, chimpionRoot, stance = 'regular' }) {
    this.rigAdapter = rigAdapter;
    this.riderRoot = riderRoot;
    this.skateboard = skateboard;
    this.chimpionRoot = chimpionRoot;
    this.stance = stance === 'goofy' ? 'goofy' : 'regular';
    this.enabled = rigAdapter.capabilities.leftLeg && rigAdapter.capabilities.rightLeg;
    this.targets = {};
    this.result = {
      enabled: this.enabled,
      weight: 0,
      leftError: 0,
      rightError: 0,
      maxError: 0,
    };
    if (this.enabled) this.createTargets();
  }

  createTargets() {
    const { leftFoot, rightFoot } = this.rigAdapter.rig;
    const leftRest = localFootPosition(this.chimpionRoot, leftFoot);
    const rightRest = localFootPosition(this.chimpionRoot, rightFoot);
    const frontSign = this.stance === 'regular' ? 1 : -1;
    const halfLength = this.skateboard.stanceHalfLength;
    const deckY = this.skateboard.deckSurfaceY;
    const clearance = this.chimpionRoot.position.y - deckY;

    const specs = {
      left: {
        x: frontSign * halfLength,
        z: leftRest.z + this.skateboard.footLateralOffset,
        ankleHeight: leftRest.y,
        role: this.stance === 'regular' ? 'front' : 'rear',
      },
      right: {
        x: -frontSign * halfLength,
        z: rightRest.z - this.skateboard.footLateralOffset,
        ankleHeight: rightRest.y,
        role: this.stance === 'regular' ? 'rear' : 'front',
      },
    };

    for (const [side, spec] of Object.entries(specs)) {
      const target = new THREE.Object3D();
      target.name = `${side}-${spec.role}-foot-deck-target`;
      target.position.set(spec.x, deckY + clearance + spec.ankleHeight, spec.z);
      target.userData.foot = side;
      target.userData.stanceRole = spec.role;
      target.userData.baseY = target.position.y;
      this.skateboard.root.add(target);
      this.targets[side] = target;
    }
  }

  solveLeg(side, weight) {
    const thigh = this.rigAdapter.rig[`${side}Thigh`];
    const shin = this.rigAdapter.rig[`${side}Shin`];
    const foot = this.rigAdapter.rig[`${side}Foot`];
    const target = this.targets[side].getWorldPosition(new THREE.Vector3());
    if (!finiteVector(target)) return 0;

    for (let iteration = 0; iteration < 5; iteration += 1) {
      rotateJointToward(shin, foot, target, weight, 0.11);
      this.riderRoot.updateWorldMatrix(true, true);
      rotateJointToward(thigh, foot, target, weight, 0.09);
      this.riderRoot.updateWorldMatrix(true, true);
    }

    const error = foot.getWorldPosition(new THREE.Vector3()).distanceTo(target);
    return Number.isFinite(error) ? error : 0;
  }

  update(state = {}) {
    if (!this.enabled) return this.result;

    const facingYaw = Number(state.facingYaw) || 0;
    const backAmount = (1 - Math.cos(facingYaw)) * 0.5;
    const targetDrop = GAME_CONFIG.rider.fakieFootTargetDrop * backAmount;
    for (const target of Object.values(this.targets)) {
      target.position.y = target.userData.baseY - targetDrop;
    }

    this.riderRoot.updateWorldMatrix(true, true);
    const requestedWeight = Number(state.footIKWeight);
    const weight = THREE.MathUtils.clamp(
      Number.isFinite(requestedWeight)
        ? requestedWeight
        : state.airborne ? 0.3 : 1,
      0,
      1,
    );
    this.result.weight = weight;
    if (weight <= 0.001) {
      this.result.leftError = 0;
      this.result.rightError = 0;
      this.result.maxError = 0;
      return this.result;
    }

    this.result.leftError = this.solveLeg('left', weight);
    this.result.rightError = this.solveLeg('right', weight);
    this.result.maxError = Math.max(this.result.leftError, this.result.rightError);
    return this.result;
  }
}
