import { HeroSelectScreen } from '../ui/HeroSelectScreen.js';
import { TrickPoseController } from '../character/TrickPoseController.js';
import { SkatePoseController } from '../character/SkatePoseController.js';
import { TITLE_SCREEN_DATA_URL } from './titleImageData.js';
import './v16.css';

let installed = false;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function resolveGridColumns(screen) {
  const fallback = Math.max(1, Math.min(5, screen.heroes?.length || 1));
  try {
    const template = globalThis.getComputedStyle?.(screen.heroRoot)?.gridTemplateColumns || '';
    const count = template.trim().split(/\s+/).filter(Boolean).length;
    return count > 0 ? count : fallback;
  } catch {
    return fallback;
  }
}

function moveHeroGrid(screen, deltaX, deltaY) {
  const count = screen.heroes?.length || 0;
  if (!count) return null;
  const columns = resolveGridColumns(screen);
  let next = screen.selectedHeroIndex;

  if (deltaX) {
    next = (next + Math.sign(deltaX) + count) % count;
  } else if (deltaY) {
    const column = next % columns;
    const rows = Math.ceil(count / columns);
    const row = Math.floor(next / columns);
    let targetRow = (row + Math.sign(deltaY) + rows) % rows;
    next = targetRow * columns + column;
    if (next >= count) {
      targetRow = Math.max(0, targetRow - 1);
      next = Math.min(count - 1, targetRow * columns + column);
    }
  }

  return screen.selectHero(next);
}

function patchHeroSelect() {
  const proto = HeroSelectScreen.prototype;
  if (proto.__halfpipeV16GridPatched) return;
  proto.__halfpipeV16GridPatched = true;

  const originalShow = proto.show;
  proto.show = function showV16HeroSelect() {
    originalShow.call(this);
    const help = this.root?.querySelector?.('.hero-select-help');
    if (help) {
      help.textContent = 'D-PAD / STICK / ARROWS · RIDER  ·  CLICK SWATCH · BOARD COLOR';
    }
  };

  proto.moveHeroGrid = function moveHeroGridV16(deltaX = 0, deltaY = 0) {
    return moveHeroGrid(this, deltaX, deltaY);
  };

  proto.handleKeyboardEvent = function handleKeyboardEventV16(event) {
    if (this.root.hidden || this.busy) return false;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      this.moveHeroGrid(-1, 0);
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      this.moveHeroGrid(1, 0);
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      this.moveHeroGrid(0, -1);
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      this.moveHeroGrid(0, 1);
    } else if (event.code === 'KeyQ' || event.code === 'BracketLeft') {
      this.selectBoardColor(this.selectedBoardIndex - 1);
    } else if (event.code === 'KeyE' || event.code === 'BracketRight') {
      this.selectBoardColor(this.selectedBoardIndex + 1);
    } else if (event.code === 'Enter' || event.code === 'Space') {
      this._confirm();
    } else if (event.code === 'Escape' || event.code === 'Backspace') {
      this.onBack?.();
    } else {
      return false;
    }
    event.preventDefault?.();
    return true;
  };

  proto.handleControllerActions = function handleControllerActionsV16(actions = {}) {
    if (this.root.hidden || this.busy) return false;
    if (actions.left) this.moveHeroGrid(-1, 0);
    else if (actions.right) this.moveHeroGrid(1, 0);
    else if (actions.up) this.moveHeroGrid(0, -1);
    else if (actions.down) this.moveHeroGrid(0, 1);
    else if (actions.confirm) this._confirm();
    else if (actions.cancel) this.onBack?.();
    else return false;
    return true;
  };
}

