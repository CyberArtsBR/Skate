import './style.css';
import { GAME_CONFIG } from './config/gameConfig.js';
import { quality } from './graphics/RenderQualityManager.js';
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
import { HalfpipePumpInput } from './input/HalfpipePumpInput.js';
import { HalfpipeSession, formatSessionTime } from './game/HalfpipeSession.js';
import { HALFPIPE_FLOW_STATE, HalfpipeGameFlow } from './game/HalfpipeGameFlow.js';
import { ControlsScreen } from './ui/ControlsScreen.js';
import { CountdownOverlay } from './ui/CountdownOverlay.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { ResultsScreen } from './ui/ResultsScreen.js';
import { HalfpipeVFX } from './vfx/HalfpipeVFX.js';
import { HalfpipeAudio } from './audio/HalfpipeAudio.js';
import { GRAPHICS_PRESETS, DEFAULT_GRAPHICS_PRESET } from './graphics/GraphicsQuality.js';

const stage = document.querySelector('#game-stage');
const canvas = document.querySelector('#game-canvas');
const loadingState = document.querySelector('#loading-state');

const { scene, renderer, disposeEnvironment } = createScene(canvas);
const cameraController = new HalfpipeCamera();
const background = createBackground(stage, {
  imageUrl: GAME_CONFIG.assets.background,
  position: 'center center',
});
const lighting = createLighting(scene);
const ground = createGround(scene);
const hud = new HalfpipeHUD(stage);
const profile = new HalfpipeProfile();
const session = new HalfpipeSession({
  durationSeconds: GAME_CONFIG.session.durationSeconds,
});
const profileDebug = new HalfpipeDebug(profile);
scene.add(profileDebug.root);

const GRAPHICS_STORAGE_KEY = 'chimpions-halfpipe.graphics-quality';
const AUDIO_STORAGE_KEY = 'chimpions-halfpipe.master-volume';
const GRAPHICS_NAMES = Object.freeze(Object.keys(GRAPHICS_PRESETS));
const vfx = new HalfpipeVFX(scene);
let currentAudioVolume = readStoredNumber(AUDIO_STORAGE_KEY, 0.8);
let currentGraphicsPreset = restoreGraphicsPreset();
const audio = new HalfpipeAudio({
  masterVolume: currentAudioVolume,
  onHaptics: playControllerHaptics,
});
quality.setPreset(currentGraphicsPreset);

const titleScreen = createMenuScreen('title-screen', 'CALIFORNIA HALF-PIPE', 'CHIMPIONS HALF-PIPE', [
  ['start', 'START GAME'],
  ['controls', 'CONTROLS'],
]);
const characterScreen = createMenuScreen('character-screen', 'SELECT RIDER', 'THE HERETIC', [
  ['select', 'RIDE AS THE HERETIC'],
  ['back', 'BACK'],
]);
const graphicsScreen = createMenuScreen('graphics-screen', 'SETTINGS', 'GRAPHICS', [
  ...GRAPHICS_NAMES.map((name) => [name, name.toUpperCase()]),
  ['back', 'BACK'],
]);
const audioScreen = createMenuScreen('audio-screen', 'SETTINGS', 'AUDIO', [
  ['down', 'VOLUME -'],
  ['up', 'VOLUME +'],
  ['mute', 'MUTE / UNMUTE'],
  ['back', 'BACK'],
]);

