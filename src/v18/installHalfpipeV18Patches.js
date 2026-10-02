import { HeroSelectScreen } from '../ui/HeroSelectScreen.js';
import { HalfpipeAudio } from '../audio/HalfpipeAudio.js';
import { HalfpipePumpInput } from '../input/HalfpipePumpInput.js';
import { quality } from '../graphics/RenderQualityManager.js';
import { MAP_IMAGES } from '../config/mapAssets.js';
import './v18.css';

const BASE_ENVIRONMENT = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/piazza_martin_lutero_1k.hdr';
const CYBER_ENVIRONMENT = '/hdri/shanghai_bund_1k.hdr';

export const HALFPIPE_MAPS = Object.freeze([
  Object.freeze({
    id: 'city',
    name: 'City',
    imageUrl: MAP_IMAGES.city,
    environmentUrl: BASE_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 0.96, saturation: 0.98, contrast: 0.98, gradeOpacity: 0.5 }),
  }),
  Object.freeze({
    id: 'tree-house',
    name: 'Tree House',
    imageUrl: MAP_IMAGES.treeHouse,
    environmentUrl: BASE_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 0.98, saturation: 1.0, contrast: 0.98, gradeOpacity: 0.38 }),
  }),
  Object.freeze({
    id: 'cyber-night',
    name: 'Cyber Night',
    imageUrl: MAP_IMAGES.cyberNight,
    environmentUrl: CYBER_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 0.94, saturation: 1.03, contrast: 1.01, gradeOpacity: 0.24 }),
  }),
  Object.freeze({
    id: 'the-gym', name: 'The Gym', kind: 'full',
    thumbnailUrl: MAP_IMAGES.theGymThumbnail,
    modelUrl: '/models/arenas/the-gym.glb',
    environmentUrl: BASE_ENVIRONMENT,
  }),
  Object.freeze({
    id: 'japan', name: 'Japan', kind: 'full',
    thumbnailUrl: MAP_IMAGES.japanThumbnail,
    modelUrl: '/models/arenas/japan.glb',
    environmentUrl: '/hdri/japan-sunset-1k.exr',
    environmentBackground: true,
    backgroundColor: 0xb9d6e9,
  }),
  Object.freeze({
    id: 'canyon-session', name: 'Canyon Session',
    imageUrl: MAP_IMAGES.canyonSession,
    thumbnailUrl: MAP_IMAGES.canyonSession,
    environmentUrl: BASE_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 1, saturation: 1, contrast: 1, gradeOpacity: 0.12 }),
  }),

  Object.freeze({
    id: 'skate-park', name: 'Skate Park',
    imageUrl: MAP_IMAGES.skatePark,
    environmentUrl: BASE_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 1, saturation: 1, contrast: 1, gradeOpacity: 0.12 }),
  }),
  Object.freeze({
    id: 'space', name: 'Space',
    imageUrl: MAP_IMAGES.space,
    environmentUrl: CYBER_ENVIRONMENT,
    position: 'center center',
    coherence: Object.freeze({ brightness: 1, saturation: 1, contrast: 1, gradeOpacity: 0.08 }),
  }),
]);

const STORAGE = Object.freeze({
  rider: 'chimpions-halfpipe.v18.rider-selection',
  board: 'chimpions-halfpipe.v18.board-selection',
  map: 'chimpions-halfpipe.v18.map-selection',
});

let installed = false;

const readStored = (key, fallback = 'random') => {
  try {
    const value = String(globalThis.localStorage?.getItem(key) || '').trim();
    return value || fallback;
  } catch {
    return fallback;
  }
};

const writeStored = (key, value) => {
  try { globalThis.localStorage?.setItem(key, String(value)); } catch {}
};

const randomItem = (entries = []) => {
  if (!entries.length) return null;
  return entries[Math.floor(Math.random() * entries.length)] || entries[0] || null;
};

function mapById(id) {
  return HALFPIPE_MAPS.find((map) => map.id === id) || HALFPIPE_MAPS[0];
}

