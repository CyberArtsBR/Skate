import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { CinematicPostProcessing } from '../graphics/CinematicPostProcessing.js';
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

  // The supplied HDRI is reflection/IBL only. The approved photographic DOM
  // background stays visible and is never replaced by scene.background.
  quality.attachRenderer(renderer, scene);
  const postProcessing = new CinematicPostProcessing(renderer, scene, quality);
  let disposed = false;
  const outdoorEnvironment = new OutdoorEnvironment(renderer, {
    url: GAME_CONFIG.assets.environment,
    onReady(texture) {
      if (disposed) return;
      scene.environment = texture;
      scene.environmentIntensity = quality.environmentIntensity;
    },
  });
  quality.attachEnvironment(outdoorEnvironment);

  return {
    scene,
    renderer,
    quality,
    postProcessing,
    disposeEnvironment() {
      disposed = true;
      postProcessing.dispose();
      if (scene.environment === outdoorEnvironment.texture) scene.environment = null;
      quality.detachEnvironment(outdoorEnvironment);
      outdoorEnvironment.dispose();
      quality.detachRenderer(renderer);
    },
  };
}
