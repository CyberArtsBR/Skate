import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb9d7df, 0.0085);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(GAME_CONFIG.renderer.clearColor, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return { scene, renderer };
}