function patchBackflipPresentation() {
  const trickProto = TrickPoseController.prototype;
  if (!trickProto.__halfpipeV16BackflipPatched) {
    trickProto.__halfpipeV16BackflipPatched = true;
    const originalEvaluate = trickProto.evaluate;
    trickProto.evaluate = function evaluateV16TrickPose(state = {}) {
      const output = originalEvaluate.call(this, state);
      if (!(state.airborne && state.trickType === 'backflip')) return output;

      const progress = clamp01(state.trickProgress);
      const tuck = smoothstep(progress / 0.22)
        * (1 - smoothstep((progress - 0.72) / 0.28));
      const open = smoothstep((progress - 0.68) / 0.32);
      const direction = Math.sign(Number(state.trickRoll) || Number(state.wallSide) || 1) || 1;
      const envelope = Math.sin(Math.PI * progress);

      // Keep the rider compact around the board through the inverted phase.
      // The old negative local-Y offset inverted with the trick carrier and
      // pushed the body away from the deck at ~180 degrees.
      output.bodyY = 0.035 + 0.085 * tuck - 0.025 * open;
      output.bodyX = -(Math.sign(Number(state.wallSide) || 0) || 1)
        * (0.012 * envelope + 0.01 * tuck);
      output.bodyRoll = direction * (0.035 * envelope + 0.035 * tuck);
      output.bodyYaw = (Number(state.secondaryLag) || 0) * 0.06;
      output.boardRoll += -direction * (0.018 * envelope + 0.022 * tuck);
      return output;
    };
  }

  const skateProto = SkatePoseController.prototype;
  if (!skateProto.__halfpipeV16BackflipPatched) {
    skateProto.__halfpipeV16BackflipPatched = true;
    const originalEvaluate = skateProto.evaluate;
    skateProto.evaluate = function evaluateV16SkatePose(state = {}) {
      const pose = originalEvaluate.call(this, state);
      if (!(state.airborne && state.trickType === 'backflip')) return pose;

      const progress = clamp01(state.trickProgress);
      const tuck = smoothstep(progress / 0.22)
        * (1 - smoothstep((progress - 0.72) / 0.28));
      const open = smoothstep((progress - 0.68) / 0.32);

      // Compact knees/hips and bring the arms close to the torso. The board
      // remains the visual anchor while the rider opens before touchdown.
      pose.compression = Math.max(pose.compression, 0.68 + tuck * 0.26 - open * 0.2);
      pose.hipFlex = 0.28 + tuck * 0.24 - open * 0.1;
      pose.kneeFlex = Math.min(1.18, 0.72 + tuck * 0.38 - open * 0.18);
      pose.ankleFlex = -0.11 + open * 0.025;
      pose.torsoCounter = 0.08 + tuck * 0.07;
      pose.leftArmBalance = 0.43 - tuck * 0.12 + open * 0.12;
      pose.rightArmBalance = pose.leftArmBalance;
      pose.armBalance = pose.leftArmBalance;
      pose.forearmDrop = 0.2 + tuck * 0.22 - open * 0.1;
      pose.leftForearmDrop = pose.forearmDrop;
      pose.rightForearmDrop = pose.forearmDrop;
      pose.headLook = 0.16 + open * 0.42;
      return pose;
    };
  }
}

function decorateTitleScreen() {
  const root = globalThis.document?.querySelector?.('.title-screen');
  if (!root || root.dataset.v16TitleReady === '1') return Boolean(root);

  root.dataset.v16TitleReady = '1';
  root.classList.add('v16-art-title');

  const art = document.createElement('img');
  art.className = 'v16-title-art';
  art.src = TITLE_SCREEN_DATA_URL;
  art.alt = 'Chimpions Half Pipe';
  art.draggable = false;
  root.prepend(art);

  const start = root.querySelector('[data-action="start"]');
  if (start) {
    start.setAttribute('aria-label', 'Start Game');
    start.title = 'Start Game';
  }
  return true;
}

function installTitleDecorator() {
  if (decorateTitleScreen()) return;
  if (!globalThis.MutationObserver || !globalThis.document?.documentElement) return;
  const observer = new MutationObserver(() => {
    if (decorateTitleScreen()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function installHalfpipeV16Patches() {
  if (installed) return false;
  installed = true;
  patchHeroSelect();
  patchBackflipPresentation();
  installTitleDecorator();
  return true;
}
