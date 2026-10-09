import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

assert.ok(GAME_CONFIG.assets.halfpipe.endsWith('/models/halfpipe/halfpipe2.glb'));
assert.ok((await stat('public/models/halfpipe/halfpipe.glb')).size > 0, 'v1 must remain available');
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .read('public/models/halfpipe/halfpipe2.glb');
const front = document.getRoot().listMaterials().find(m => m.getName() === 'FRENTE.001');
assert.ok(front, 'v2 must contain the authored front material');
assert.equal(front.getMetallicFactor(), 0, 'graffiti paint must not be metallic');
assert.ok(front.getRoughnessFactor() >= 0.8, 'paint must retain its matte surface');
assert.equal(front.getBaseColorTexture().getMimeType(), 'image/jpeg');
assert.equal(front.getBaseColorTextureInfo().getTexCoord(), 1);
const mesh = document.getRoot().listMeshes().find(m => m.listPrimitives().some(p => p.getMaterial() === front));
assert.ok(mesh.listPrimitives()[0].getAttribute('TEXCOORD_1'), 'graffiti UV layer must be exported');
assert.ok(document.getRoot().listNodes().some(n => n.getName() === 'Object_8'), 'authored coping must remain');
console.log('Graffiti v2: JPEG embedded, dedicated UVs, matte paint, coping and v1 preserved.');
