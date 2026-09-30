import * as THREE from 'three';

const origin = new THREE.Vector3(), knee = new THREE.Vector3(), end = new THREE.Vector3();
const direction = new THREE.Vector3(), bend = new THREE.Vector3(), desired = new THREE.Vector3();
const from = new THREE.Vector3(), to = new THREE.Vector3(), offset = new THREE.Vector3();
const delta = new THREE.Quaternion(), parent = new THREE.Quaternion();
const inverseParent = new THREE.Matrix4();

function aim(joint, effector, target) {
  joint.getWorldPosition(from);
  effector.getWorldPosition(to).sub(from).normalize();
  offset.copy(target).sub(from).normalize();
  // Some roster rigs contain mirrored parent scales. A quaternion-only
  // world/local conversion discards that reflection and bends the wrong way.
  inverseParent.copy(joint.parent.matrixWorld).invert();
  to.transformDirection(inverseParent);
  offset.transformDirection(inverseParent);
  delta.setFromUnitVectors(to, offset);
  joint.quaternion.premultiply(delta).normalize();
  joint.updateWorldMatrix(true, true);
}

// Exact two-link reach with an explicit bend plane. Only rotations change:
// bone lengths, the board transform and the simulation remain authoritative.
export function solveTwoBone(upper, lower, effector, target, pole, weight = 1) {
  const upperBefore = upper.quaternion.clone(), lowerBefore = lower.quaternion.clone();
  upper.getWorldPosition(origin);
  lower.getWorldPosition(knee);
  effector.getWorldPosition(end);
  const l1 = origin.distanceTo(knee), l2 = knee.distanceTo(end);
  const distance = THREE.MathUtils.clamp(origin.distanceTo(target), Math.abs(l1 - l2) + 1e-5, l1 + l2 - 1e-5);
  direction.copy(target).sub(origin).normalize();
  offset.copy(pole).sub(origin);
  bend.copy(offset).addScaledVector(direction, -offset.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(direction.y) < 0.9 ? 0 : 1, Math.abs(direction.y) < 0.9 ? 1 : 0, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  const along = (l1 * l1 + distance * distance - l2 * l2) / (2 * distance);
  desired.copy(origin).addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  aim(upper, lower, desired);
  aim(lower, effector, target);
  if (weight < 1) {
    upper.quaternion.slerpQuaternions(upperBefore, upper.quaternion.clone(), weight);
    lower.quaternion.slerpQuaternions(lowerBefore, lower.quaternion.clone(), weight);
    upper.updateWorldMatrix(true, true);
  }
  return effector.getWorldPosition(end).distanceTo(target);
}

export function matchWorldRotation(bone, rotation) {
  bone.parent.getWorldQuaternion(parent);
  bone.quaternion.copy(parent).invert().multiply(rotation);
  bone.updateWorldMatrix(true, true);
}
