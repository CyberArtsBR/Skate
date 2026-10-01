import { ChimpionLoader } from './ChimpionLoader.js';

export async function loadCustomAvatar(file) {
  if (!file || !/\.glb$/i.test(file.name)) throw new Error('Choose a .GLB avatar file.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Choose a GLB smaller than 40 MB.');
  const data = await file.arrayBuffer();
  const header = new DataView(data);
  if (data.byteLength < 20 || header.getUint32(0, true) !== 0x46546c67
    || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== data.byteLength
    || header.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('This file is not a valid GLB 2.0 avatar.');
  }
  const length = header.getUint32(12, true);
  if (20 + length > data.byteLength) throw new Error('The GLB file is incomplete.');
  let document;
  try { document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, length))); }
  catch { throw new Error('The GLB file contains unreadable model data.'); }
  if ([...(document.buffers || []), ...(document.images || [])]
    .some(entry => entry.uri && !entry.uri.startsWith('data:'))) {
    throw new Error('Export one GLB with its textures embedded.');
  }
  const url = URL.createObjectURL(file);
  const avatar = new ChimpionLoader(url);
  try {
    await avatar.load();
    return {
      id: 'custom-' + (globalThis.crypto?.randomUUID?.() || Date.now()),
      name: file.name.replace(/\.glb$/i, '').slice(0, 48) || 'Your Avatar',
      tribe: 'YOUR GLB AVATAR', custom: true, modelUrl: url,
      preloadedAsset: avatar,
    };
  } catch (error) {
    avatar.dispose();
    URL.revokeObjectURL(url);
    if (/missing required slots/i.test(error.message)) {
      throw new Error('Avatar needs a humanoid rig with hips, both legs and feet. Mixamo and Chimpion rigs are supported.');
    }
    throw new Error('Could not load this GLB. Export a rigged avatar with embedded textures.');
  }
}

export function releaseCustomAvatar(hero) {
  hero?.preloadedAsset?.dispose();
  if (hero) hero.preloadedAsset = null;
  if (hero?.custom) URL.revokeObjectURL(hero.modelUrl);
}