let halfpipe = null;
let rider = null;
let presentationBinder = null;
let presentationDebug = null;
let simulation = null;
let simulationRunning = false;
let animationFrame = 0;
let lastFrameTime = null;
let lastWheelDistance = 0;
let lastTelemetryTime = 0;
let lastPresentationState = null;
let pumpInput = null;
let webglLost = false;
let disposed = false;
let audioUnlockStarted = false;
let unregisterRiderQuality = null;
let controlsReturnState = HALFPIPE_FLOW_STATE.CHARACTER_SELECT;
const integrationStats = { longestCombo: 0 };

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setPixelRatio(quality.resolvePixelRatio(window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  cameraController.resize(width, height);
}

function formatTelemetry(state) {
  const runState = session.phase.toUpperCase();
  return [
    `P · ${runState}`,
    'R · RESET',
    `X ${state.pipeX.toFixed(2)}`,
    `V ${state.tangentVelocity.toFixed(2)}`,
    `E ${state.specificEnergy.toFixed(1)}`,
    `C ${state.bottomCrossings}`,
    `Δ ${state.bottomCrossingInterval ? state.bottomCrossingInterval.toFixed(2) : '--'}`,
    `T ${state.turningPoints}`,
    `PUMP ${state.pumpIntent > 0 ? 'UP' : state.pumpIntent < 0 ? 'DOWN' : '-'}`,
    `Q ${state.pumpTimingQuality.toFixed(2)}`,
    `TURN ${state.turnIntent < 0 ? 'LEFT' : state.turnIntent > 0 ? 'RIGHT' : '-'}`,
    state.lastTrick
      ? `TRICK ${state.lastTrick} +${state.lastTrickPoints || 0}`
      : 'TRICK -',
    state.mode === 'airborne'
      ? `AIR ${state.airVerticalVelocity.toFixed(1)} · H ${(state.airY ?? 0).toFixed(1)}`
      : 'CONTACT',
  ].join('   ');
}

function readStoredNumber(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  } catch {
    return fallback;
  }
}

function restoreGraphicsPreset() {
  try {
    const stored = String(globalThis.localStorage?.getItem(GRAPHICS_STORAGE_KEY) || '').toLowerCase();
    return GRAPHICS_NAMES.includes(stored) ? stored : DEFAULT_GRAPHICS_PRESET;
  } catch {
    return DEFAULT_GRAPHICS_PRESET;
  }
}

function persistSetting(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); } catch {}
}

function createMenuScreen(className, eyebrow, title, actions) {
  const root = document.createElement('section');
  root.className = 'game-ui-layer menu-screen ' + className;
  root.hidden = true;
  const card = document.createElement('div');
  card.className = 'menu-card';
  const brow = document.createElement('p');
  brow.className = 'menu-eyebrow';
  brow.textContent = eyebrow;
  const heading = document.createElement('h1');
  heading.textContent = title;
  const actionsRoot = document.createElement('div');
  actionsRoot.className = 'menu-actions';
  card.append(brow, heading, actionsRoot);
  root.append(card);
  stage.append(root);

  const buttons = new Map();
  for (const [id, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-button';
    button.dataset.action = id;
    button.textContent = label;
    actionsRoot.append(button);
    buttons.set(id, button);
  }

  return {
    root,
    buttons,
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    dispose() { root.remove(); },
  };
}

const gameFlow = new HalfpipeGameFlow({
  settings: { audioVolume: currentAudioVolume },
  callbacks: {
    onTransition: syncFlowUI,
    onReducedCameraMotionChange(enabled) {
      cameraController.setReducedMotion(enabled);
      vfx.setReducedMotion(enabled);
      hud.setPlayerMode({ ...hud.playerMode, reducedMotion: enabled });
    },
    onControllerVibrationChange(enabled) {
      audio.setVibrationEnabled(enabled);
    },
    onAudioVolumeChange(value) {
      setAudioVolume(value);
    },
    onHudAccessibilityChange({ highContrast, uiScale }) {
      hud.setPlayerMode({
        highContrast,
        uiScale,
        reducedMotion: gameFlow.settings.reducedCameraMotion,
      });
    },
  },
});

const controlsScreen = new ControlsScreen(stage, { onBack: handleControlsExit });
const countdown = new CountdownOverlay(stage, {
  onTick(value) { audio.handleEvent({ type: 'COUNTDOWN', value }); },
  onGo() { audio.handleEvent({ type: 'COUNTDOWN', value: 'GO' }); },
  onComplete() {
    session.completeCountdown();
    simulationRunning = true;
    lastFrameTime = null;
    gameFlow.transitionTo(HALFPIPE_FLOW_STATE.RUN);
    hud.setStatus('', 'running');
    void audio.playMusic('gameplay');
    void audio.playAmbience('outdoor');
  },
});
const pauseMenu = new PauseMenu(stage, {
  onResume: resumeRun,
  onRestart: startCountdown,
  onControls: openPauseControls,
  onGraphics: openGraphicsMenu,
  onAudio: openAudioMenu,
  onMainMenu: returnToMainMenu,
});
const resultsScreen = new ResultsScreen(stage, {
  onRetry: startCountdown,
  onChangeRider: returnToCharacterSelect,
  onMainMenu: returnToMainMenu,
});

function hideAllFlowScreens() {
  titleScreen.hide();
  characterScreen.hide();
  controlsScreen.hide();
  countdown.hide();
  pauseMenu.hide();
  resultsScreen.hide();
  graphicsScreen.hide();
  audioScreen.hide();
}

function syncFlowUI({ state } = gameFlow.snapshot()) {
  hideAllFlowScreens();
  if (state === HALFPIPE_FLOW_STATE.TITLE) titleScreen.show();
  else if (state === HALFPIPE_FLOW_STATE.CHARACTER_SELECT) characterScreen.show();
  else if (state === HALFPIPE_FLOW_STATE.CONTROLS) controlsScreen.show();
  else if (state === HALFPIPE_FLOW_STATE.PAUSE) pauseMenu.show();
  else if (state === HALFPIPE_FLOW_STATE.RESULTS) resultsScreen.show(buildResultsStats());
}

function beginCharacterSelect() {
  void unlockAudioFromGesture();
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CHARACTER_SELECT);
}

