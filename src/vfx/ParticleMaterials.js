import * as THREE from 'three';

export function createSoftParticleMaterial({ kind = 'dust', color = 0xffffff, opacity = 0.3 } = {}) {
  const size = 48;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1);
    const v = y / (size - 1);
    const index = (y * size + x) * 4;
    let alpha;
    if (kind === 'stroke') {
      const taper = Math.sin(u * Math.PI) ** 0.55;
      const distance = Math.abs(v - 0.5) / Math.max(0.02, taper * 0.42);
      alpha = Math.max(0, 1 - distance) ** 1.3 * Math.sin(u * Math.PI) ** 0.35;
    } else {
      const distance = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
      alpha = Math.max(0, 1 - distance * distance) ** (kind === 'flash' ? 2.6 : 2);
      if (kind === 'dust') alpha *= 0.84 + 0.16 * Math.sin(x * 0.91 + y * 0.57) ** 2;
    }
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    pixels[index + 3] = Math.round(alpha * 255);
  }
  const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ color, opacity, map,
    transparent: true, alphaTest: 0.005, depthWrite: false,
    depthTest: true, side: THREE.DoubleSide, toneMapped: kind === 'dust' });
  material.userData.ownsParticleMap = true;
  return material;
}

export function createTaperedArcGeometry() {
  const segments = 28;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const angle = progress * Math.PI * 0.75;
    const halfWidth = 0.05 * Math.sin(progress * Math.PI) ** 0.6 + 0.002;
    for (const edge of [-1, 1]) {
      const radius = 0.94 + halfWidth * edge;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      uvs.push(progress, edge < 0 ? 0 : 1);
    }
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
