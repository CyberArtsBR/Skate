import * as THREE from 'three';
import { PHASE4_GAMEPLAY_CONFIG } from '../gameplay/phase4GameplayConfig.js';
import { collectSkaterImpactProbes, sampleHalfpipeClearance } from '../gameplay/SkaterImpactContacts.js';

export const ORDINARY_BAIL_TUNING = Object.freeze({
  preserveSeconds: 0.15,
  poseReleaseSeconds: 0.22,
  recoveryStart: 0.55,
  recoveryEnd: 0.9,
  gravity: 26,
  angularSpeed: 2.8,
  angularDamping: 3.2,
  surfaceMargin: 0.035,
  correctionLimit: 0.75,
  collisionIterations: 3,
  slideFriction: 2.8,
});

const CRASH_POSE = Object.freeze({
  kneeFlex: 1.0, hipFlex: 0.65, torsoCounter: 0.25,
  leftArmBalance: 0.8, rightArmBalance: 1.0,
  leftForearmDrop: 0.65, rightForearmDrop: 0.45,
});
const smoothstep = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// Keep the failed body pose while the existing board simulation resolves its
// ordinary bail. This controller never reparents or transforms the board and
// does not participate in impact-order decisions after that first contact.
export class OrdinaryBailPresentation {
  constructor({ rider, profile }) {
    Object.assign(this, { rider, profile });
    this.active = false;
    this.pelvisPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Quaternion();
    this.parentRotation = new THREE.Quaternion();
    this.spin = new THREE.Quaternion();
    this.offset = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.correction = new THREE.Vector3();
    this.normalBoneRotations = new Map();
  }

  capture() {
    const { rider } = this;
    rider.root.updateMatrixWorld(true);
    const carrier = rider.bodyCarrier;
    const rig = rider.chimpion.rigAdapter.rig;
    const position = carrier.getWorldPosition(new THREE.Vector3());
    const rotation = carrier.getWorldQuaternion(new THREE.Quaternion());
    const hips = rig.hips?.getWorldPosition(new THREE.Vector3()) || position.clone();
    const bodyOffset = position.clone().sub(hips).applyQuaternion(rotation.clone().invert());
    const bones = new Map();
    for (const bone of Object.values(rig)) {
      if (bone?.isBone && !bones.has(bone)) bones.set(bone, bone.quaternion.clone());
    }
    const state = rider.presentationState || {};
    const speed = Number(state.tangentVelocity) || 0;
    const angle = Number(state.surfaceAngle) || 0;
    const velocity = state.airborne
      ? new THREE.Vector3(0, Number(state.verticalVelocity) || 0, 0)
      : new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
    return { position, rotation, hips, bodyOffset, bones, velocity,
      side: Math.sign(state.wallSide) || Math.sign(position.x) || 1,
      chimpionRoot: rider.chimpion.root };
  }

  begin(snapshot, time = 0) {
    if (!snapshot || snapshot.chimpionRoot !== this.rider.chimpion.root) return;
    this.initial = snapshot;
    this.startTime = Number(time) || 0;
    this.lastTime = this.startTime;
    this.pelvisPosition.copy(snapshot.hips);
    this.velocity.copy(snapshot.velocity);
    this.rotation.copy(snapshot.rotation);
    this.normalBoneRotations.clear();
    this.active = true;
  }

  _place(position, rotation) {
    const carrier = this.rider.bodyCarrier;
    carrier.parent.updateMatrixWorld(true);
    this.parentRotation.copy(carrier.parent.getWorldQuaternion(this.parentRotation)).invert();
    carrier.quaternion.copy(this.parentRotation.multiply(rotation));
    carrier.position.copy(carrier.parent.worldToLocal(position.clone()));
    this.rider.root.updateMatrixWorld(true);
  }

