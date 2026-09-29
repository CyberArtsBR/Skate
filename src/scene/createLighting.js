import * as THREE from 'three';
import { quality } from '../graphics/RenderQualityManager.js';

export function createLighting(scene) {
  const hemisphere = new THREE.HemisphereLight(0xdaf5ff, 0x735746, 1.55);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffe5bd, 3.45);
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

  const fill = new THREE.DirectionalLight(0x9acde8, 0.88);
  fill.position.set(12, 8, -12);
  scene.add(fill);

  return {
    hemisphere,
    key,
    fill,
    dispose() {
      unregisterShadow();
      scene.remove(hemisphere, key, fill);
      key.shadow.map?.dispose?.();
    },
  };
}