function beginControlsFromCharacter() {
  controlsReturnState = HALFPIPE_FLOW_STATE.COUNTDOWN;
  controlsScreen.backButton.textContent = 'START RUN';
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CONTROLS);
}

function handleControlsExit() {
  if (controlsReturnState === HALFPIPE_FLOW_STATE.TITLE) {
    controlsScreen.backButton.textContent = 'BACK';
    gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE);
    return;
  }
  if (controlsReturnState === HALFPIPE_FLOW_STATE.PAUSE) {
    controlsScreen.backButton.textContent = 'BACK';
    gameFlow.transitionTo(HALFPIPE_FLOW_STATE.PAUSE);
    return;
  }
  startCountdown();
}

function startCountdown() {
  if (!simulation) return false;
  resetSimulation({ keepFlow: true });
  session.beginCountdown();
  simulationRunning = false;
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.COUNTDOWN);
  countdown.start();
  hud.setStatus('GET READY', 'ready');
  audio.resetSessionAudioState();
  return true;
}

function pauseRun() {
  if (gameFlow.state !== HALFPIPE_FLOW_STATE.RUN || session.phase !== 'running') return false;
  session.pause();
  simulationRunning = false;
  pumpInput?.clearHeldState();
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.PAUSE);
  hud.setStatus('PAUSED', 'paused');
  return true;
}

function resumeRun() {
  if (gameFlow.state !== HALFPIPE_FLOW_STATE.PAUSE) return false;
  session.resume();
  simulationRunning = true;
  lastFrameTime = null;
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.RUN);
  hud.setStatus('', 'running');
  return true;
}

function returnToCharacterSelect() {
  resetSimulation({ keepFlow: true });
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CHARACTER_SELECT);
}

function returnToMainMenu() {
  resetSimulation({ keepFlow: true });
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE);
  void audio.playMusic('menu');
}

function openPauseControls() {
  controlsReturnState = HALFPIPE_FLOW_STATE.PAUSE;
  controlsScreen.backButton.textContent = 'BACK';
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CONTROLS);
}

function openGraphicsMenu() {
  pauseMenu.hide();
  updateGraphicsMenuSelection();
  graphicsScreen.show();
}

function closeGraphicsMenu() {
  graphicsScreen.hide();
  pauseMenu.show();
}

function openAudioMenu() {
  pauseMenu.hide();
  updateAudioMenuLabels();
  audioScreen.show();
}

function closeAudioMenu() {
  audioScreen.hide();
  pauseMenu.show();
}

function setGraphicsPreset(name) {
  try {
    currentGraphicsPreset = quality.setPreset(name).name;
    persistSetting(GRAPHICS_STORAGE_KEY, currentGraphicsPreset);
    resize();
    updateGraphicsMenuSelection();
    return true;
  } catch {
    return false;
  }
}

function updateGraphicsMenuSelection() {
  for (const [id, button] of graphicsScreen.buttons) {
    button.classList.toggle('is-selected', id === currentGraphicsPreset);
  }
}

