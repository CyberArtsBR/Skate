import * as THREE from 'three';
import { quality } from '../graphics/RenderQualityManager.js';

export function createLighting(scene) {
  const hemisphere = new THREE.HemisphereLight(0xdaf5ff, 0x6b5140, 1.7);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffe5bd, 3.7);
  key.name = 'california-key-light';
  key.position.set(-10, 20, 14);
  key.castShadow = true;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 55;
  key.shadow.bias = -0.00025;
  key.shadow.radius = 3;
  scene.add(key);
  const unregisterShadow = quality.registerShadowLight(key);

  const fill = new THREE.DirectionalLight(0x8ec8e8, 0.95);
  fill.position.set(12, 8, -12);
  scene.add(fill);

  function applyLightingPreset() {
    const lighting = quality.preset.lighting || {};
    hemisphere.intensity = Number(lighting.hemisphere ?? 1.7);
    key.intensity = Number(lighting.key ?? 3.7);
    fill.intensity = Number(lighting.fill ?? 0.95);
    key.shadow.radius = Number(lighting.shadowRadius ?? 3.0);
    key.shadow.needsUpdate = true;
  }

  applyLightingPreset();
  const unsubscribeQuality = quality.subscribe(applyLightingPreset);

  return {
    hemisphere,
    key,
    fill,
    dispose() {
      unsubscribeQuality();
      unregisterShadow();
      scene.remove(hemisphere, key, fill);
      key.shadow.map?.dispose?.();
    },
  };
}
