import * as THREE from 'three';

// Keep the supplied artwork and satin steel. Painted graphics are dielectric,
// unlike bare metal; deriving a mask fixes their washed-out metallic response.
// One packed 512px texture also supplies subtle brushed surface relief.
export function prepareRampSurfaceFinish(material) {
  if (material.name === 'FRENTE' && !material.normalMap && !material.bumpMap) {
    const size = 256, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      // Minute panel waviness breaks a perfectly uniform reflection on the
      // orthographic front face; fine grain keeps it recognizably brushed metal.
      const height = 128 + Math.sin(x * 0.045) * 7 + Math.sin(y * 0.027) * 4
        + Math.sin(x * 1.9 + y * 0.01) * 1.5;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = Math.round(height);
      pixels[index + 3] = 255;
    }
    const detail = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    detail.name = 'front-metal-brushed-relief';
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.minFilter = THREE.LinearMipmapLinearFilter;
    detail.magFilter = THREE.LinearFilter;
    detail.generateMipmaps = true;
    detail.needsUpdate = true;
    material.bumpMap = detail;
    material.bumpScale = 0.018;
    material.needsUpdate = true;
    return;
  }
  if (material.name !== 'Steel_Brushed_Stainless' || !material.map?.image
    || material.metalnessMap || !globalThis.document) return;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(material.map.image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const r = pixels[index] / 255, g = pixels[index + 1] / 255, b = pixels[index + 2] / 255;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const paint = THREE.MathUtils.smoothstep(chroma, 0.07, 0.22);
      const darkInk = 1 - THREE.MathUtils.smoothstep(Math.max(r, g, b), 0.12, 0.32);
      const grain = Math.sin(x * 2.7 + Math.sin(y * 0.018) * 0.4) * 10
        + Math.sin(x * 0.71 + y * 0.011) * 5;
      pixels[index] = Math.round(128 + grain);
      pixels[index + 1] = 255;
      pixels[index + 2] = Math.round(255 - Math.max(paint, darkInk) * 245);
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
  if (!material.normalMap && !material.bumpMap) {
    material.bumpMap = detail;
    material.bumpScale = 0.004;
  }
  material.needsUpdate = true;
}
