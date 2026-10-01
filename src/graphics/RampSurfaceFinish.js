import * as THREE from 'three';

// Keep the supplied artwork and satin steel. Painted graphics are dielectric,
// unlike bare metal; a reviewed UV paint mask fixes their metallic response.
// One packed 512px texture also supplies subtle brushed surface relief.
export function prepareRampSurfaceFinish(material, paintMask = null) {
  if (material.userData.halfpipeFinishPrepared) return;
  if (material.name === 'FRENTE' && !material.normalMap && !material.bumpMap) {
    const size = 256, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      // Minute panel waviness breaks a perfectly uniform reflection on the
      // orthographic front face; fine grain keeps it recognizably brushed metal.
      const height = 128 + Math.sin(x * 0.045) * 7 + Math.sin(y * 0.027) * 4
        + Math.sin(x * 1.9 + y * 0.01) * 1.5;
      pixels[index] = Math.round(height);
      pixels[index + 1] = Math.round(235 + Math.sin(x * 0.045) * 15);
      pixels[index + 2] = 255;
      pixels[index + 3] = 255;
    }
    const detail = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    detail.name = 'front-metal-brushed-relief';
    detail.colorSpace = THREE.NoColorSpace;
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.minFilter = THREE.LinearMipmapLinearFilter;
    detail.magFilter = THREE.LinearFilter;
    detail.generateMipmaps = true;
    detail.needsUpdate = true;
    material.bumpMap = detail;
    material.bumpScale = 0.012;
    // This named front panel is satin steel, not the exported mirror finish.
    material.roughness = Math.max(Number(material.roughness) || 0, 0.38);
    if (!material.roughnessMap) material.roughnessMap = detail;
    material.userData.halfpipeFinishPrepared = true;
    material.needsUpdate = true;
    return;
  }
  if (material.name !== 'Steel_Brushed_Stainless' || !material.map?.image
    || !globalThis.document) return;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  let paintPixels = null;
  if (paintMask?.image) {
    context.drawImage(paintMask.image, 0, 0, size, size);
    paintPixels = context.getImageData(0, 0, size, size).data;
  }
  const sourceMetalness = material.metalnessMap;
  let metalnessPixels = null;
  if (sourceMetalness?.image) {
    context.clearRect(0, 0, size, size);
    context.drawImage(sourceMetalness.image, 0, 0, size, size);
    metalnessPixels = context.getImageData(0, 0, size, size).data;
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const paint = paintPixels ? paintPixels[index] / 255 : 0;
      const grain = Math.sin(x * 2.7 + Math.sin(y * 0.018) * 0.4) * 10
        + Math.sin(x * 0.71 + y * 0.011) * 5;
      pixels[index] = Math.round(128 + grain);
      pixels[index + 1] = 255;
      // Keep exported metal data on the unpainted field; only the printed
      // logo/ink becomes dielectric. Its authored roughness texture stays intact.
      const sourceMetal = metalnessPixels ? metalnessPixels[index + 2] : 255;
      pixels[index + 2] = Math.round(sourceMetal * (1 - paint * 0.97));
      pixels[index + 3] = 255;
    }
  }
  const detail = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  detail.name = 'ramp-brush-and-paint-mask';
  detail.colorSpace = THREE.NoColorSpace;
  detail.flipY = material.map.flipY;
  detail.wrapS = material.map.wrapS;
  detail.wrapT = material.map.wrapT;
  detail.repeat.copy(material.map.repeat);
  detail.offset.copy(material.map.offset);
  detail.center.copy(material.map.center);
  detail.rotation = material.map.rotation;
  detail.channel = material.map.channel;
  detail.minFilter = THREE.LinearMipmapLinearFilter;
  detail.magFilter = THREE.LinearFilter;
  detail.generateMipmaps = true;
  detail.needsUpdate = true;
  material.metalnessMap = detail;
  // The shipped GLB shares one packed metal/roughness texture, so keeping its
  // roughnessMap also retains ownership of the replaced metalness source.
  if (!material.normalMap && !material.bumpMap) {
    material.bumpMap = detail;
    material.bumpScale = 0.004;
  }
  material.userData.halfpipeFinishPrepared = true;
  material.userData.halfpipePaintMask = paintMask
    ? '/images/materials/halfpipe-paint-mask.png' : null;
  material.needsUpdate = true;
}