function cycleGraphicsPreset(direction) {
  const index = GRAPHICS_NAMES.indexOf(currentGraphicsPreset);
  const next = (index + Math.sign(direction) + GRAPHICS_NAMES.length) % GRAPHICS_NAMES.length;
  setGraphicsPreset(GRAPHICS_NAMES[next]);
}

function setAudioVolume(value) {
  currentAudioVolume = Math.max(0, Math.min(1, Number(value) || 0));
  audio.setMasterVolume(currentAudioVolume);
  persistSetting(AUDIO_STORAGE_KEY, currentAudioVolume);
  updateAudioMenuLabels();
  return currentAudioVolume;
}

function updateAudioMenuLabels() {
  const mute = audioScreen.buttons.get('mute');
  if (mute) mute.textContent = audio.muted ? 'UNMUTE' : 'MUTE';
  const title = audioScreen.root.querySelector('h1');
  if (title) title.textContent = 'AUDIO ' + Math.round(currentAudioVolume * 100) + '%';
}

function playControllerHaptics(recommendation) {
  const index = pumpInput?.activeGamepadIndex;
  if (index === null || index === undefined) return;
  const pad = globalThis.navigator?.getGamepads?.()?.[index];
  const actuator = pad?.vibrationActuator;
  if (!actuator?.playEffect) return;
  void actuator.playEffect('dual-rumble', {
    duration: recommendation.durationMs,
    startDelay: 0,
    weakMagnitude: recommendation.weakMagnitude,
    strongMagnitude: recommendation.strongMagnitude,
  }).catch(() => {});
}

async function unlockAudioFromGesture() {
  if (audio.isReady) return true;
  if (audioUnlockStarted) return false;
  audioUnlockStarted = true;
  try {
    const unlocked = await audio.unlock();
    if (unlocked) {
      audio.setMasterVolume(currentAudioVolume);
      void audio.playMusic(gameFlow.state === HALFPIPE_FLOW_STATE.RUN ? 'gameplay' : 'menu');
      void audio.playAmbience('outdoor');
    }
    return unlocked;
  } catch (error) {
    console.warn('[Halfpipe] Audio unavailable; continuing silently.', error);
    return false;
  } finally {
    audioUnlockStarted = false;
  }
}

function applySimulationState(state, { rotateWheels = true, presentationDt = 0 } = {}) {
  if (!rider || !presentationBinder || !simulation) return null;
  const presentationState = simulationToPresentationState(profile, state);
  presentationBinder.apply(presentationState);
  lastPresentationState = presentationState;
  cameraController.updateForRider({
    y: rider.root.position.y,
    airborne: presentationState.airborne,
    verticalVelocity: presentationState.verticalVelocity,
  }, presentationDt);

  if (rotateWheels) {
    const wheelDelta = state.signedDistanceTravelled - lastWheelDistance;
    if (wheelDelta) rider.skateboard.rotateWheels(wheelDelta);
  }
  lastWheelDistance = state.signedDistanceTravelled;
  return presentationState;
}

function buildResultsStats() {
  const stats = simulation ? simulation.getRunStats() : {};
  return {
    finalScore: stats.score || 0,
    bestTrick: stats.bestTrick
      ? String(stats.bestTrick).replaceAll('-', ' ').toUpperCase() + ' +' + (stats.bestTrickPoints || 0)
      : '—',
    highestAir: stats.highestAir || 0,
    longestCombo: integrationStats.longestCombo || stats.bestCombo || 1,
    tricksLanded: stats.tricksLanded || 0,
    perfectLandings: stats.perfectLandings || 0,
    crashes: stats.crashes || 0,
    pumpAccuracy: stats.pumpAccuracy || 0,
  };
}

function updatePlayerHUD(state) {
  hud.setScore(state.score || 0);
  hud.setTime(formatSessionTime(session.remaining));
  hud.setCombo(state.comboMultiplier || 1);
  if (hud.debugMode) hud.setDebugText(formatTelemetry(state));
}