  update(state = {}) {
    if (!this.active) return;
    if (state.severeCrash || !state.crashActive
      || this.initial.chimpionRoot !== this.rider.chimpion.root) { this.reset(); return; }
    const tuning = ORDINARY_BAIL_TUNING;
    const elapsed = Math.max(0, (Number(state.time) || 0) - this.startTime);
    const duration = PHASE4_GAMEPLAY_CONFIG.crash.recoverySeconds;
    const progress = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
    const recovery = smoothstep((progress - tuning.recoveryStart)
      / (tuning.recoveryEnd - tuning.recoveryStart));
    if (recovery >= 1) { this.reset(); return; }
    const dt = Math.min(0.05, Math.max(0, (Number(state.time) || 0) - this.lastTime));
    this.lastTime = Number(state.time) || this.lastTime;

    const { rider, initial } = this;
    const carrier = rider.bodyCarrier;
    rider.root.updateMatrixWorld(true);
    carrier.getWorldPosition(this.targetPosition);
    carrier.getWorldQuaternion(this.targetRotation);
    for (const bone of initial.bones.keys()) {
      if (!this.normalBoneRotations.has(bone)) this.normalBoneRotations.set(bone, new THREE.Quaternion());
      this.normalBoneRotations.get(bone).copy(bone.quaternion);
    }

    // Continue existing momentum briefly around the hips instead of instantly
    // restoring the failed flip to a standing pose at board touchdown.
    this.velocity.y -= tuning.gravity * dt;
    this.pelvisPosition.addScaledVector(this.velocity, dt);
    const spinAngle = -initial.side * tuning.angularSpeed * Math.exp(-tuning.angularDamping * elapsed) * dt;
    this.spin.setFromAxisAngle(this.normal.set(0, 0, 1), spinAngle);
    this.rotation.premultiply(this.spin).normalize();
    this.offset.copy(initial.bodyOffset).applyQuaternion(this.rotation);
    const position = this.offset.add(this.pelvisPosition).lerp(this.targetPosition, recovery);
    const rotation = this.spin.copy(this.rotation).slerp(this.targetRotation, recovery);

    const pose = { ...(rider.smoothedPose || {}) };
    for (const [key, value] of Object.entries(CRASH_POSE)) {
      pose[key] = THREE.MathUtils.lerp(Number(pose[key]) || 0, value, 1 - recovery);
    }
    rider.chimpion.updatePose(pose);
    const preserve = 1 - smoothstep((elapsed - tuning.preserveSeconds) / tuning.poseReleaseSeconds);
    for (const [bone, original] of initial.bones) {
      bone.quaternion.slerp(original, preserve).slerp(this.normalBoneRotations.get(bone), recovery);
    }
    this._place(position, rotation);

    // Feet may release during a bail, but the visible body still respects the
    // real ramp. Correct the body carrier only; board contact stays authored.
    for (let iteration = 0; iteration < tuning.collisionIterations; iteration++) {
      let deepest = null;
      for (const probe of collectSkaterImpactProbes(rider)) {
        if (probe.type === 'BOARD') continue;
        const hit = sampleHalfpipeClearance(this.profile, probe.position, probe.radius);
        if (hit.clearance < tuning.surfaceMargin && (!deepest || hit.clearance < deepest.clearance)) deepest = hit;
      }
      if (!deepest) break;
      this.normal.set(deepest.normal.x, deepest.normal.y, deepest.normal.z).normalize();
      this.correction.copy(this.normal).multiplyScalar(Math.min(tuning.correctionLimit,
        tuning.surfaceMargin - deepest.clearance));
      position.add(this.correction);
      this.pelvisPosition.addScaledVector(this.correction, 1 - recovery);
      const inward = this.velocity.dot(this.normal);
      if (inward < 0) this.velocity.addScaledVector(this.normal, -inward);
      this.velocity.multiplyScalar(Math.exp(-tuning.slideFriction * dt));
      this._place(position, rotation);
    }
  }

  reset() {
    this.active = false;
    this.initial = null;
    this.normalBoneRotations.clear();
  }
}
