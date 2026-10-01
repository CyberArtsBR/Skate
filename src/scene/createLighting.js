import * as THREE from 'three';
import { quality } from '../graphics/RenderQualityManager.js';
import { getMapLightingProfile } from '../graphics/MapLightingProfiles.js';

export function createLighting(scene) {
  let mapProfile = getMapLightingProfile('city');
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
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3;
  scene.add(key);
  const unregisterShadow = quality.registerShadowLight(key);

  const fill = new THREE.DirectionalLight(0xb7d3e0, 1.05);
  fill.position.set(12, 8, -12);
  scene.add(fill);

  function applyLightingPreset() {
    const lighting = quality.preset.lighting || {};
    hemisphere.color.setHex(mapProfile.skyColor);
    hemisphere.groundColor.setHex(mapProfile.groundColor);
    key.color.setHex(mapProfile.keyColor);
    fill.color.setHex(mapProfile.fillColor);
    key.position.fromArray(mapProfile.keyPosition);
    fill.position.fromArray(mapProfile.fillPosition);
    hemisphere.intensity = Number(lighting.hemisphere ?? 1.7) * mapProfile.hemisphereFactor;
    key.intensity = Number(lighting.key ?? 3.7) * mapProfile.keyFactor;
    fill.intensity = Number(lighting.fill ?? 0.95) * mapProfile.fillFactor;
    key.shadow.radius = Number(lighting.shadowRadius ?? 3.0);
    key.shadow.needsUpdate = true;
  }

  applyLightingPreset();
  const unsubscribeQuality = quality.subscribe(applyLightingPreset);

  return {
    hemisphere,
    key,
    fill,
    setMapProfile(mapId = 'city') {
      mapProfile = getMapLightingProfile(mapId);
      quality.setMapLighting(mapProfile);
      return mapProfile;
    },
    dispose() {
      unsubscribeQuality();
      unregisterShadow();
      scene.remove(hemisphere, key, fill);
      key.shadow.map?.dispose?.();
    },
  };
}
