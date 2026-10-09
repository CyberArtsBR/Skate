import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { RIDER_ROSTER } from '../src/config/riderRoster.js';

const ROOT = path.resolve('public');
const GLBS = Object.freeze([
  ['models/characters/heretic_new.glb', '9f6f40358edd54b17d2f047929f74e69344b580e'],
  ['models/characters/adolescent_new.glb', '6f6d1a5c570890dfa77db75241cb79e94ca2ade4'],
  ['models/characters/anchor_new.glb', 'b51495abdf27dcc986787c817ab6498472ac477c'],
  ['models/characters/tuxr_new.glb', '9ef397945c5371d3b99afb0af893b5517befcfb7'],
]);
const expected = new Set(GLBS.map(([file]) => '/' + file));
if (RIDER_ROSTER.length !== 4 || new Set(RIDER_ROSTER.map(x => new URL(x.modelUrl, 'https://halfpipe.local').pathname)).size !== 4) {
  throw new Error('Expected exactly four unique selected riders');
}
for (const rider of RIDER_ROSTER) {
  const pathname = new URL(rider.modelUrl, 'https://halfpipe.local').pathname;
  if (!expected.has(pathname)) throw new Error('Unexpected selected rider model: ' + pathname);
}
for (const [relativePath, expectedSha] of GLBS) {
  const filePath = path.join(ROOT, relativePath);
  const info = await stat(filePath);
  if (info.size <= 1024) throw new Error(relativePath + ' is unexpectedly small');
  const bytes = await readFile(filePath);
  if (bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error(relativePath + ' is not a GLB');
  }
  const header = Buffer.from('blob ' + bytes.length + '\0');
  const actualSha = createHash('sha1').update(header).update(bytes).digest('hex');
  if (actualSha !== expectedSha) throw new Error(relativePath + ' changed from the uploaded asset');
  console.log('[assets] verified GLB', relativePath);
}
console.log('[assets] all four selected character GLBs verified');