function ensureState(screen) {
  if (screen.__v18SelectionState) return screen.__v18SelectionState;

  const storedHero = readStored(STORAGE.rider);
  const storedBoard = readStored(STORAGE.board);
  const previousMap = readStored(STORAGE.map);
  const storedMap = previousMap === 'storm-coast' ? 'canyon-session' : previousMap;
  if (storedMap !== previousMap) writeStored(STORAGE.map, storedMap);
  const heroIndex = screen.heroes.findIndex((hero) => hero.id === storedHero);
  const boardIndex = screen.boardColors.findIndex((entry) => entry.id === storedBoard);
  const mapIndex = HALFPIPE_MAPS.findIndex((entry) => entry.id === storedMap);

  screen.__v18SelectionState = {
    heroMode: heroIndex >= 0 ? 'explicit' : 'random',
    boardMode: boardIndex >= 0 ? 'explicit' : 'random',
    mapMode: mapIndex >= 0 ? 'explicit' : 'random',
    mapIndex: Math.max(0, mapIndex),
    resolvedHero: null,
    resolvedBoard: null,
    resolvedMap: null,
    applyingMap: false,
  };

  if (heroIndex >= 0) screen.selectedHeroIndex = heroIndex;
  if (boardIndex >= 0) screen.selectedBoardIndex = boardIndex;
  return screen.__v18SelectionState;
}

function currentMapOption(screen) {
  const state = ensureState(screen);
  if (state.mapMode === 'random') return null;
  return HALFPIPE_MAPS[state.mapIndex] || HALFPIPE_MAPS[0];
}

function setRandomHero(screen, { notify = false } = {}) {
  const state = ensureState(screen);
  state.heroMode = 'random';
  state.resolvedHero = null;
  writeStored(STORAGE.rider, 'random');
  screen.renderSelection();
  if (notify) screen.onHeroChange?.({ id: 'random', name: 'Random' });
}

function setRandomBoard(screen, { notify = false } = {}) {
  const state = ensureState(screen);
  state.boardMode = 'random';
  state.resolvedBoard = null;
  writeStored(STORAGE.board, 'random');
  screen.renderSelection();
  if (notify) screen.onBoardColorChange?.({ id: 'random', name: 'Random', color: null });
}

function selectMap(screen, optionIndex, { notify = true } = {}) {
  const state = ensureState(screen);
  const count = HALFPIPE_MAPS.length + 1;
  const normalized = ((optionIndex % count) + count) % count;
  state.resolvedMap = null;

  if (normalized === 0) {
    state.mapMode = 'random';
    writeStored(STORAGE.map, 'random');
  } else {
    state.mapMode = 'explicit';
    state.mapIndex = normalized - 1;
    writeStored(STORAGE.map, HALFPIPE_MAPS[state.mapIndex].id);
  }

  screen.renderSelection();
  if (notify) screen.onMapChange?.(currentMapOption(screen));
  return currentMapOption(screen);
}

function cycleBoard(screen, direction = 1) {
  const state = ensureState(screen);
  const optionCount = screen.boardColors.length + 1;
  const current = state.boardMode === 'random' ? 0 : screen.selectedBoardIndex + 1;
  const next = ((current + Math.sign(direction || 1)) % optionCount + optionCount) % optionCount;
  if (next === 0) {
    setRandomBoard(screen);
    return null;
  }
  return screen.selectBoardColor(next - 1);
}

function cycleMap(screen, direction = 1) {
  const state = ensureState(screen);
  const current = state.mapMode === 'random' ? 0 : state.mapIndex + 1;
  return selectMap(screen, current + Math.sign(direction || 1));
}

async function applyMapToRuntime(screen, map) {
  const foundation = globalThis.window?.__HALFPIPE_FOUNDATION__;
  if (!foundation || !map) return false;

  const state = ensureState(screen);
  if (state.applyingMap) return false;
  state.applyingMap = true;
  screen.setBusy(true, 'LOADING ' + map.name.toUpperCase() + '...');
  let loadError = '';

  try {
    await foundation.setArenaMap?.(map);
    if (map.kind !== 'full') {
      await foundation.background?.setImage?.(map.imageUrl, map.position);
    }
    foundation.background?.setCoherence?.(map.coherence);

    const environment = quality.environment;
    if (environment?.setUrl) {
      // Reflection loading is optional and must not hold arena confirmation.
      void environment.setUrl(map.environmentUrl).then(() => {
        quality.apply({ rebuildEnvironment: true });
        if (foundation.activeMap?.id === map.id && map.environmentBackground) {
          foundation.setEnvironmentBackground?.(environment.backgroundTexture);
        }
      }).catch(error => console.warn('[Halfpipe] Reflection load failed', error));
    }

    foundation.lighting?.setMapProfile?.(map.id);

    foundation.activeMap = map;
    foundation.customization ??= {};
    foundation.customization.maps = HALFPIPE_MAPS;
    foundation.customization.map = map;
    foundation.customization.selectedMapMode = ensureState(screen).mapMode;
    foundation.setMapPresentation?.(map.id);
    return true;
  } catch (error) {
    loadError = 'COULD NOT LOAD ' + map.name.toUpperCase() + '. PLEASE TRY AGAIN.';
    console.error('[Halfpipe V18] Map load failed', map.id, error);
    return false;
  } finally {
    state.applyingMap = false;
    screen.setBusy(false, loadError);
  }
}