function routeGameplayEvents(events, state, presentationState) {
  for (const rawEvent of events) {
    const event = { ...rawEvent, worldPosition: rider?.root?.position?.clone?.() };
    if (
      String(event.type || '').toUpperCase() === 'TRICK_COMPLETED'
      && String(event.trick || '').toLowerCase() === 'hand-plant'
      && presentationState?.copingWorldPoint
    ) event.handContactPosition = presentationState.copingWorldPoint;

    const type = String(event.type || '').toUpperCase();
    const vfxResult = vfx.handleEvent(event) || {};
    if (vfxResult.cameraImpact) cameraController.addImpact(vfxResult.cameraImpact);
    audio.handleEvent(event);

    if (type === 'PUMP_RATING') {
      const rating = String(event.rating || '').toUpperCase();
      if (rating === 'PERFECT' || rating === 'GOOD') {
        hud.showActionFeedback(rating, { text: rating + ' PUMP', duration: 650 });
      }
    } else if (type === 'TRICK_STARTED') {
      hud.showActionFeedback('trick', {
        text: String(event.trick || 'TRICK').replaceAll('-', ' ').toUpperCase(),
        duration: 650,
      });
    } else if (type === 'TRICK_COMPLETED') {
      hud.showTrick(event.trick || 'TRICK', event.points || 0);
      hud.setCombo(event.comboMultiplier || state.comboMultiplier || 1);
    } else if (type === 'TRICK_FAILED') {
      hud.showActionFeedback(event.reason || 'MISSED', {
        text: String(event.reason || 'MISSED').replaceAll('_', ' '),
        duration: 900,
      });
    } else if (type === 'LANDING') {
      hud.showLanding(event.quality || 'CLEAN', { multiplier: event.scoreMultiplier });
    } else if (type === 'BAIL') {
      hud.showActionFeedback('bail', { text: 'BAIL', duration: 1100 });
    } else if (type === 'COMBO_CHANGED') {
      integrationStats.longestCombo = Math.max(
        integrationStats.longestCombo,
        Number(event.count) || 0,
      );
      hud.setCombo(event.multiplier || 1);
    }
  }
}

function resetSimulation({ keepFlow = false } = {}) {
  if (!simulation) return null;
  const state = simulation.reset();
  session.reset();
  simulationRunning = false;
  lastWheelDistance = state.signedDistanceTravelled;
  lastFrameTime = null;
  applySimulationState(state, { rotateWheels: false, presentationDt: 0 });
  cameraController.resetDynamic();
  hud.clearFeedback();
  updatePlayerHUD(state);
  audio.resetSessionAudioState();
  integrationStats.longestCombo = 0;
  if (!keepFlow) gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE);
  return state;
}

function finishSession(state) {
  simulationRunning = false;
  simulation.setPumpIntent(0);
  simulation.setTurnIntent(0);
  simulation.setHandPlantHeld(false);
  if (session.phase !== 'finished') session.finish();
  updatePlayerHUD(state);
  audio.handleEvent({ type: 'SESSION_FINISHED', score: state.score || 0 });
  gameFlow.transitionTo(HALFPIPE_FLOW_STATE.RESULTS);
}

function setSimulationRunning(nextRunning) {
  if (!simulation) return false;
  if (nextRunning) {
    if (session.phase === 'paused') session.resume();
    else if (session.phase === 'ready' || session.phase === 'countdown') session.start();
    simulationRunning = true;
    gameFlow.state = HALFPIPE_FLOW_STATE.RUN;
    syncFlowUI({ state: HALFPIPE_FLOW_STATE.RUN });
  } else {
    if (session.phase === 'running') session.pause();
    simulationRunning = false;
  }
  lastFrameTime = null;
  return simulationRunning;
}

