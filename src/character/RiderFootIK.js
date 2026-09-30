import * as THREE from 'three';
import { solveTwoBone, matchWorldRotation } from './TwoBoneIK.js';

const sides = ['left', 'right'];
const position = new THREE.Vector3(), hip = new THREE.Vector3(), knee = new THREE.Vector3();
const ankle = new THREE.Vector3(), targetWorld = new THREE.Vector3(), pole = new THREE.Vector3();
const correction = new THREE.Vector3(), up = new THREE.Vector3(), boardRotation = new THREE.Quaternion();
const footRotation = new THREE.Quaternion();
const inverseBoard = new THREE.Matrix4();
function belongsToFoot(bone, foot) {
  for (let node = bone; node; node = node.parent) if (node === foot) return true;
  return false;
}
export class RiderFootIK {
  constructor({ rigAdapter, riderRoot, skateboard, chimpionRoot, stance = 'regular' }) {
    Object.assign(this, { rigAdapter, riderRoot, skateboard, chimpionRoot, stance });
    this.enabled = Boolean(rigAdapter.capabilities.leftLeg && rigAdapter.capabilities.rightLeg);
    this.targets = {};
    this.calibration = {};
    this.soleProbes = { left: [], right: [] };
    this.result = { enabled: this.enabled, weight: 0, leftError: 0, rightError: 0, maxError: 0, pelvisOffset: 0 };
    if (this.enabled) this.createTargets();
  }
  createTargets() {
    // Once per avatar: measure actual skinned shoe soles in the bind pose.
    for (const child of [...this.skateboard.root.children]) {
      if (child.userData.footDeckTarget) child.removeFromParent();
    }
    const saved = new Map(this.rigAdapter.bones.map(bone => [bone, bone.quaternion.clone()]));
    this.rigAdapter.resetPose();
    // Also updates SkinnedMesh.bindMatrixInverse before CPU skinning.
    this.riderRoot.updateMatrixWorld(true);
    this.skateboard.root.getWorldQuaternion(boardRotation);
    const inverseBoardRotation = boardRotation.clone().invert();
    for (const side of sides) {
      const foot = this.rigAdapter.rig[`${side}Foot`];
      const restAnkle = this.skateboard.root.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const bounds = new THREE.Box3();
      const candidates = [];
      this.chimpionRoot.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        mesh.skeleton.update();
        const { position: vertices, skinIndex, skinWeight } = mesh.geometry.attributes;
        if (!vertices || !skinIndex || !skinWeight) return;
        const footIndices = new Set(mesh.skeleton.bones.flatMap((bone, index) => belongsToFoot(bone, foot) ? [index] : []));
        for (let index = 0; index < vertices.count; index++) {
          let influence = 0;
          for (let component = 0; component < 4; component++) {
            if (footIndices.has(skinIndex.getComponent(index, component))) influence += skinWeight.getComponent(index, component);
          }
          if (influence < 0.6) continue;
          mesh.getVertexPosition(index, position);
          mesh.localToWorld(position);
          this.skateboard.root.worldToLocal(position).sub(restAnkle);
          bounds.expandByPoint(position);
          candidates.push({ mesh, index, position: position.clone() });
        }
      });
      const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
      const soleDepth = bounds.isEmpty() ? 0.06 : Math.max(0.015, -bounds.min.y);
      const frontSign = this.stance === 'goofy' ? -1 : 1;
      const sign = side === 'left' ? frontSign : -frontSign;
      const target = new THREE.Object3D();
      target.name = `${side}-foot-deck-target`;
      target.position.set(sign * this.skateboard.stanceHalfLength - center.x,
        this.skateboard.deckSurfaceY + soleDepth + 0.003,
        (side === 'left' ? 1 : -1) * this.skateboard.footLateralOffset - center.z);
      target.userData.footDeckTarget = true;
      target.userData.baseY = target.position.y;
      this.skateboard.root.add(target);
      this.targets[side] = target;
      this.calibration[side] = { soleDepth,
        rotation: inverseBoardRotation.clone().multiply(foot.getWorldQuaternion(new THREE.Quaternion())) };
      // One low sole vertex per small X/Z cell captures heel/toe skin blends.
      // At runtime we skin only these probes, never scan the complete mesh.
      const cells = new Map();
      for (const probe of candidates) {
        const x = Math.min(3, Math.floor((probe.position.x - bounds.min.x)
          / Math.max(1e-5, bounds.max.x - bounds.min.x) * 4));
        const z = Math.min(3, Math.floor((probe.position.z - bounds.min.z)
          / Math.max(1e-5, bounds.max.z - bounds.min.z) * 4));
        const key = x + z * 4;
        if (!cells.has(key) || probe.position.y < cells.get(key).position.y) cells.set(key, probe);
      }
      this.soleProbes[side] = [...cells.values()];
    }
    for (const [bone, quaternion] of saved) bone.quaternion.copy(quaternion);
    this.riderRoot.updateMatrixWorld(true);
  }
  update(state = {}) {
    if (!this.enabled) return this.result;
    this.riderRoot.updateWorldMatrix(true, true);
    this.skateboard.root.getWorldQuaternion(boardRotation);
    for (const side of sides) this.targets[side].position.y = this.targets[side].userData.baseY;
    up.set(0, 1, 0).applyQuaternion(boardRotation);
    // Short-legged avatars also need their hips centered over the stance.
    // A vertical-only correction cannot reach a target behind the pelvis.
    const center = new THREE.Vector3();
    for (const side of sides) {
      this.rigAdapter.rig[`${side}Thigh`].getWorldPosition(hip);
      this.targets[side].getWorldPosition(targetWorld);
      center.add(hip.sub(targetWorld));
    }
    center.multiplyScalar(0.5);
    center.addScaledVector(up, -center.dot(up));
    correction.copy(center).clampLength(0, 0.035).sub(center);
    const parent = this.chimpionRoot.parent;
    parent.getWorldPosition(position);
    parent.worldToLocal(correction.add(position));
    this.chimpionRoot.position.add(correction);
    this.chimpionRoot.updateWorldMatrix(true, true);
    // Pelvis follows board-up, even inverted; only the character is corrected.
    const flex = THREE.MathUtils.clamp(Number(state.kneeFlex) || 0.55, 0.25, 1.25);
    let shift = Infinity;
    for (const side of sides) {
      const rig = this.rigAdapter.rig;
      rig[`${side}Thigh`].getWorldPosition(hip);
      rig[`${side}Shin`].getWorldPosition(knee);
      rig[`${side}Foot`].getWorldPosition(ankle);
      const l1 = hip.distanceTo(knee), l2 = knee.distanceTo(ankle);
      this.targets[side].getWorldPosition(targetWorld);
      correction.copy(hip).sub(targetWorld);
      const height = correction.dot(up);
      const lateralSquared = Math.max(0, correction.lengthSq() - height * height);
      const reachSquared = l1 * l1 + l2 * l2 + 2 * l1 * l2 * Math.cos(flex);
      shift = Math.min(shift, Math.sqrt(Math.max(0.001, reachSquared - lateralSquared)) - height);
    }
    if (Number.isFinite(shift)) {
      correction.copy(up).multiplyScalar(shift);
      parent.getWorldPosition(position);
      correction.add(position);
      parent.worldToLocal(correction);
      this.chimpionRoot.position.add(correction);
      this.chimpionRoot.updateWorldMatrix(true, true);
    }
    // Existing tricks keep both feet on the deck. Blend above the ankles,
    // never by weakening contact on takeoff or during a rotation.
    this.result.weight = 1;
    this.result.pelvisOffset = Number.isFinite(shift) ? shift : 0;
    for (const side of sides) this.solveLeg(side);
    this.riderRoot.updateMatrixWorld(true);
    inverseBoard.copy(this.skateboard.root.matrixWorld).invert();
    for (const side of sides) {
      const clearance = this.measureSole(side);
      if (Number.isFinite(clearance)) {
        const adjustment = THREE.MathUtils.clamp(0.003 - clearance, -0.03, 0.03);
        if (Math.abs(adjustment) > 0.0005) {
          this.targets[side].position.y += adjustment;
          this.solveLeg(side);
        }
        this.result[`${side}SoleClearance`] = this.measureSole(side);
      }
    }
    this.result.maxError = Math.max(this.result.leftError, this.result.rightError);
    return this.result;
  }

  solveLeg(side) {
    const rig = this.rigAdapter.rig;
    this.targets[side].getWorldPosition(targetWorld);
    rig[`${side}Thigh`].getWorldPosition(hip);
    pole.set(side === 'left' ? 0.06 : -0.06, 0, 0.7).applyQuaternion(boardRotation).add(hip);
    solveTwoBone(rig[`${side}Thigh`], rig[`${side}Shin`], rig[`${side}Foot`], targetWorld, pole);
    footRotation.copy(boardRotation).multiply(this.calibration[side].rotation);
    matchWorldRotation(rig[`${side}Foot`], footRotation);
    this.result[`${side}Error`] = rig[`${side}Foot`].getWorldPosition(ankle).distanceTo(targetWorld);
  }

  measureSole(side) {
    let minimum = Infinity;
    for (const { mesh, index } of this.soleProbes[side]) {
      mesh.getVertexPosition(index, position);
      position.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseBoard);
      minimum = Math.min(minimum, position.y - this.skateboard.deckSurfaceY);
    }
    return minimum;
  }
}