function resolveRandomSelections(screen) {
  const state = ensureState(screen);
  state.resolvedHero = state.heroMode === 'random'
    ? randomItem(screen.heroes)
    : null;
  state.resolvedBoard = state.boardMode === 'random'
    ? randomItem(screen.boardColors)
    : null;
  state.resolvedMap = state.mapMode === 'random'
    ? randomItem(HALFPIPE_MAPS)
    : currentMapOption(screen);
  return state;
}

function createRandomHeroCard(screen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hero-card v18-random-hero';
  button.dataset.heroId = 'random';
  button.innerHTML = [
    '<span class="hero-card-image-wrap v18-random-art" aria-hidden="true">?</span>',
    '<span class="hero-card-copy"><strong>Random</strong><small>Random Chimpion</small></span>',
  ].join('');
  button.addEventListener('click', () => setRandomHero(screen));
  return button;
}

function createRandomBoardSwatch(screen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'board-swatch v18-random-swatch';
  button.dataset.boardColorId = 'random';
  button.title = 'Random';
  button.setAttribute('aria-label', 'Random skateboard');
  button.textContent = '?';
  button.addEventListener('click', () => setRandomBoard(screen));
  return button;
}

function ensureMapUI(screen) {
  if (screen.mapRoot?.isConnected) return;

  const section = document.createElement('div');
  section.className = 'map-customizer';
  section.innerHTML = [
    '<div class="map-customizer-heading">',
    '<div><p class="menu-eyebrow">03 · YOUR PARK</p><strong data-map-name>Random</strong></div>',
    '<small> Z / C · MAP &nbsp;|&nbsp; GAMEPAD Y · NEXT MAP </small>',
    '</div>',
    '<div class="map-grid" data-map-grid></div>',
  ].join('');

  screen.root.querySelector('.hero-select-body')?.append(section);
  screen.mapRoot = section.querySelector('[data-map-grid]');
  screen.mapName = section.querySelector('[data-map-name]');

  const random = document.createElement('button');
  random.type = 'button';
  random.className = 'map-card v18-random-map';
  random.dataset.mapId = 'random';
  random.innerHTML = '<span class="map-card-preview v18-random-art">?</span><strong>Random</strong>';
  random.addEventListener('click', () => selectMap(screen, 0));
  screen.mapRoot.append(random);

  HALFPIPE_MAPS.forEach((map, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-card';
    button.dataset.mapId = map.id;
    button.dataset.mapKind = map.kind || 'image';
    if (map.kind === 'full') button.title = 'Full 3D arena - no image backdrop';
    button.innerHTML = '<span class="map-card-preview"><img alt="" loading="eager" decoding="async" draggable="false"></span><strong></strong>';
    const image = button.querySelector('img');
    if (map.kind === 'full' && !map.thumbnailUrl) {
      image.remove();
      const preview = button.querySelector('.map-card-preview');
      preview.textContent = '3D';
      preview.classList.add('full-map-preview');
      button.title = 'Full 3D arena � no image backdrop';
    } else image.src = map.thumbnailUrl || map.imageUrl;
    image.alt = map.name;
    button.querySelector('strong').textContent = map.name;
    button.addEventListener('click', () => selectMap(screen, index + 1));
    screen.mapRoot.append(button);
  });
}

