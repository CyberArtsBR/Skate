import { CONTROLLER_FAMILY, glyphFor } from './ControllerGlyphs.js';

export class ControlsScreen {
  constructor(stage, {
    family = CONTROLLER_FAMILY.KEYBOARD,
    onBack = null,
    inputTarget = globalThis.window,
  } = {}) {
    this.family = family;
    this.onBack = onBack;
    this.inputTarget = inputTarget;

    this.root = document.createElement('section');
    this.root.className = 'game-ui-layer menu-screen controls-screen';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="menu-card controls-card"><p class="menu-eyebrow">HOW TO PLAY</p><h1>CONTROLS</h1><div class="controls-list" data-controls></div><button type="button" class="menu-button is-selected" data-back>BACK</button></div>';
    stage.append(this.root);
    this.list = this.root.querySelector('[data-controls]');
    this.backButton = this.root.querySelector('[data-back]');
    this.backButton.addEventListener('click', () => this.onBack?.());

    this._onKeyDown = (event) => {
      if (this.root.hidden) return;
      if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'Space') {
        this.onBack?.();
        event.preventDefault();
      }
    };
    this.inputTarget?.addEventListener?.('keydown', this._onKeyDown);
    this.render();
  }

  setControllerFamily(family) {
    this.family = family || CONTROLLER_FAMILY.KEYBOARD;
    this.render();
  }

  setOnBack(callback) {
    this.onBack = callback;
  }

  show() {
    this.render();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  handleControllerActions(actions = {}) {
    if (this.root.hidden) return false;
    if (actions.confirm || actions.cancel || actions.pause) {
      this.onBack?.();
      return true;
    }
    return false;
  }

  render() {
    const rows = [
      [glyphFor('pumpUp', this.family) + ' / ' + glyphFor('pumpDown', this.family), 'PUMP / CONTROL SPEED'],
      [glyphFor('turnLeft', this.family) + ' / ' + glyphFor('turnRight', this.family), 'STEER ROTATION · REVERSE / CORRECT IN AIR'],
      [glyphFor('backflip', this.family), 'HOLD AFTER TAKEOFF · BACKFLIP / DOUBLE'],
      [glyphFor('handPlant', this.family), 'HAND PLANT AT COPING · EITHER WALL'],
      [glyphFor('pause', this.family), 'PAUSE'],
    ];
    this.list.innerHTML = rows.map(([glyph, label]) => (
      '<div class="control-row"><kbd>' + escapeText(glyph) + '</kbd><span>' + label + '</span></div>'
    )).join('');
  }

  dispose() {
    this.inputTarget?.removeEventListener?.('keydown', this._onKeyDown);
    this.root.remove();
  }
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
