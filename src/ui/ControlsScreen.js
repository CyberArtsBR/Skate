import { CONTROLLER_FAMILY, glyphFor } from './ControllerGlyphs.js';
import { publicAssetUrl } from '../config/publicAssetUrl.js';
import './controls-tutorial.css';

export class ControlsScreen {
  constructor(stage, {
    family = CONTROLLER_FAMILY.KEYBOARD,
    onBack = null,
    inputTarget = globalThis.window,
  } = {}) {
    this.family = family;
    this.onBack = onBack;
    this.inputTarget = inputTarget;

    const tutorialUrl = publicAssetUrl('images/tutorials/halfpipe-how-to-ride.jpg');

    this.root = document.createElement('section');
    this.root.className = 'game-ui-layer menu-screen controls-screen';
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'halfpipe-controls-heading');
    this.root.innerHTML = `
      <div class="menu-card controls-card">
        <header class="controls-tutorial-heading">
          <p class="menu-eyebrow">CHIMPIONS HALFPIPE</p>
          <h1 id="halfpipe-controls-heading">HOW TO PLAY</h1>
        </header>
        <div class="controls-tutorial-layout" data-tutorial-layout>
          <figure class="controls-tutorial-poster" data-tutorial-poster>
            <a href="${tutorialUrl}" target="_blank" rel="noopener"
              aria-label="Open the tutorial at full size">
            <img src="${tutorialUrl}"
              alt="Pump up while climbing, down while descending. Rotate with left or right, hold K at the coping for Hand Plant, or hold Space in the air for Backflip. A missed trick gives no points and loses 20 percent speed. Full controls are in the expandable guide below."
              decoding="async" fetchpriority="high" data-tutorial-image>
            </a>
            <figcaption>CLICK ART TO ENLARGE · CURRENT RULE: MISSED TRICK = NO POINTS + 20% SPEED LOSS. THE RUN CONTINUES.</figcaption>
          </figure>
          <details class="controls-reference" aria-labelledby="halfpipe-controls-reference">
            <summary class="controls-reference-heading">
              <h2 id="halfpipe-controls-reference">VIEW CONTROLS</h2>
              <span class="controls-input-family" data-input-family></span>
            </summary>
            <div class="controls-list" data-controls></div>
            <div class="controls-rhythm-note">
              <h3>FEEL THE RHYTHM</h3>
              <p data-pump-tip></p>
              <p>Steer near the coping or in the air. Combine aerial rotation and a backflip, then land the rotation to bank your points.</p>
            </div>
          </details>
        </div>
        <footer class="controls-tutorial-actions">
          <p data-action-hint></p>
          <button type="button" class="menu-button is-selected" data-back>BACK</button>
        </footer>
      </div>`;
    stage.append(this.root);
    this.list = this.root.querySelector('[data-controls]');
    this.inputFamily = this.root.querySelector('[data-input-family]');
    this.pumpTip = this.root.querySelector('[data-pump-tip]');
    this.actionHint = this.root.querySelector('[data-action-hint]');
    this.tutorialLayout = this.root.querySelector('[data-tutorial-layout]');
    this.tutorialPoster = this.root.querySelector('[data-tutorial-poster]');
    this.tutorialImage = this.root.querySelector('[data-tutorial-image]');
    this.tutorialImage.addEventListener('error', () => {
      this.tutorialPoster.hidden = true;
      this.tutorialLayout.classList.add('is-guide-only');
    });
    this.tutorialImage.addEventListener('load', () => {
      this.tutorialPoster.hidden = false;
      this.tutorialLayout.classList.remove('is-guide-only');
    });
    this.backButton = this.root.querySelector('[data-back]');
    this.backButton.addEventListener('click', () => this.onBack?.());

    this._onKeyDown = (event) => {
      if (this.root.hidden) return;
      if (event.code !== 'Escape' && event.target?.closest?.('summary, a')) return;
      if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'Space') {
        this.onBack?.();
        event.preventDefault();
      }
    };
    this.inputTarget?.addEventListener?.('keydown', this._onKeyDown);
    this.render();
  }

  setControllerFamily(family) {
    const nextFamily = family || CONTROLLER_FAMILY.KEYBOARD;
    if (nextFamily === this.family) return;
    this.family = nextFamily;
    this.render();
  }

  setOnBack(callback) {
    this.onBack = callback;
  }

  show() {
    this.render();
    this.root.hidden = false;
    this.backButton.focus({ preventScroll: true });
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
    const familyNames = {
      [CONTROLLER_FAMILY.KEYBOARD]: 'KEYBOARD',
      [CONTROLLER_FAMILY.XBOX]: 'XBOX',
      [CONTROLLER_FAMILY.PLAYSTATION]: 'PLAYSTATION',
      [CONTROLLER_FAMILY.GENERIC]: 'GAMEPAD',
    };
    this.inputFamily.textContent = familyNames[this.family] || 'GAMEPAD';
    this.pumpTip.textContent = glyphFor('pumpUp', this.family) + ' while climbing. '
      + glyphFor('pumpDown', this.family) + ' on the way down. If you slow to a stop, hold '
      + glyphFor('pumpDown', this.family) + ' to get moving again.';
    this.actionHint.textContent = this.family === CONTROLLER_FAMILY.KEYBOARD
      ? 'ENTER / SPACE · CONTINUE'
      : glyphFor('confirm', this.family) + ' · CONTINUE';
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
