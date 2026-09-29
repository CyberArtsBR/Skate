import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const SOURCE_REPO = 'CyberArtsBR/Chimp-Jump';
const SOURCE_SHA = '2153f517ef4e691d4ada1287f401de2043ba67ba';
const SOURCE_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_SHA}/public/model/characters`;
const TARGET_DIR = path.resolve('public/models/characters');

const CHARACTERS = Object.freeze([
  ['The_Archon.glb', 'The Archon.glb'],
  ['The_Angsty.glb', 'The Angsty.glb'],
  ['The_Apologetic.glb', 'The Apologetic.glb'],
  ['The_Bosun.glb', 'The Bosun.glb'],
  ['The_Commodore.glb', 'The Commodore.glb'],
  ['The_Heretic.glb', 'The Heretic.glb'],
  ['The_Pioneer.glb', 'The Pioneer.glb'],
  ['The_Punk.glb', 'The Punk.glb'],
  ['The_Street_Fighter.glb', 'The Street Fighter.glb'],
  ['The_Adolescent.glb', 'The Adolescent.glb'],
]);

async function isUsableFile(filePath) {
  try {
    await access(filePath, constants.R_OK);
    const info = await stat(filePath);
    return info.size > 1024;
  } catch {
    return false;
  }
}

function validateGlb(bytes, name) {
  if (bytes.length < 20) throw new Error(name + ' is too small to be a GLB');
  if (
    bytes[0] !== 0x67
    || bytes[1] !== 0x6c
    || bytes[2] !== 0x54
    || bytes[3] !== 0x46
  ) {
    throw new Error(name + ' does not contain the glTF binary magic');
  }
}

await mkdir(TARGET_DIR, { recursive: true });

for (const [sourceName, targetName] of CHARACTERS) {
  const targetPath = path.join(TARGET_DIR, targetName);
  if (await isUsableFile(targetPath)) {
    console.log('[chimpions] keep', targetName);
    continue;
  }

  const url = SOURCE_BASE + '/' + encodeURIComponent(sourceName);
  console.log('[chimpions] sync', targetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceName}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateGlb(bytes, sourceName);
  await writeFile(targetPath, bytes);
}

console.log('[chimpions] roster ready');