function routeControllerUI(actions) {
  if (!graphicsScreen.root.hidden) {
    if (actions.cancel) closeGraphicsMenu();
    else if (actions.left) cycleGraphicsPreset(-1);
    else if (actions.right || actions.confirm) cycleGraphicsPreset(1);
    return Boolean(actions.cancel || actions.left || actions.right || actions.confirm);
  }
  if (!audioScreen.root.hidden) {
    if (actions.cancel) closeAudioMenu();
    else if (actions.left || actions.down) setAudioVolume(currentAudioVolume - 0.1);
    else if (actions.right || actions.up) setAudioVolume(currentAudioVolume + 0.1);
    return Boolean(actions.cancel || actions.left || actions.down || actions.right || actions.up);
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.PAUSE) {
    return pauseMenu.handleControllerActions(actions);
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.RESULTS) {
    return resultsScreen.handleControllerActions(actions);
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.CONTROLS) {
    return controlsScreen.handleControllerActions(actions);
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.TITLE && actions.confirm) {
    beginCharacterSelect();
    return true;
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.CHARACTER_SELECT) {
    if (actions.confirm) {
      beginControlsFromCharacter();
      return true;
    }
    if (actions.cancel) {
      gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE);
      return true;
    }
  }
  return false;
}

function render(timestamp = 0) {
  if (disposed) return;
  const presentationDelta = lastFrameTime === null
    ? 0
    : Math.max(0, (timestamp - lastFrameTime) / 1000);
  const frameDelta = Math.min(0.1, presentationDelta);
  lastFrameTime = timestamp;

  if (simulation && pumpInput) {
    pumpInput.pollGamepad(null, frameDelta);
    controlsScreen.setControllerFamily(pumpInput.gamepadFamily);
    const gameplayActions = pumpInput.consumeActions();
    const uiActions = pumpInput.consumeUIActions();
    const uiConsumed = routeControllerUI(uiActions);

    if (!uiConsumed && gameplayActions.pause) {
      if (gameFlow.state === HALFPIPE_FLOW_STATE.RUN) pauseRun();
      else if (gameFlow.state === HALFPIPE_FLOW_STATE.PAUSE) resumeRun();
    }
    if (gameplayActions.reset && gameFlow.state === HALFPIPE_FLOW_STATE.RUN) pauseRun();
    if (gameFlow.state === HALFPIPE_FLOW_STATE.COUNTDOWN) countdown.step(presentationDelta);

    const isRunning = (
      simulationRunning
      && gameFlow.state === HALFPIPE_FLOW_STATE.RUN
      && session.phase === 'running'
      && !webglLost
    );
    const pumpIntent = pumpInput.keyboardIntent || pumpInput.gamepadIntent || 0;
    const turnIntent = pumpInput.keyboardTurnIntent || pumpInput.gamepadTurnIntent || 0;
    simulation.setPumpIntent(isRunning ? pumpIntent : 0);
    simulation.setTurnIntent(isRunning ? turnIntent : 0);
    simulation.setHandPlantHeld(isRunning && Boolean(pumpInput.handPlantHeld));

    if (isRunning) {
      const result = simulation.advance(frameDelta);
      const presentationDt = result.steps * simulation.fixedDt;
      session.step(presentationDelta);
      if (result.steps > 0) {
        session.setScore(result.state.score || 0);
        const presentationState = applySimulationState(result.state, { presentationDt });
        const gameplayEvents = simulation.drainEvents();
        routeGameplayEvents(gameplayEvents, result.state, presentationState);
        updatePlayerHUD(result.state);
        vfx.update(presentationDt, {
          position: rider.root.position,
          verticalVelocity: presentationState?.verticalVelocity || 0,
          height: presentationState?.airHeight || 0,
          airborne: Boolean(presentationState?.airborne),
        });
        audio.update({ ...result.state, sessionRemaining: session.remaining }, presentationDt);
      } else {
        const gameplayEvents = simulation.drainEvents();
        routeGameplayEvents(gameplayEvents, result.state, lastPresentationState);
        vfx.update(frameDelta, {
          position: rider.root.position,
          verticalVelocity: lastPresentationState?.verticalVelocity || 0,
          height: lastPresentationState?.airHeight || 0,
          airborne: Boolean(lastPresentationState?.airborne),
        });
      }
      if (session.phase === 'finished') finishSession(result.state);
    } else {
      const idleState = simulation.snapshot();
      const gameplayEvents = simulation.drainEvents();
      routeGameplayEvents(gameplayEvents, idleState, lastPresentationState);
      vfx.update(frameDelta, {
        position: rider.root.position,
        verticalVelocity: lastPresentationState?.verticalVelocity || 0,
        height: lastPresentationState?.airHeight || 0,
        airborne: Boolean(lastPresentationState?.airborne),
      });
      audio.update({ ...idleState, sessionRemaining: session.remaining }, frameDelta);
    }

    if (hud.debugMode && timestamp - lastTelemetryTime >= 100) {
      hud.setDebugText(formatTelemetry(simulation.snapshot()));
      lastTelemetryTime = timestamp;
    }
  }

  if (!webglLost) renderer.render(scene, cameraController.camera);
  animationFrame = requestAnimationFrame(render);
}

