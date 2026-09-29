import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

function disposeEnvironmentScene(environmentScene) {
  environmentScene.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      for (const material of object.material) material?.dispose?.();
    } else {
      object.material?.dispose?.();
    }
  });
}

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

  // The photographic background is a DOM layer and therefore cannot provide
  // image-based lighting to physically based metallic materials. The new front
  // shell is authored as a real metal, so without an environment it reflects
  // mostly black. Give PBR materials a neutral HDR-like studio environment
  // while keeping the visible California background unchanged.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = GAME_CONFIG.renderer.environmentIntensity;
  disposeEnvironmentScene(room);
  pmrem.dispose();

  scene.userData.hasReflectionEnvironment = true;
  scene.userData.environmentIntensity = scene.environmentIntensity;

  return {
    scene,
    renderer,
    disposeEnvironment() {
      if (scene.environment === environmentTarget.texture) scene.environment = null;
      environmentTarget.dispose();
    },
  };
}
