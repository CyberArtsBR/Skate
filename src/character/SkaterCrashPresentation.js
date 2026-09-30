import * as THREE from 'three';
import { collectSkaterImpactProbes, sampleHalfpipeClearance } from '../gameplay/SkaterImpactContacts.js';
import { CRASH_PRESENTATION as TUNING } from '../gameplay/CrashPresentationTuning.js';

const spin = new THREE.Quaternion(), axis = new THREE.Vector3(), displacement = new THREE.Vector3();
const CRASH_POSE = Object.freeze({
  kneeFlex: 1.1, hipFlex: 0.65, torsoCounter: 0.25,
  leftArmBalance: 0.9, rightArmBalance: 1.1,
  leftForearmDrop: 0.65, rightForearmDrop: 0.45, headLook: 0.18,
});

function remember(object) {
  return { object, parent: object.parent, position: object.position.clone(),
    quaternion: object.quaternion.clone(), scale: object.scale.clone() };
}

// A small deterministic crash simulation for this procedural rig. It runs on
// the same visible assets, releases foot IK and preserves their world pose at
// separation. Normal board/contact physics are suspended by SEVERE_CRASH.
export class SkaterCrashPresentation {
  constructor({ scene, rider, profile }) {
    Object.assign(this, { scene, rider, profile });
    this.active = false;
    this.body = new THREE.Group();
    this.body.name = 'severe-crash-body-motion';
    this.bodyVelocity = new THREE.Vector3();
    this.boardVelocity = new THREE.Vector3();
    this.bodySpin = new THREE.Vector3();
    this.boardSpin = new THREE.Vector3();
    this.elapsed = 0;
  }

  begin(contact, velocity = { x: 0, y: 0, z: 0 }) {
    if (this.active) return;
    this.active = true;
    this.elapsed = 0;
    const { rider } = this;
    rider.root.updateMatrixWorld(true);
    this.savedBody = remember(rider.bodyCarrier);
    this.savedBoard = remember(rider.skateboard.root);
    rider.chimpion.rigAdapter.rig.hips.getWorldPosition(this.body.position);
    this.body.quaternion.identity();
    this.scene.add(this.body);
    this.body.attach(rider.bodyCarrier);
    this.scene.attach(rider.skateboard.root);
    const normal = new THREE.Vector3(contact.normal?.x || 0, contact.normal?.y || 0, contact.normal?.z || 0);
    if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
    normal.normalize();
    const side = Math.sign(contact.position?.x || rider.root.position.x) || 1;
    this.bodyVelocity.set(velocity.x || 0, velocity.y || 0, velocity.z || 0)
      .addScaledVector(normal, TUNING.bodySeparationSpeed);
    this.boardVelocity.set(velocity.x || 0, velocity.y || 0, velocity.z || 0)
      .addScaledVector(normal, TUNING.boardSeparationSpeed)
      .add(new THREE.Vector3(-side * 3.4, 2.5, 1.5));
    this.bodySpin.set(0.2, -side * 0.35, -side * TUNING.bodyAngularSpeed);
    this.boardSpin.set(3.4, side * 2.4, side * TUNING.boardAngularSpeed);
    this.initialPose = { ...(rider.smoothedPose || {}) };
    this.initialBoneRotations = new Map();
    for (const bone of Object.values(rider.chimpion.rigAdapter.rig)) {
      if (bone?.isBone && !this.initialBoneRotations.has(bone)) {
        this.initialBoneRotations.set(bone, bone.quaternion.clone());
      }
    }
    this.body.updateMatrixWorld(true);
    rider.skateboard.root.updateMatrixWorld(true);
    rider.root.userData.severeCrash = { detachedBoard: true, firstImpact: contact };
  }

  _applyCrashPose() {
    const blend = 1 - Math.exp(-this.elapsed * 9);
    const pose = { ...this.initialPose };
    for (const [key, value] of Object.entries(CRASH_POSE)) {
      pose[key] = THREE.MathUtils.lerp(Number(pose[key]) || 0, value, blend);
    }
    this.rider.chimpion.updatePose(pose);
    // The launch pose contains foot/grab IK corrections which numeric pose
    // parameters cannot reproduce. Begin from those visible bone rotations
    // and release them smoothly into the folded crash pose.
    for (const [bone, initialRotation] of this.initialBoneRotations) {
      bone.quaternion.slerp(initialRotation, 1 - blend);
    }
  }

