import './style.css';
import { GAME_CONFIG } from './config/gameConfig.js';
import { createScene } from './scene/createScene.js';
import { createLighting } from './scene/createLighting.js';
import { createGround } from './scene/createGround.js';
import { createBackground } from './scene/createBackground.js';
import { HalfpipeVisual } from './halfpipe/HalfpipeVisual.js';
import { HalfpipeProfile } from './halfpipe/HalfpipeProfile.js';
import { HalfpipeDebug } from './halfpipe/HalfpipeDebug.js';
import { HalfpipePresentationBinder } from './halfpipe/HalfpipePresentationBinder.js';
import { HalfpipePresentationDebug } from './halfpipe/HalfpipePresentationDebug.js';
import { HalfpipeSimulation } from './halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from './halfpipe/HalfpipeSimulationPresentation.js';
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
const background = createBackground(stage, {
  imageUrl: GAME_CONFIG.assets.background,
  position: 'center center',
});
const lighting = createLighting(scene);
const ground = createGround(scene);
const hud = new HalfpipeHUD(stage);
const profile = new HalfpipeProfile();
const profileDebug = new HalfpipeDebug(profile);
scene.add(profileDebug.root);

let halfpipe = null;
let rider = null;
let presentationBinder = null;
let presentationDebug = null;
let simulation = null;
let simulationRunning = true;
let animationFrame = 0;
let lastFrameTime = null;
let lastWheelDistance = 0;
let lastTelemetryTime = 0;

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, GAME_CONFIG.renderer.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  cameraController.resize(width, height);
}

function formatTelemetry(state) {
  const runState = simulationRunning ? 'RUN' : 'PAUSE';
  return [
    `P · ${runState}`,
    'R · RESET',
    `X ${state.pipeX.toFixed(2)}`,
    `V ${state.tangentVelocity.toFixed(2)}`,
    `E ${state.specificEnergy.toFixed(1)}`,
    `C ${state.bottomCrossings}`,
    `Δ ${state.bottomCrossingInterval ? state.bottomCrossingInterval.toFixed(2) : '--'}`,
    `T ${state.turningPoints}`,
  ].join('   ');
}

function applySimulationState(state, { rotateWheels = true } = {}) {
  if (!rider || !presentationBinder || !simulation) return;

  presentationBinder.apply(simulationToPresentationState(profile, state));

  if (rotateWheels) {
    const wheelDelta = state.signedDistanceTravelled - lastWheelDistance;
    if (wheelDelta) rider.skateboard.rotateWheels(wheelDelta);
  }
  lastWheelDistance = state.signedDistanceTravelled;
}

function resetSimulation() {
  if (!simulation) return;
  const state = simulation.reset();
  lastWheelDistance = state.signedDistanceTravelled;
  applySimulationState(state, { rotateWheels: false });
  hud.setDebugText(formatTelemetry(state));
}

function setSimulationRunning(nextRunning) {
  simulationRunning = Boolean(nextRunning);
  lastFrameTime = null;
  if (simulation) hud.setDebugText(formatTelemetry(simulation.snapshot()));
  return simulationRunning;
}

function render(timestamp = 0) {
  const frameDelta = lastFrameTime === null ? 0 : (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  if (simulationRunning && simulation) {
    const result = simulation.advance(frameDelta);
    if (result.steps > 0) {
      applySimulationState(result.state);
      if (timestamp - lastTelemetryTime >= 100) {
        hud.setDebugText(formatTelemetry(result.state));
        lastTelemetryTime = timestamp;
      }
    }
  }

  renderer.render(scene, cameraController.camera);
  animationFrame = requestAnimationFrame(render);
}

function onKeyDown(event) {
  if (event.repeat) return;

  if (event.code === 'KeyD') profileDebug.toggle();

  if (event.code === 'KeyP') {
    setSimulationRunning(!simulationRunning);
  }

  if (event.code === 'KeyR') {
    setSimulationRunning(false);
    resetSimulation();
  }

  if (event.code === 'BracketLeft' || event.code === 'Comma') {
    setSimulationRunning(false);
    presentationDebug?.previous();
  }

  if (event.code === 'BracketRight' || event.code === 'Period') {
    setSimulationRunning(false);
    presentationDebug?.next();
  }
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
    background.ready,
  ]);

  rider = new RiderController({
    skateboard: skateboardAsset,
    chimpion: chimpionAsset,
  });
  scene.add(halfpipe.root, rider.root);

  presentationBinder = new HalfpipePresentationBinder(profile, rider);
  presentationDebug = new HalfpipePresentationDebug(profile, presentationBinder, {
    onChange(station, index, count) {
      hud.setDebugText(`PAUSED   [ ] · ${index + 1}/${count} ${station.name}   P · RESUME`);
    },
  });
  scene.add(presentationDebug.root);

  simulation = new HalfpipeSimulation(profile);
  resetSimulation();
  setSimulationRunning(true);

  loadingState.classList.add('is-hidden');
  stage.classList.add('is-ready');
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  animationFrame = requestAnimationFrame(render);

  window.__HALFPIPE_FOUNDATION__ = {
    halfpipe,
    rider,
    profile,
    profileDebug,
    presentationBinder,
    presentationDebug,
    simulation,
    physics: {
      get running() {
        return simulationRunning;
      },
      setRunning: setSimulationRunning,
      reset: resetSimulation,
      applyCurrentState() {
        applySimulationState(simulation.snapshot(), { rotateWheels: false });
      },
    },
    camera: cameraController.camera,
    background,
    ground,
    lighting,
  };
}

function dispose() {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKeyDown);
  halfpipe?.dispose();
  rider?.dispose();
  profileDebug.dispose();
  presentationDebug?.dispose();
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
