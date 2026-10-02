import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { prepareCopingVisual } from '../src/halfpipe/HalfpipeVisual.js';
import { CinematicPostProcessing } from '../src/graphics/CinematicPostProcessing.js';
import { ARCADE_FEEDBACK } from '../src/vfx/ArcadeFeedbackTuning.js';

// Exercise the real shipped rail dimensions and material-slot association.
// This catches a halo accidentally spanning both sides of the halfpipe.
const document = await new NodeIO().read('public/models/halfpipe/halfpipe2.glb');
const node = document.getRoot().listNodes().find(current => current.getName() === 'Object_8');
assert.ok(node, 'shipped GLB must contain its semantic coping mesh');
const primitive = node.getMesh().listPrimitives()[0];
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(), 1));
const authoredRail = new THREE.MeshStandardMaterial({ name: primitive.getMaterial().getName() });
const unrelated = new THREE.MeshStandardMaterial({ name: 'unrelated-ramp-material', emissive: 0xffffff, emissiveIntensity: 4 });
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

assert.equal(materials[0].userData.halfpipeRole, 'coping');
assert.equal(materials[0].color.getHex(), ARCADE_FEEDBACK.copingSourceColor);
assert.equal(materials[0].toneMapped, false, 'red source must stay independent of scene exposure');
assert.equal(materials[1], unrelated, 'non-coping slots must retain their original material');
assert.equal(authoredRail.userData.halfpipeRole, undefined, 'source GLB material must not be mutated');
assert.equal(rail.userData.emissiveBloom, false);
assert.equal(CinematicPostProcessing.prototype._isBloomTarget(rail, materials[0]), false,
  'red coping must never enter selective HDR bloom');
assert.equal(CinematicPostProcessing.prototype._isBloomTarget(rail, materials[1]), false);

const halos = rail.children.filter(child => child.userData.visualGlowOnly);
assert.equal(halos.length, 2, 'each real rail must have exactly one localized halo');
for (const halo of halos) {
  const { uStart, uEnd, uRadius, uSourceRadius } = halo.material.uniforms;
  assert.ok(uStart.value.x * uEnd.value.x > 0, 'a halo cannot cross the center of the halfpipe');
  assert.ok(Math.abs(uEnd.value.z - uStart.value.z) > 16, 'halo must follow the full authored rail span');
  assert.ok(uSourceRadius.value > 0.07 && uSourceRadius.value < 0.1);
  assert.ok(uRadius.value > uSourceRadius.value && uRadius.value < 0.65,
    'halo must have a tight finite envelope around the source');
  assert.equal(halo.material.depthTest, true, 'rider and foreground must occlude the halo');
  assert.equal(halo.material.depthWrite, false, 'translucent glow must not occlude scene geometry');
  assert.equal(halo.material.blending, THREE.NormalBlending, 'bright backdrops must not bleach the red to white');
  assert.equal(halo.userData.bloomExclude, true);
  assert.equal(halo.castShadow, false);
}

console.log('Coping red glow: real GLB spans, selective materials, no HDR bloom, and occlusion checks passed.');
