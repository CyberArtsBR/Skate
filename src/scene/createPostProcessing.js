import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

export function createPostProcessing(renderer, scene, camera) {
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearAlpha = 0;

  const bloomConfig = GAME_CONFIG.renderer.bloom;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    bloomConfig.strength,
    bloomConfig.radius,
    bloomConfig.threshold,
  );

  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  let enabled = true;
  let fallbackReason = '';

  return {
    composer,
    bloomPass,
    get enabled() {
      return enabled;
    },
    get fallbackReason() {
      return fallbackReason;
    },
    setSize(width, height) {
      composer.setSize(Math.max(1, width), Math.max(1, height));
    },
    render() {
      if (!enabled) {
        renderer.render(scene, camera);
        return;
      }
      try {
        composer.render();
      } catch (error) {
        enabled = false;
        fallbackReason = error instanceof Error ? error.message : String(error);
        console.warn('Bloom post-processing disabled; falling back to direct renderer.', error);
        renderer.render(scene, camera);
      }
    },
    dispose() {
      composer.dispose?.();
      renderTarget.dispose();
    },
  };
}
