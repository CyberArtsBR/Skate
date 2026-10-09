import * as THREE from 'three';
import { publicAssetUrl } from '../config/publicAssetUrl.js';

const PORTALS_PUBLIC_ROOTS = Object.freeze([
  '/audio/',
  '/hdri/',
  '/images/',
  '/models/',
]);

export function installPortalsAssetBase() {
  if (THREE.DefaultLoadingManager.__halfpipePortalsAssetBaseInstalled) return false;
  THREE.DefaultLoadingManager.__halfpipePortalsAssetBaseInstalled = true;
  THREE.DefaultLoadingManager.setURLModifier((url) => {
    const value = String(url || '');
    if (!PORTALS_PUBLIC_ROOTS.some((prefix) => value.startsWith(prefix))) return value;
    return publicAssetUrl(value);
  });
  return true;
}
