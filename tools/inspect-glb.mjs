import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';

const DEFAULT_ASSETS = [
  'skateboard.glb',
  'halfpipe_skatepark_ramp_-_low_poly_baked.glb',
  '.reference/Chimpions-Ski/public/model/characters/The Heretic.glb',
];

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ASSETS;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function transformBounds(box, accessor, matrix) {
  const min = accessor.getMin([]);
  const max = accessor.getMax([]);
  if (!min?.length || !max?.length) return;

  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
}

function inspectNodeBounds(node) {
  const mesh = node.getMesh();
  if (!mesh) return null;
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (position) transformBounds(box, position, matrix);
  }
  if (box.isEmpty()) return null;
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    dimensions: box.getSize(new THREE.Vector3()).toArray(),
    center: box.getCenter(new THREE.Vector3()).toArray(),
  };
}

function textureSlots(material) {
  const slots = [
    ['baseColor', material.getBaseColorTexture()],
    ['metallicRoughness', material.getMetallicRoughnessTexture()],
    ['normal', material.getNormalTexture()],
    ['occlusion', material.getOcclusionTexture()],
    ['emissive', material.getEmissiveTexture()],
  ];
  return slots.filter(([, texture]) => texture).map(([slot, texture]) => ({
    slot,
    texture: texture.getName() || '(unnamed)',
    mimeType: texture.getMimeType() || null,
    bytes: texture.getImage()?.byteLength || 0,
  }));
}

function nodePath(node) {
  const parts = [];
  let current = node;
  while (current) {
    parts.unshift(current.getName() || '(unnamed)');
    current = current.getParentNode();
  }
  return `/${parts.join('/')}`;
}

async function inspect(file) {
  const absolutePath = path.resolve(file);
  const [document, stats] = await Promise.all([io.read(absolutePath), fs.stat(absolutePath)]);
  const root = document.getRoot();
  const bounds = new THREE.Box3();

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (position) transformBounds(bounds, position, matrix);
    }
  }

  const dimensions = new THREE.Vector3();
  const center = new THREE.Vector3();
  if (!bounds.isEmpty()) {
    bounds.getSize(dimensions);
    bounds.getCenter(center);
  }

  const materials = root.listMaterials().map((material) => ({
    name: material.getName() || '(unnamed)',
    doubleSided: material.getDoubleSided(),
    alphaMode: material.getAlphaMode(),
    baseColorFactor: material.getBaseColorFactor(),
    metallicFactor: material.getMetallicFactor(),
    roughnessFactor: material.getRoughnessFactor(),
    textures: textureSlots(material),
  }));

  return {
    file: path.basename(file),
    absolutePath,
    bytes: stats.size,
    scenes: root.listScenes().map((scene) => scene.getName() || '(unnamed)'),
    bounds: bounds.isEmpty() ? null : {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      dimensions: dimensions.toArray(),
      center: center.toArray(),
    },
    counts: {
      nodes: root.listNodes().length,
      meshes: root.listMeshes().length,
      primitives: root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0),
      materials: materials.length,
      textures: root.listTextures().length,
      skins: root.listSkins().length,
      animations: root.listAnimations().length,
    },
    nodes: root.listNodes().map((node) => ({
      name: node.getName() || '(unnamed)',
      path: nodePath(node),
      mesh: node.getMesh()?.getName() || null,
      skin: node.getSkin()?.getName() || null,
      translation: node.getTranslation(),
      rotation: node.getRotation(),
      scale: node.getScale(),
      bounds: inspectNodeBounds(node),
      children: node.listChildren().map((child) => child.getName() || '(unnamed)'),
    })),
    meshes: root.listMeshes().map((mesh) => ({
      name: mesh.getName() || '(unnamed)',
      primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        vertices: primitive.getAttribute('POSITION')?.getCount() || 0,
        indices: primitive.getIndices()?.getCount() || 0,
        material: primitive.getMaterial()?.getName() || null,
        attributes: primitive.listSemantics(),
      })),
    })),
    materials,
    textures: root.listTextures().map((texture) => ({
      name: texture.getName() || '(unnamed)',
      mimeType: texture.getMimeType() || null,
      bytes: texture.getImage()?.byteLength || 0,
    })),
    skins: root.listSkins().map((skin) => ({
      name: skin.getName() || '(unnamed)',
      joints: skin.listJoints().map((joint) => joint.getName() || '(unnamed)'),
      skeleton: skin.getSkeleton()?.getName() || null,
    })),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName() || '(unnamed)',
      channels: animation.listChannels().length,
    })),
  };
}

const reports = [];
for (const file of files) reports.push(await inspect(file));
process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