function patchHeroSelect() {
  const proto = HeroSelectScreen.prototype;
  if (proto.__halfpipeV18SelectionPatched) return;
  proto.__halfpipeV18SelectionPatched = true;

  const heroDescriptor = Object.getOwnPropertyDescriptor(proto, 'selectedHero');
  const boardDescriptor = Object.getOwnPropertyDescriptor(proto, 'selectedBoardColor');
  Object.defineProperty(proto, 'selectedHero', {
    configurable: true,
    get() {
      const state = ensureState(this);
      if (state.heroMode === 'random' && state.resolvedHero) return state.resolvedHero;
      return heroDescriptor.get.call(this);
    },
  });
  Object.defineProperty(proto, 'selectedBoardColor', {
    configurable: true,
    get() {
      const state = ensureState(this);
      if (state.boardMode === 'random' && state.resolvedBoard) return state.resolvedBoard;
      return boardDescriptor.get.call(this);
    },
  });

  const originalRender = proto.render;
  proto.render = function renderV18() {
    ensureState(this);
    originalRender.call(this);

    if (!this.heroRoot.querySelector('[data-hero-id="random"]')) {
      this.heroRoot.prepend(createRandomHeroCard(this));
    }
    if (!this.swatchRoot.querySelector('[data-board-color-id="random"]')) {
      this.swatchRoot.prepend(createRandomBoardSwatch(this));
    }
    ensureMapUI(this);
    this.renderSelection();
  };

  const originalRenderSelection = proto.renderSelection;
  proto.renderSelection = function renderSelectionV18() {
    const state = ensureState(this);
    originalRenderSelection.call(this);

    const randomHero = this.heroRoot?.querySelector?.('[data-hero-id="random"]');
    const randomBoard = this.swatchRoot?.querySelector?.('[data-board-color-id="random"]');

    if (state.heroMode === 'random') {
      for (const card of this.heroRoot?.querySelectorAll?.('.hero-card') || []) {
        card.classList.remove('is-selected');
        card.setAttribute('aria-pressed', 'false');
      }
      randomHero?.classList.add('is-selected');
      randomHero?.setAttribute('aria-pressed', 'true');
    }

    if (state.boardMode === 'random') {
      for (const swatch of this.swatchRoot?.querySelectorAll?.('.board-swatch') || []) {
        swatch.classList.remove('is-selected');
        swatch.setAttribute('aria-pressed', 'false');
      }
      randomBoard?.classList.add('is-selected');
      randomBoard?.setAttribute('aria-pressed', 'true');
      if (this.boardName) this.boardName.textContent = 'Random';
    }

    if (this.mapRoot) {
      const selectedMapId = state.mapMode === 'random'
        ? 'random'
        : (HALFPIPE_MAPS[state.mapIndex]?.id || 'city');
      for (const card of this.mapRoot.querySelectorAll('.map-card')) {
        const selected = card.dataset.mapId === selectedMapId;
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));
      }
      if (this.mapName) {
        this.mapName.textContent = state.mapMode === 'random'
          ? 'Random'
          : (HALFPIPE_MAPS[state.mapIndex]?.name || 'City');
      }
    }

    const heroLabel = state.heroMode === 'random'
      ? 'RANDOM RIDER'
      : (heroDescriptor.get.call(this)?.name || 'RIDER').toUpperCase();
    const mapLabel = state.mapMode === 'random'
      ? 'RANDOM MAP'
      : (HALFPIPE_MAPS[state.mapIndex]?.name || 'City').toUpperCase();
    if (this.confirmButton) {
      this.confirmButton.textContent = 'CONFIRM RIDER & PARK →';
      this.confirmButton.title = `${heroLabel} · ${mapLabel}`;
    }
  };

  const originalSelectHero = proto.selectHero;
  proto.selectHero = function selectHeroV18(index, options = {}) {
    const state = ensureState(this);
    const preserveRandom = options.notify === false && state.heroMode === 'random';
    const result = originalSelectHero.call(this, index, options);
    if (!preserveRandom) {
      state.heroMode = 'explicit';
      state.resolvedHero = null;
      const selectedHero = heroDescriptor.get.call(this);
      if (!selectedHero?.custom) writeStored(STORAGE.rider, selectedHero?.id || 'random');
      this.renderSelection();
    }
    return result;
  };

  const originalSelectBoard = proto.selectBoardColor;
  proto.selectBoardColor = function selectBoardColorV18(index, options = {}) {
    const state = ensureState(this);
    const preserveRandom = options.notify === false && state.boardMode === 'random';
    const result = originalSelectBoard.call(this, index, options);
    if (!preserveRandom) {
      state.boardMode = 'explicit';
      state.resolvedBoard = null;
      writeStored(STORAGE.board, boardDescriptor.get.call(this)?.id || 'random');
      this.renderSelection();
    }
    return result;
  };

  const originalShow = proto.show;
  proto.show = function showV18() {
    const state = ensureState(this);
    state.resolvedHero = null;
    state.resolvedBoard = null;
    state.resolvedMap = null;
    originalShow.call(this);
    ensureMapUI(this);
    const help = this.root?.querySelector?.('.hero-select-help');
    if (help) help.textContent = 'D-PAD / ARROWS · RIDER  |  Q / E OR X · BOARD  |  Z / C OR Y · MAP';
    this.renderSelection();
  };

  const originalKeyboard = proto.handleKeyboardEvent;
  proto.handleKeyboardEvent = function handleKeyboardEventV18(event) {
    if (this.root.hidden || this.busy) return false;
    if (event.code === 'KeyZ') {
      cycleMap(this, -1);
      event.preventDefault?.();
      return true;
    }
    if (event.code === 'KeyC') {
      cycleMap(this, 1);
      event.preventDefault?.();
      return true;
    }
    return originalKeyboard.call(this, event);
  };

  const originalController = proto.handleControllerActions;
  proto.handleControllerActions = function handleControllerActionsV18(actions = {}) {
    if (this.root.hidden || this.busy) return false;
    if (actions.boardNext) {
      cycleBoard(this, 1);
      return true;
    }
    if (actions.mapNext) {
      cycleMap(this, 1);
      return true;
    }
    return originalController.call(this, actions);
  };

  const originalConfirm = proto._confirm;
  proto._confirm = async function confirmV18() {
    if (this.busy || this._confirmationPending) return false;
    this._confirmationPending = true;
    try {
      const state = resolveRandomSelections(this);
      const map = state.resolvedMap || HALFPIPE_MAPS[0];
      if (!await applyMapToRuntime(this, map)) return false;
      return await originalConfirm.call(this);
    } finally {
      this._confirmationPending = false;
    }
  };
}

