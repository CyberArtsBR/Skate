import './style.css';
import { GAME_CONFIG } from './config/gameConfig.js';
import { createScene } from './scene/createScene.js';
import { createLighting } from './scene/createLighting.js';
import { createGround } from './scene/createGround.js';
import { createBackground } from './scene/createBackground.js';
import { HalfpipeVisual } from './halfpipe/HalfpipeVisual.js';
import { HalfpipeProfile } from './halfpipe/HalfpipeProfile.js';
import { HalfpipeDebug } from './halfpipe/HalfpipeDebug.js';
import { SkateboardVisual } from './skateboard/SkateboardVisual.js';
import { ChimpionLoader } from './character/ChimpionLoader.js';
import { RiderController } from './character/RiderController.js';
import { HalfpipeCamera } from './camera/HalfpipeCamera.js';
import { HalfpipeHUD } from './ui/HalfpipeHUD.js';

const stage = document.querySelector('#game-stage');
const canvas = document.querySelector('#game-canvas');
const loadingState = document.querySelector('#loading-state');

const { scene, renderer } = createScene(canvas);
const cameraController = new HalfpipeCamera();
const background = createBackground(stage);
const lighting = createLighting(scene);
const ground = createGround(scene);
const hud = new HalfpipeHUD(stage);
const profile = new HalfpipeProfile();
const profileDebug = new HalfpipeDebug(profile);
scene.add(profileDebug.root);

let halfpipe = null;
let rider = null;
let animationFrame = 0;

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, GAME_CONFIG.renderer.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  cameraController.resize(width, height);
}

function render() {
  renderer.render(scene, cameraController.camera);
  animationFrame = requestAnimationFrame(render);
}

function onKeyDown(event) {
  if (event.repeat) return;
  if (event.code === 'KeyD') profileDebug.toggle();
}

async function bootstrap() {
  resize();

  const halfpipeAsset = new HalfpipeVisual(GAME_CONFIG.assets.halfpipe);
  const skateboardAsset = new SkateboardVisual(GAME_CONFIG.assets.skateboard);
  const chimpionAsset = new ChimpionLoader(GAME_CONFIG.assets.chimpion);

  [halfpipe] = await Promise.all([
    halfpipeAsset.load(),
    skateboardAsset.load(),
    chimpionAsset.load(),
  ]);

  rider = new RiderController({
    skateboard: skateboardAsset,
    chimpion: chimpionAsset,
  });
  scene.add(halfpipe.root, rider.root);

  loadingState.classList.add('is-hidden');
  stage.classList.add('is-ready');
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  render();

  window.__HALFPIPE_FOUNDATION__ = {
    halfpipe,
    rider,
    profile,
    profileDebug,
    camera: cameraController.camera,
  };
}

function dispose() {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKeyDown);
  halfpipe?.dispose();
  rider?.dispose();
  profileDebug.dispose();
  ground.dispose();
  lighting.dispose();
  background.dispose();
  hud.dispose();
  renderer.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });

bootstrap().catch((error) => {
  loadingState.textContent = 'FOUNDATION LOAD FAILED';
  loadingState.classList.add('is-error');
  console.error(error);
});
