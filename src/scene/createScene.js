import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { OutdoorEnvironment } from '../graphics/OutdoorEnvironment.js';
import { quality } from '../graphics/RenderQualityManager.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xc4d7d4, quality.preset.fogDensity);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(GAME_CONFIG.renderer.clearColor, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Keep the photographic background as the visible DOM plate while giving
  // authored PBR metals an outdoor California-like world to reflect. The
  // procedural PMREM is reflection-only: it never replaces or darkens the
  // approved merch/Hollywood background.
  quality.attachRenderer(renderer, scene);
  const outdoorEnvironment = new OutdoorEnvironment(renderer);
  quality.attachEnvironment(outdoorEnvironment);

  return {
    scene,
    renderer,
    quality,
    disposeEnvironment() {
      if (scene.environment === outdoorEnvironment.texture) scene.environment = null;
      quality.detachEnvironment(outdoorEnvironment);
      outdoorEnvironment.dispose();
      quality.detachRenderer(renderer);
    },
  };
}
