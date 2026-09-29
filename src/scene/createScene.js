import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc4d7d4, 0.0055);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(GAME_CONFIG.renderer.clearColor, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // The photographic background remains a DOM layer. Give authored metallic
  // GLB materials something neutral to reflect without changing their PBR
  // parameters and without post-processing the rider or the background.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = GAME_CONFIG.renderer.environmentIntensity;
  room.dispose?.();
  pmrem.dispose();

  return {
    scene,
    renderer,
    disposeEnvironment() {
      if (scene.environment === environmentTarget.texture) scene.environment = null;
      environmentTarget.dispose();
    },
  };
}
