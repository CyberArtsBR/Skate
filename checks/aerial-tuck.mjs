import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { RiderRigAdapter } from '../src/character/RiderRigAdapter.js';
import { RiderFootIK } from '../src/character/RiderFootIK.js';
import { SkatePoseController } from '../src/character/SkatePoseController.js';
import { BackflipGrabIK } from '../src/character/BackflipGrabIK.js';

const files = [
  'The Archon.glb', 'The Heretic.glb', 'The Commodore.glb',
  'The Pioneer.glb', 'The Punk.glb', 'The Street Fighter.glb',
  'The Bosun.glb', 'The Adolescent.glb', 'The Angsty.glb',
  'The Apologetic.glb',
];
const io = new NodeIO();
const results = [];

// Rebuild the actual GLB skeletons without textures or a WebGL dependency.
// These checks exercise the avatar proportions, authored bone axes and IK;
// the browser check remains responsible for the visible skinned shoe soles.
for (const file of files) {
  const document = await io.read(path.resolve('public/models/characters', file));
  const nodes = document.getRoot().listNodes();
  const objects = new Map(nodes.map((node) => {
    const object = new THREE.Bone();
    object.name = node.getName();
    object.position.fromArray(node.getTranslation());
    object.quaternion.fromArray(node.getRotation());
    object.scale.fromArray(node.getScale());
    return [node, object];
  }));
  const model = new THREE.Group();
  for (const [node, object] of objects) {
    const parent = objects.get(node.getParentNode());
    (parent || model).add(object);
  }
  model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  for (const [node, object] of objects) {
    for (const primitive of node.getMesh()?.listPrimitives() || []) {
      const vertices = primitive.getAttribute('POSITION');
      if (!vertices) continue;
      bounds.union(new THREE.Box3(
        new THREE.Vector3(...vertices.getMin([])),
        new THREE.Vector3(...vertices.getMax([])),
      ).applyMatrix4(object.matrixWorld));
    }
  }
  model.scale.setScalar(GAME_CONFIG.rider.targetHeight / bounds.getSize(new THREE.Vector3()).y);
  model.position.y = -bounds.min.y * model.scale.y;

  const riderRoot = new THREE.Group();
  const chimpionRoot = new THREE.Group();
  chimpionRoot.add(model);
  riderRoot.add(chimpionRoot);
  const skateboard = {
    root: new THREE.Group(),
    deckSurfaceY: 0.12,
    stanceHalfLength: GAME_CONFIG.rider.stanceHalfLength,
    footLateralOffset: GAME_CONFIG.rider.footLateralOffset,
  };
  riderRoot.add(skateboard.root);
  const rigAdapter = new RiderRigAdapter(model);
  assert.equal(rigAdapter.valid, true, `${file} must resolve its real leg chains`);
  const footIK = new RiderFootIK({ rigAdapter, riderRoot, skateboard, chimpionRoot });
  const handsIK = new BackflipGrabIK({ rigAdapter, riderRoot, skateboard });
  const poseController = new SkatePoseController();
  const boardLocal = (bone) => skateboard.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));

  let maxFootError = 0;
  let minimumKneeBend = Infinity;
  let minimumTorsoForward = Infinity;
  let minimumHandDrop = Infinity;
  for (const trickType of ['aerial-turn', 'backflip']) {
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      const state = {
        airborne: true, trickVisualActive: true, trickType,
        trickProgress: 0.5, airTuck: 0.9, landingAnticipation: 0,
        facingYaw: yaw, wallSide: -1, turnDirection: 1,
      };
      riderRoot.rotation.set(0, yaw, trickType === 'backflip' ? Math.PI : 0, 'XYZ');
      chimpionRoot.position.set(0, skateboard.deckSurfaceY + 0.03, 0.015);
      const pose = { ...poseController.evaluate(state) };
      rigAdapter.applySkatePose(pose);
      const contact = footIK.update({ ...state, kneeFlex: pose.kneeFlex });
      const hands = handsIK.update({ active: true, progress: 0.5, crouchWeight: pose.aerialCrouch });
      assert.equal(hands.active, true, `${file} ${trickType} needs both downward arm chains`);
      assert.equal(hands.degraded, false);
      maxFootError = Math.max(maxFootError, contact.maxError);
      if (contact.maxError > 0.001) {
        console.warn(JSON.stringify({ file, trickType, yaw, contact, legs: Object.fromEntries(['left', 'right'].map(side => [side, {
          hip: boardLocal(rigAdapter.rig[`${side}Thigh`]).toArray(),
          knee: boardLocal(rigAdapter.rig[`${side}Shin`]).toArray(),
          foot: boardLocal(rigAdapter.rig[`${side}Foot`]).toArray(),
          target: skateboard.root.worldToLocal(footIK.targets[side].getWorldPosition(new THREE.Vector3())).toArray(),
        }])) }));
      }
      assert.ok(contact.maxError < 0.001, `${file} ${trickType} must keep both feet on deck; ${contact.maxError}`);
      for (const side of ['left', 'right']) {
        const hip = boardLocal(rigAdapter.rig[`${side}Thigh`]);
        const knee = boardLocal(rigAdapter.rig[`${side}Shin`]);
        const ankle = boardLocal(rigAdapter.rig[`${side}Foot`]);
        const bend = Math.PI - hip.sub(knee).angleTo(ankle.sub(knee));
        minimumKneeBend = Math.min(minimumKneeBend, bend);
        assert.ok(bend > 1.55, `${file} ${trickType} must visibly bend ${side} knee; ${bend}`);
        const shoulder = boardLocal(rigAdapter.rig[`${side}UpperArm`]);
        const hand = boardLocal(rigAdapter.rig[`${side}Hand`]);
        const handDrop = shoulder.y - hand.y;
        minimumHandDrop = Math.min(minimumHandDrop, handDrop);
        assert.ok(handDrop > 0.18, `${file} ${trickType} ${side} hand must point below its shoulder; ${handDrop}`);
      }
      const torso = boardLocal(rigAdapter.rig.chest).sub(boardLocal(rigAdapter.rig.hips)).normalize();
      minimumTorsoForward = Math.min(minimumTorsoForward, torso.z);
      assert.ok(torso.z > 0.42, `${file} ${trickType} torso must fold forward toward knees; ${torso.z}`);
    }
  }
  // Segment boundaries must retain the aerial crouch even during a 540/720.
  const start = { ...poseController.evaluate({ airborne: true, trickType: 'aerial-turn', trickProgress: 0 }) };
  const end = { ...poseController.evaluate({ airborne: true, trickType: 'aerial-turn', trickProgress: 1 }) };
  assert.equal(start.kneeFlex, end.kneeFlex, 'aerial segment boundary must not straighten the knees');
  assert.equal(start.aerialCrouch, end.aerialCrouch, 'aerial segment boundary must not release the hands');
  results.push({ file, maxFootError, minimumKneeBend, minimumTorsoForward, minimumHandDrop });
}

console.log(JSON.stringify({ result: '10-rider aerial/backflip tuck geometry passed', results }, null, 2));
