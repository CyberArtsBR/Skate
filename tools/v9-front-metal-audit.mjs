import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2] || 'public/models/halfpipe/halfpipe.glb';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(file);
const root = document.getRoot();
const materialName = 'Material';

const meshes = root.listMeshes()
  .filter((mesh) => mesh.listPrimitives().some(
    (primitive) => primitive.getMaterial()?.getName() === materialName,
  ));

const nodes = root.listNodes()
  .filter((node) => node.getMesh() && meshes.includes(node.getMesh()));

const compact = [
  `material=${materialName}`,
  `meshes=${meshes.map((mesh) => mesh.getName() || '(unnamed)').join('+') || 'none'}`,
  `nodes=${nodes.map((node) => node.getName() || '(unnamed)').join('+') || 'none'}`,
  `count=${meshes.length}/${nodes.length}`,
].join(';').replace(/[^A-Za-z0-9_.;=+()-]/g, '_').slice(0, 220);

console.log(compact);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `candidate=${compact}\n`);
}