  _rotate(object, angularVelocity, dt) {
    const speed = angularVelocity.length();
    if (speed < 1e-5) return;
    axis.copy(angularVelocity).multiplyScalar(1 / speed);
    spin.setFromAxisAngle(axis, speed * dt);
    object.quaternion.premultiply(spin).normalize();
  }

  _collide(object, velocity, angularVelocity, probes, restitution, friction, dt) {
    let deepest = null;
    for (const probe of probes) {
      let hit = sampleHalfpipeClearance(this.profile, probe.position, probe.radius);
      // The existing ground is also a floor outside either end of the finite
      // ramp, and a final lower bound if a spinning probe misses its edge.
      const groundClearance = probe.position.y - probe.radius;
      if (!Number.isFinite(hit.clearance)
        || groundClearance < Math.min(hit.clearance, TUNING.surfaceMargin)) hit = { clearance: groundClearance,
        normal: { x: 0, y: 1, z: 0 } };
      if (hit.clearance < TUNING.surfaceMargin && (!deepest || hit.clearance < deepest.clearance)) deepest = hit;
    }
    if (!deepest) return;
    const n = axis.set(deepest.normal.x, deepest.normal.y, deepest.normal.z).normalize();
    object.position.addScaledVector(n, Math.min(1.2, TUNING.surfaceMargin - deepest.clearance));
    const inward = velocity.dot(n);
    if (inward < 0) velocity.addScaledVector(n, -(1 + restitution) * inward);
    // Friction acts along the surface, leaving the rebound normal intact.
    const normalSpeed = velocity.dot(n);
    displacement.copy(velocity).addScaledVector(n, -normalSpeed);
    velocity.addScaledVector(displacement, -(1 - Math.exp(-friction * dt)));
    angularVelocity.multiplyScalar(Math.exp(-7 * dt));
  }

  update(dt) {
    if (!this.active) return;
    const duration = Math.min(0.1, Math.max(0, Number(dt) || 0));
    if (duration <= 0) return;
    const steps = Math.max(1, Math.ceil(duration / TUNING.fixedDt));
    const step = duration / steps;
    const board = this.rider.skateboard.root;
    for (let i = 0; i < steps; i++) {
      this.elapsed += step;
      this.bodyVelocity.y -= TUNING.gravity * step;
      this.boardVelocity.y -= TUNING.gravity * step;
      this.body.position.addScaledVector(this.bodyVelocity, step);
      board.position.addScaledVector(this.boardVelocity, step);
      this._rotate(this.body, this.bodySpin, step);
      this._rotate(board, this.boardSpin, step);
      // Sample the pose that will actually be drawn. Applying this after
      // collision would allow the newly folded head/arms to penetrate again.
      this._applyCrashPose();
      this.body.updateMatrixWorld(true);
      board.updateMatrixWorld(true);
      const probes = collectSkaterImpactProbes(this.rider);
      this._collide(this.body, this.bodyVelocity, this.bodySpin,
        probes.filter(p => p.type === 'HEAD' || p.type === 'BODY' || p.type === 'FOOT'),
        TUNING.bodyRestitution, TUNING.bodyFriction, step);
      this._collide(board, this.boardVelocity, this.boardSpin,
        probes.filter(p => p.type === 'BOARD'), TUNING.boardRestitution, TUNING.boardFriction, step);
      this.bodySpin.multiplyScalar(Math.exp(-0.45 * step));
      this.boardSpin.multiplyScalar(Math.exp(-0.32 * step));
    }
    this.rider.skateboard.setSpeedGlow?.(0, duration);
    this.body.updateMatrixWorld(true);
    board.updateMatrixWorld(true);
  }

  reset() {
    if (this.active) {
      for (const saved of [this.savedBody, this.savedBoard]) {
        (saved.parent || this.rider.root).add(saved.object);
        saved.object.position.copy(saved.position);
        saved.object.quaternion.copy(saved.quaternion);
        saved.object.scale.copy(saved.scale);
      }
    }
    this.body.removeFromParent();
    this.active = false;
    this.elapsed = 0;
    this.bodyVelocity.set(0, 0, 0);
    this.boardVelocity.set(0, 0, 0);
    this.bodySpin.set(0, 0, 0);
    this.boardSpin.set(0, 0, 0);
    this.initialBoneRotations?.clear();
    this.rider.skateboard.resetSpeedGlow?.();
    this.rider.root.updateMatrixWorld(true);
    this.rider.root.userData.severeCrash = null;
  }

  dispose() { this.reset(); }
}