function patchGamepadSelectionButtons() {
  const proto = HalfpipePumpInput.prototype;
  if (proto.__halfpipeV18SelectionButtonsPatched) return;
  proto.__halfpipeV18SelectionButtonsPatched = true;

  const originalPoll = proto.pollGamepad;
  proto.pollGamepad = function pollGamepadV18(padsOverride = null, deltaSeconds = null) {
    const result = originalPoll.call(this, padsOverride, deltaSeconds);
    const pads = padsOverride || globalThis.navigator?.getGamepads?.() || [];
    const pad = this.activeGamepadIndex === null
      ? null
      : Array.from(pads).find((entry) => entry?.index === this.activeGamepadIndex) || pads[this.activeGamepadIndex];
    const xPressed = Boolean(pad?.buttons?.[2]?.pressed);
    const yPressed = Boolean(pad?.buttons?.[3]?.pressed);
    this.__v18SelectionButtons ||= { x: false, y: false };
    if (xPressed && !this.__v18SelectionButtons.x) this._queuedUiActions.boardNext = true;
    if (yPressed && !this.__v18SelectionButtons.y) this._queuedUiActions.mapNext = true;
    this.__v18SelectionButtons.x = xPressed;
    this.__v18SelectionButtons.y = yPressed;
    return result;
  };
}

function patchRunMusicRestart() {
  const proto = HalfpipeAudio.prototype;
  if (proto.__halfpipeV18MusicRestartPatched) return;
  proto.__halfpipeV18MusicRestartPatched = true;
  const originalPlayMusic = proto.playMusic;
  proto.playMusic = function playMusicV18(name, options = {}) {
    if (name === 'gameplay') {
      return originalPlayMusic.call(this, name, {
        ...options,
        restart: true,
        fadeSeconds: Math.min(0.08, Number(options.fadeSeconds) || 0.08),
      });
    }
    return originalPlayMusic.call(this, name, options);
  };
}

export function installHalfpipeV18Patches() {
  if (installed) return false;
  installed = true;
  patchHeroSelect();
  patchGamepadSelectionButtons();
  patchRunMusicRestart();
  return true;
}
