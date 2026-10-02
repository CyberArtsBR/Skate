import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { prepareCopingVisual } from '../src/halfpipe/HalfpipeVisual.js';
import { CinematicPostProcessing } from '../src/graphics/CinematicPostProcessing.js';
import { ARCADE_FEEDBACK } from '../src/vfx/ArcadeFeedbackTuning.js';

// Exercise the real shipped rail/material association. The canonical coping
// path must keep a single opaque physical mesh and let selective bloom derive
// the halo from its emissive material; no camera-facing duplicate geometry.
const document = await new NodeIO().read('public/models/halfpipe/halfpipe2.glb');
const node = document.getRoot().listNodes().find(current => current.getName() === 'Object_8');
assert.ok(node, 'shipped GLB must contain its semantic coping mesh');
const primitive = node.getMesh().listPrimitives()[0];
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(), 1));
const authoredRail = new THREE.MeshStandardMaterial({ name: primitive.getMaterial().getName() });
const unrelated = new THREE.MeshStandardMaterial({
  name: 'unrelated-ramp-material', emissive: 0xffffff, emissiveIntensity: 4,
});
const rail = new THREE.Mesh(geometry, [authoredRail, unrelated]);
rail.name = THREE.PropertyBinding.sanitizeNodeName(node.getName());
rail.userData.halfpipeSourceNodeName = node.getName();
rail.userData.halfpipeSourceMeshName = node.getMesh().getName();
rail.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
const parent = new THREE.Group();
parent.name = THREE.PropertyBinding.sanitizeNodeName(node.getParentNode().getName());
parent.userData.halfpipeSourceNodeName = node.getParentNode().getName();
parent.add(rail);

const materials = prepareCopingVisual(rail, [authoredRail, unrelated]);
const coping = materials[0];

assert.ok(coping.isMeshStandardMaterial, 'coping must remain a physical PBR material');
assert.equal(coping.userData.halfpipeRole, 'coping');
assert.equal(coping.userData.selectiveBloomSource, true);
assert.equal(coping.color.getHex(), ARCADE_FEEDBACK.copingSourceColor);
assert.equal(coping.emissive.getHex(), ARCADE_FEEDBACK.copingGlowColor);
assert.equal(coping.emissiveIntensity, 3);
assert.equal(coping.transparent, false);
assert.equal(coping.opacity, 1);
assert.equal(coping.depthTest, true);
assert.equal(coping.depthWrite, true);
assert.equal(coping.toneMapped, true);
assert.equal(materials[1], unrelated, 'non-coping slots must retain their original material');
assert.equal(authoredRail.userData.halfpipeRole, undefined, 'source GLB material must not be mutated');

assert.equal(rail.userData.copingContactZone, true);
assert.equal(rail.userData.emissiveBloom, true);
assert.equal(rail.userData.bloomExclude, false);
assert.equal(
  CinematicPostProcessing.prototype._isBloomTarget(rail, coping),
  true,
  'authored coping slot must enter selective bloom',
);
assert.equal(
  CinematicPostProcessing.prototype._isBloomTarget(rail, materials[1]),
  false,
  'unrelated material slots on the coping mesh must remain excluded from bloom',
);

const halos = rail.children.filter(child => child.userData.visualGlowOnly);
assert.equal(halos.length, 0, 'coping must not create duplicate translucent halo geometry');

console.log('Coping glow: one opaque emissive physical rail with selective bloom; no duplicate halo geometry.');
