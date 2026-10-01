// Corrections are limited to the shipped roster and exact exported material
// slots. Uploaded GLBs and legitimate metallic accessories keep their authoring.
const PROFILES = Object.freeze({
  'The Archon.glb': {
    tripo_mat_2f25a13e: { metalness: 0, roughness: 0.64, dielectric: true },
    // The separate staff has gilded ornament, not a skin/fabric material.
    tripo_mat_7df9a71a: { metalness: 0.89, roughness: 0.36, normalScale: 0.18 },
    tripo_mat_82014bbe: { metalness: 0, roughness: 0.65, dielectric: true },
  },
  'The Heretic.glb': {
    tripo_mat_e80a424d: { metalness: 0, roughness: 0.61, dielectric: true },
  },
  'The Commodore.glb': {
    tripo_mat_844a4305: { metalness: 0, roughness: 0.56, dielectric: true },
  },
  'The Pioneer.glb': {
    'Material.001': { metalness: 0.12, roughness: 0.45, dielectric: true },
    tripo_mat_fc4c4d58: { metalness: 0.25, roughness: 0.38 },
  },
  'The Punk.glb': {
    'Fish Scale Tile 01': { metalness: 0, roughness: 0.67, dielectric: true },
  },
  'The Street Fighter.glb': {
    tripo_mat_df04f083: { metalness: 0, roughness: 0.59, dielectric: true },
  },
  'The Bosun.glb': {
    'tripo_mat_6db335ad.001': { metalness: 0, roughness: 0.64, dielectric: true },
  },
  'The Adolescent.glb': {
    tripo_mat_de919a2c: { metalness: 0, roughness: 0.65, dielectric: true },
  },
  'The Angsty.glb': {
    'tripo_mat_cb19523d.001': { metalness: 0, roughness: 0.66, dielectric: true },
  },
  'The Apologetic.glb': {
    tripo_mat_82014bbe: { metalness: 0, roughness: 0.65, dielectric: true },
    // The separately authored sabre remains metal, with readable satin highlights.
    'lambert1.001': { metalness: 0.72, roughness: 0.3 },
  },
});

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

function capRosterTexture(texture) {
  const image = texture?.image;
  const width = Number(image?.width), height = Number(image?.height);
  if (!globalThis.document || !width || !height || Math.max(width, height) <= 2048) return;
  const scale = 2048 / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return;
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas;
    texture.needsUpdate = true;
    texture.userData.rosterTextureSize = [canvas.width, canvas.height];
  } catch {
    // Compressed/unsupported image sources keep their valid original texture.
  }
}

export function applyCharacterMaterialProfile(model, sourceUrl) {
  const path = String(sourceUrl || '').split(/[?#]/)[0];
  if (!path.startsWith('/models/characters/')) return false;
  let file;
  try { file = decodeURIComponent(path.slice('/models/characters/'.length)); }
  catch { return false; }
  const profile = PROFILES[file];
  if (!profile) return false;
  const visited = new Set();
  const textures = new Set();
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || visited.has(material)) continue;
      visited.add(material);
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (!texture?.isTexture || textures.has(texture)) continue;
        textures.add(texture);
        capRosterTexture(texture);
      }
      const finish = profile[material.name];
      if (!finish || !('metalness' in material)) continue;
      material.metalness = finish.metalness;
      material.roughness = finish.roughness;
      if (finish.normalScale !== undefined && material.normalMap) {
        material.normalScale?.setScalar(finish.normalScale);
      }
      if (finish.dielectric) {
        // Some exports disabled specular entirely with ior=1 / specular=0.
        if ('ior' in material) material.ior = 1.45;
        if ('specularIntensity' in material) material.specularIntensity = 1;
        material.specularColor?.setHex(0xffffff);
      }
      material.userData.characterFinishProfile = file;
      material.needsUpdate = true;
    }
  });
  return true;
}
