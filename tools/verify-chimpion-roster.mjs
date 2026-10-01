import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve('public');
const GLBS = Object.freeze([
  ['models/characters/The_Archon.glb', '56acfcb00a5ae6a7c543f15face89dc5a05973b0'],
  ['models/characters/The_Heretic.glb', 'd6cf952128b625e52a6e109de80d0c7493020806'],
  ['models/characters/The_Commodore.glb', 'eb2f44b25d88420cc5196fe012027278abd2d9b0'],
  ['models/characters/The_Pioneer.glb', '726bc406f0f7d965d5756483219d9138842c29c7'],
  ['models/characters/The_Punk.glb', '129200342b76c18473a193a745d70a3c3a134c7d'],
  ['models/characters/The_Street_Fighter.glb', 'cf4ff7da5140239fd8278b54493d0ffb920ac374'],
  ['models/characters/The_Bosun.glb', '538ae4ab357a4f23ce20b600c0f43c5f7eb40e9d'],
  ['models/characters/The_Adolescent.glb', '45af19ba7ed7a3265e3b7079e3df1992f95025ef'],
  ['models/characters/The_Angsty.glb', 'fdfc5ba7fe6b1bcb9432120284f34097916060ae'],
  ['models/characters/The_Apologetic.glb', '2f6d5b8b148c7529b6d6370c54cc9cfdc8311d11'],
]);

const GIFS = Object.freeze([
  'images/characters/archon.gif',
  'images/characters/heretic.gif',
  'images/characters/commodore.gif',
  'images/characters/pioneer.gif',
  'images/characters/punk.gif',
  'images/characters/street-fighter.gif',
  'images/characters/bosun.gif',
  'images/characters/adolescent.gif',
  'images/characters/angsty.gif',
  'images/characters/apologetic.gif',
]);

function gitBlobSha(bytes) {
  const header = Buffer.from('blob ' + bytes.length + '\0');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function countGifFrames(bytes) {
  if (bytes.length < 13) return 0;
  const signature = bytes.subarray(0, 6).toString('ascii');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return 0;

  const packed = bytes[10];
  let offset = 13;
  if (packed & 0x80) {
    offset += 3 * (2 ** ((packed & 0x07) + 1));
  }

  let frames = 0;
  while (offset < bytes.length) {
    const introducer = bytes[offset++];

    if (introducer === 0x3b) break;

    if (introducer === 0x21) {
      offset += 1;
      while (offset < bytes.length) {
        const blockSize = bytes[offset++];
        if (blockSize === 0) break;
        offset += blockSize;
      }
      continue;
    }

    if (introducer === 0x2c) {
      frames += 1;
      if (offset + 9 > bytes.length) break;
      const descriptorPacked = bytes[offset + 8];
      offset += 9;

      if (descriptorPacked & 0x80) {
        offset += 3 * (2 ** ((descriptorPacked & 0x07) + 1));
      }

      offset += 1;
      while (offset < bytes.length) {
        const blockSize = bytes[offset++];
        if (blockSize === 0) break;
        offset += blockSize;
      }
      continue;
    }

    throw new Error('Unexpected GIF block 0x' + introducer.toString(16));
  }

  return frames;
}

for (const [relativePath, expectedSha] of GLBS) {
  const filePath = path.join(ROOT, relativePath);
  const info = await stat(filePath);
  if (info.size <= 1024) throw new Error(relativePath + ' is unexpectedly small');

  const bytes = await readFile(filePath);
  if (bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error(relativePath + ' is not a GLB');
  }

  const actualSha = gitBlobSha(bytes);
  if (actualSha !== expectedSha) {
    throw new Error(
      relativePath + ' source hash mismatch: expected ' + expectedSha + ', got ' + actualSha,
    );
  }
  console.log('[assets] verified GLB', relativePath);
}

for (const relativePath of GIFS) {
  const filePath = path.join(ROOT, relativePath);
  const info = await stat(filePath);
  if (info.size <= 1024) throw new Error(relativePath + ' is unexpectedly small');

  const bytes = await readFile(filePath);
  const frames = countGifFrames(bytes);
  if (frames < 2) {
    throw new Error(relativePath + ' must be an animated GIF; frames=' + frames);
  }
  console.log('[assets] verified animated GIF', relativePath, 'frames=' + frames);
}

console.log('[assets] all 10 local GLBs and 10 animated thumbnails verified');
