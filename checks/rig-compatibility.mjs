import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { RIDER_ROSTER } from '../src/config/riderRoster.js';
import {
  HERETIC_REFERENCE_MODEL_ROTATIONS,
  SLOT_ALIASES,
} from '../src/character/RiderRigAdapter.js';

const FILES = Object.freeze(RIDER_ROSTER.map(rider => [
  rider.id,
  path.basename(decodeURIComponent(new URL(rider.modelUrl, 'http://localhost').pathname)),
]));

const REQUIRED_POSE_SLOTS = Object.freeze([
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftForearm',
  'rightUpperArm',
  'rightForearm',
  'leftThigh',
  'leftShin',
  'leftFoot',
  'rightThigh',
  'rightShin',
  'rightFoot',
]);

function normalizeName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/mixamorig\d*/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function semanticName(name = '') {
  const source = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/mixamorig\d*[:_ ]*/g, '')
    .replace(/cc[_ ]*base[_ ]*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const words = source.split(/\s+/).filter(Boolean);
  let side = words.includes('left') || words.includes('l')
    ? 'left'
    : words.includes('right') || words.includes('r')
      ? 'right'
      : '';
  let core = words
    .filter((word) => ![
      'left', 'right', 'l', 'r', 'bone', 'def', 'bip', 'bip001',
    ].includes(word))
    .join('');

  if (!side && /^(left|right)/.test(core)) {
    side = core.startsWith('left') ? 'left' : 'right';
    core = core.slice(side.length);
  }
  if (!side && /(left|right)$/.test(core)) {
    side = core.endsWith('left') ? 'left' : 'right';
    core = core.slice(0, -side.length);
  }

  return side + core;
}

function findNode(nodes, aliases = []) {
  for (const alias of aliases) {
    const exact = nodes.find((node) => normalizeName(node.getName()) === alias);
    if (exact) return exact;
  }

  for (const alias of aliases) {
    const suffix = nodes.find((node) => {
      const name = normalizeName(node.getName());
      return !/twist|share|toe|finger|eye|breast/.test(name)
        && name.endsWith(alias);
    });
    if (suffix) return suffix;
  }

  // Match the runtime adapter's semantic fallback so generic rigs such as
  // L_Upperarm / R_Forearm are tested under the same rules as production.
  for (const alias of aliases) {
    const semantic = nodes.find((node) => semanticName(node.getName()) === alias);
    if (semantic) return semantic;
  }

  return null;
}

function localMatrix(node) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(...node.getTranslation());
  const qv = node.getRotation();
  const quaternion = new THREE.Quaternion(qv[0], qv[1], qv[2], qv[3]);
  const scale = new THREE.Vector3(...node.getScale());
  return matrix.compose(position, quaternion, scale);
}

function worldMatrix(node) {
  const chain = [];
  for (let current = node; current; current = current.getParentNode?.() || null) {
    chain.push(current);
  }

  const matrix = new THREE.Matrix4().identity();
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    matrix.multiply(localMatrix(chain[index]));
  }
  return matrix;
}

function worldQuaternion(node) {
  const quaternion = new THREE.Quaternion();
  worldMatrix(node).decompose(
    new THREE.Vector3(),
    quaternion,
    new THREE.Vector3(),
  );
  return quaternion.normalize();
}

function isAncestor(ancestor, child) {
  for (let parent = child?.getParentNode?.(); parent; parent = parent.getParentNode?.()) {
    if (parent === ancestor) return true;
  }
  return false;
}

function angleDegrees(a, b) {
  return THREE.MathUtils.radToDeg(a.angleTo(b));
}

function mappedRotation(targetRest, referenceRest, referenceDelta) {
  const basis = targetRest.clone().invert().multiply(referenceRest).normalize();
  return basis.clone()
    .multiply(referenceDelta)
    .multiply(basis.clone().invert())
    .normalize();
}

const io = new NodeIO();
const resolved = {};

for (const [id, file] of FILES) {
  const document = await io.read(path.resolve('public/models/characters', file));
  const nodes = document.getRoot().listNodes();
  const rig = {};

  for (const [slot, aliases] of Object.entries(SLOT_ALIASES)) {
    rig[slot] = findNode(nodes, aliases);
  }

  for (const slot of REQUIRED_POSE_SLOTS) {
    assert.ok(rig[slot], `${id} is missing required semantic slot ${slot}`);
  }

  assert.ok(
    isAncestor(rig.hips, rig.spine),
    `${id} spine must inherit motion from the resolved master hips bone; hips=${rig.hips.getName()} spine=${rig.spine.getName()}`,
  );
  assert.ok(
    isAncestor(rig.hips, rig.leftThigh) && isAncestor(rig.hips, rig.rightThigh),
    `${id} leg branches must inherit motion from the resolved master hips bone`,
  );

  resolved[id] = {
    rig,
    summary: {
      hips: rig.hips.getName(),
      spine: rig.spine.getName(),
      leftThigh: rig.leftThigh.getName(),
      rightThigh: rig.rightThigh.getName(),
    },
  };
}

const heretic = resolved.heretic;
for (const slot of REQUIRED_POSE_SLOTS) {
  const expectedValues = HERETIC_REFERENCE_MODEL_ROTATIONS[slot];
  assert.ok(expectedValues, `Heretic reference is missing ${slot}`);
  const expected = new THREE.Quaternion(...expectedValues).normalize();
  const actual = worldQuaternion(heretic.rig[slot]);
  assert.ok(
    angleDegrees(expected, actual) < 0.001,
    `Heretic reference quaternion drifted for ${slot}`,
  );
}

// Validate the retarget basis against every actual GLB with an intentionally
// asymmetric sample rotation. This is the same conjugation used at runtime.
const sampleDelta = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.17, -0.21, 0.31, 'XYZ'),
);

for (const [id, entry] of Object.entries(resolved)) {
  for (const slot of REQUIRED_POSE_SLOTS) {
    const referenceRest = new THREE.Quaternion(
      ...HERETIC_REFERENCE_MODEL_ROTATIONS[slot],
    ).normalize();
    const targetRest = worldQuaternion(entry.rig[slot]);
    const targetLocalDelta = mappedRotation(
      targetRest,
      referenceRest,
      sampleDelta,
    );

    const targetModelDelta = targetRest.clone()
      .multiply(targetLocalDelta)
      .multiply(targetRest.clone().invert())
      .normalize();
    const referenceModelDelta = referenceRest.clone()
      .multiply(sampleDelta)
      .multiply(referenceRest.clone().invert())
      .normalize();

    assert.ok(
      angleDegrees(targetModelDelta, referenceModelDelta) < 0.001,
      `${id} ${slot} retarget basis must reproduce Heretic semantic rotation`,
    );
  }
}

console.log(JSON.stringify({
  rigs: Object.fromEntries(
    Object.entries(resolved).map(([id, entry]) => [id, entry.summary]),
  ),
  reference: 'The Heretic',
  semanticPoseSlots: REQUIRED_POSE_SLOTS.length,
  result: '10-rider rig compatibility passed',
}, null, 2));