function onKeyDown(event) {
  if (event.repeat) return;
  void unlockAudioFromGesture();
  if (event.defaultPrevented) return;

  if (event.code === 'F3') {
    profileDebug.toggle();
    return;
  }
  if (hud.debugMode && (event.code === 'BracketLeft' || event.code === 'Comma')) {
    simulationRunning = false;
    presentationDebug?.previous();
    return;
  }
  if (hud.debugMode && (event.code === 'BracketRight' || event.code === 'Period')) {
    simulationRunning = false;
    presentationDebug?.next();
    return;
  }

  if (!graphicsScreen.root.hidden) {
    if (event.code === 'Escape') closeGraphicsMenu();
    else if (event.code === 'ArrowLeft') cycleGraphicsPreset(-1);
    else if (event.code === 'ArrowRight' || event.code === 'Enter') cycleGraphicsPreset(1);
    return;
  }
  if (!audioScreen.root.hidden) {
    if (event.code === 'Escape') closeAudioMenu();
    else if (event.code === 'ArrowLeft' || event.code === 'ArrowDown') setAudioVolume(currentAudioVolume - 0.1);
    else if (event.code === 'ArrowRight' || event.code === 'ArrowUp') setAudioVolume(currentAudioVolume + 0.1);
    else if (event.code === 'KeyM') audio.setMuted(!audio.muted);
    updateAudioMenuLabels();
    return;
  }

  if (gameFlow.state === HALFPIPE_FLOW_STATE.TITLE) {
    if (event.code === 'Enter' || event.code === 'Space') beginCharacterSelect();
    else if (event.code === 'KeyC') {
      controlsReturnState = HALFPIPE_FLOW_STATE.TITLE;
      controlsScreen.backButton.textContent = 'BACK';
      gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CONTROLS);
    }
    return;
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.CHARACTER_SELECT) {
    if (event.code === 'Enter' || event.code === 'Space') beginControlsFromCharacter();
    else if (event.code === 'Escape') gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE);
    return;
  }
  if (gameFlow.state === HALFPIPE_FLOW_STATE.RUN && (event.code === 'KeyP' || event.code === 'Escape')) {
    pauseRun();
  }
}

function wireMenuButtons() {
  titleScreen.buttons.get('start').addEventListener('click', beginCharacterSelect);
  titleScreen.buttons.get('controls').addEventListener('click', () => {
    void unlockAudioFromGesture();
    controlsReturnState = HALFPIPE_FLOW_STATE.TITLE;
    controlsScreen.backButton.textContent = 'BACK';
    gameFlow.transitionTo(HALFPIPE_FLOW_STATE.CONTROLS);
  });
  characterScreen.buttons.get('select').addEventListener('click', beginControlsFromCharacter);
  characterScreen.buttons.get('back').addEventListener(
    'click',
    () => gameFlow.transitionTo(HALFPIPE_FLOW_STATE.TITLE),
  );
  for (const name of GRAPHICS_NAMES) {
    graphicsScreen.buttons.get(name).addEventListener('click', () => setGraphicsPreset(name));
  }
  graphicsScreen.buttons.get('back').addEventListener('click', closeGraphicsMenu);
  audioScreen.buttons.get('down').addEventListener('click', () => setAudioVolume(currentAudioVolume - 0.1));
  audioScreen.buttons.get('up').addEventListener('click', () => setAudioVolume(currentAudioVolume + 0.1));
  audioScreen.buttons.get('mute').addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    updateAudioMenuLabels();
  });
  audioScreen.buttons.get('back').addEventListener('click', closeAudioMenu);
}

function onWebGLContextLost(event) {
  event.preventDefault();
  webglLost = true;
  simulationRunning = false;
  pumpInput?.clearHeldState();
  hud.setStatus('GRAPHICS CONTEXT LOST · RECOVERING', 'paused');
}

