import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const SOURCE_BASE = 'https://chimp-jump.onrender.com/model/characters';
const TARGET_DIR = path.resolve('public/models/characters');

const CHARACTERS = Object.freeze([
  ['The_Archon.glb', 'The Archon.glb', '56acfcb00a5ae6a7c543f15face89dc5a05973b0'],
  ['The_Angsty.glb', 'The Angsty.glb', 'fdfc5ba7fe6b1bcb9432120284f34097916060ae'],
  ['The_Apologetic.glb', 'The Apologetic.glb', '2f6d5b8b148c7529b6d6370c54cc9cfdc8311d11'],
  ['The_Bosun.glb', 'The Bosun.glb', '538ae4ab357a4f23ce20b600c0f43c5f7eb40e9d'],
  ['The_Commodore.glb', 'The Commodore.glb', 'eb2f44b25d88420cc5196fe012027278abd2d9b0'],
  ['The_Heretic.glb', 'The Heretic.glb', 'd6cf952128b625e52a6e109de80d0c7493020806'],
  ['The_Pioneer.glb', 'The Pioneer.glb', '726bc406f0f7d965d5756483219d9138842c29c7'],
  ['The_Punk.glb', 'The Punk.glb', '129200342b76c18473a193a745d70a3c3a134c7d'],
  ['The_Street_Fighter.glb', 'The Street Fighter.glb', 'cf4ff7da5140239fd8278b54493d0ffb920ac374'],
  ['The_Adolescent.glb', 'The Adolescent.glb', '45af19ba7ed7a3265e3b7079e3df1992f95025ef'],
]);

function gitBlobSha(bytes) {
  const header = Buffer.from('blob ' + bytes.length + '\0');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function validateGlb(bytes, name, expectedSha) {
  if (bytes.length < 20) throw new Error(name + ' is too small to be a GLB');
  if (
    bytes[0] !== 0x67
    || bytes[1] !== 0x6c
    || bytes[2] !== 0x54
    || bytes[3] !== 0x46
  ) {
    throw new Error(name + ' does not contain the glTF binary magic');
  }
  const actualSha = gitBlobSha(bytes);
  if (actualSha !== expectedSha) {
    throw new Error(
      name + ' source integrity mismatch: expected ' + expectedSha + ', got ' + actualSha,
    );
  }
}

async function readValidExisting(filePath, name, expectedSha) {
  try {
    const info = await stat(filePath);
    if (info.size <= 1024) return false;
    const bytes = await readFile(filePath);
    validateGlb(bytes, name, expectedSha);
    return true;
  } catch {
    return false;
  }
}

await mkdir(TARGET_DIR, { recursive: true });

for (const [sourceName, targetName, expectedSha] of CHARACTERS) {
  const targetPath = path.join(TARGET_DIR, targetName);
  if (await readValidExisting(targetPath, targetName, expectedSha)) {
    console.log('[chimpions] verified', targetName);
    continue;
  }

  const url = SOURCE_BASE + '/' + encodeURIComponent(sourceName);
  console.log('[chimpions] sync', targetName);
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceName}: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  validateGlb(bytes, sourceName, expectedSha);
  await writeFile(targetPath, bytes);
}

console.log('[chimpions] all 10 source-identical GLBs ready');