function recoverWebGL() {
  globalThis.location?.reload?.();
}

function onWebGLContextRestored() {
  recoverWebGL();
}

async function bootstrap() {
  resize();
  wireMenuButtons();

  const halfpipeAsset = new HalfpipeVisual(GAME_CONFIG.assets.halfpipe);
  const skateboardAsset = new SkateboardVisual(GAME_CONFIG.assets.skateboard);
  const chimpionAsset = new ChimpionLoader(GAME_CONFIG.assets.chimpion);

  [halfpipe] = await Promise.all([
    halfpipeAsset.load(),
    skateboardAsset.load(),
    chimpionAsset.load(),
    background.ready,
  ]);

  rider = new RiderController({ skateboard: skateboardAsset, chimpion: chimpionAsset });
  scene.add(halfpipe.root, rider.root);
  unregisterRiderQuality = quality.registerObject(rider.root);

  presentationBinder = new HalfpipePresentationBinder(profile, rider, {
    visualSurface: halfpipe,
    visualSeparation: 0.02,
  });
  presentationDebug = new HalfpipePresentationDebug(profile, presentationBinder, {
    onChange(station, index, count) {
      if (hud.debugMode) {
        hud.setDebugText('DEBUG ' + (index + 1) + '/' + count + ' ' + station.name);
      }
    },
  });
  scene.add(presentationDebug.root);

  simulation = new HalfpipeSimulation(profile);
  pumpInput = new HalfpipePumpInput(window, {
    onPauseRequest() {
      if (gameFlow.state === HALFPIPE_FLOW_STATE.RUN) pauseRun();
    },
  });
  resetSimulation({ keepFlow: true });

  loadingState.classList.add('is-hidden');
  stage.classList.add('is-ready');
  gameFlow.state = HALFPIPE_FLOW_STATE.TITLE;
  syncFlowUI({ state: HALFPIPE_FLOW_STATE.TITLE });
  updateGraphicsMenuSelection();
  updateAudioMenuLabels();

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', unlockAudioFromGesture, { passive: true });
  canvas.addEventListener('webglcontextlost', onWebGLContextLost, false);
  canvas.addEventListener('webglcontextrestored', onWebGLContextRestored, false);
  animationFrame = requestAnimationFrame(render);

  window.__HALFPIPE_FOUNDATION__ = {
    halfpipe,
    rider,
    profile,
    profileDebug,
    presentationBinder,
    presentationDebug,
    simulation,
    session,
    pumpInput,
    flow: gameFlow,
    hud,
    vfx,
    audio,
    graphics: {
      quality,
      get preset() { return currentGraphicsPreset; },
      setPreset: setGraphicsPreset,
    },
    physics: {
      get running() { return simulationRunning; },
      setRunning: setSimulationRunning,
      reset: resetSimulation,
      applyCurrentState() {
        return applySimulationState(simulation.snapshot(), {
          rotateWheels: false,
          presentationDt: 0,
        });
      },
    },
    camera: cameraController.camera,
    cameraController,
    background,
    ground,
    lighting,
    recoverWebGL,
  };
}

function dispose() {
  disposed = true;
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointerdown', unlockAudioFromGesture);
  canvas.removeEventListener('webglcontextlost', onWebGLContextLost, false);
  canvas.removeEventListener('webglcontextrestored', onWebGLContextRestored, false);
  unregisterRiderQuality?.();
  halfpipe?.dispose();
  rider?.dispose();
  profileDebug.dispose();
  presentationDebug?.dispose();
  ground.dispose();
  lighting.dispose();
  disposeEnvironment();
  background.dispose();
  pumpInput?.dispose();
  hud.dispose();
  controlsScreen.dispose();
  countdown.dispose();
  pauseMenu.dispose();
  resultsScreen.dispose();
  titleScreen.dispose();
  characterScreen.dispose();
  graphicsScreen.dispose();
  audioScreen.dispose();
  vfx.dispose();
  void audio.dispose();
  renderer.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });

bootstrap().catch((error) => {
  loadingState.textContent = 'FOUNDATION LOAD FAILED';
  loadingState.classList.add('is-error');
  console.error(error);
});
