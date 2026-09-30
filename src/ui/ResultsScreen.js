const STAT_ROWS = Object.freeze([
  ['finalScore', 'FINAL SCORE'],
  ['bestTrick', 'BEST TRICK'],
  ['highestAir', 'HIGHEST AIR'],
  ['longestCombo', 'LONGEST COMBO'],
  ['tricksLanded', 'TRICKS LANDED'],
  ['perfectLandings', 'PERFECT LANDINGS'],
  ['crashes', 'CRASHES'],
  ['pumpAccuracy', 'PUMP ACCURACY'],
]);

export function normalizeResultsStats(stats = {}) {
  return {
    finalScore: Math.max(0, Math.round(Number(stats.finalScore ?? stats.score) || 0)),
    bestTrick: String(stats.bestTrick || '—'),
    highestAir: formatMeasure(stats.highestAir, 'm'),
    longestCombo: formatComboCount(stats.longestCombo),
    tricksLanded: Math.max(0, Math.round(Number(stats.tricksLanded) || 0)),
    perfectLandings: Math.max(0, Math.round(Number(stats.perfectLandings) || 0)),
    crashes: Math.max(0, Math.round(Number(stats.crashes) || 0)),
    pumpAccuracy: formatPercent(stats.pumpAccuracy),
  };
}

export class ResultsScreen {
  constructor(stage, {
    onRetry = null,
    onChangeRider = null,
    onMainMenu = null,
    inputTarget = globalThis.window,
  } = {}) {
    this.callbacks = { onRetry, onChangeRider, onMainMenu };
    this.inputTarget = inputTarget;
    this.selectedIndex = 0;

    this.root = document.createElement('section');
    this.root.className = 'game-ui-layer menu-screen results-screen';
    this.root.hidden = true;
    this.root.innerHTML = [
      '<div class="menu-card results-card">',
      '<p class="menu-eyebrow">RUN COMPLETE</p>',
      '<h1>RESULTS</h1>',
      '<div class="results-grid" data-results-grid></div>',
      '<div class="menu-actions" data-actions></div>',
      '</div>',
    ].join('');
    stage.append(this.root);

    this.grid = this.root.querySelector('[data-results-grid]');
    this.actionsRoot = this.root.querySelector('[data-actions]');
    this.actions = [
      { id: 'retry', label: 'RETRY', callback: () => this.callbacks.onRetry?.() },
      { id: 'changeRider', label: 'CHANGE RIDER', callback: () => this.callbacks.onChangeRider?.() },
      { id: 'mainMenu', label: 'MAIN MENU', callback: () => this.callbacks.onMainMenu?.() },
    ];

    this._onKeyDown = (event) => {
      if (this.root.hidden) return;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        this.moveSelection(-1);
        event.preventDefault();
      } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        this.moveSelection(1);
        event.preventDefault();
      } else if (event.code === 'Enter' || event.code === 'Space') {
        this.activateSelection();
        event.preventDefault();
      } else if (event.code === 'Escape') {
        this.callbacks.onMainMenu?.();
        event.preventDefault();
      }
    };
    this.inputTarget?.addEventListener?.('keydown', this._onKeyDown);
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this._renderActions();
  }

  show(stats = {}) {
    const normalized = normalizeResultsStats(stats);
    this.root.classList.toggle('is-game-over', Boolean(stats.severeCrash));
    this.root.querySelector('.menu-eyebrow').textContent = stats.severeCrash ? 'HEAD FIRST · RUN OVER' : 'RUN COMPLETE';
    this.root.querySelector('h1').textContent = stats.severeCrash ? 'GAME OVER' : 'RESULTS';
    this.grid.innerHTML = STAT_ROWS.map(([key, label]) => (
      '<div class="result-stat" data-stat="' + key + '"><span>' + label + '</span><strong>'
      + escapeText(key === 'finalScore' ? normalized[key].toLocaleString('en-US') : normalized[key]) + '</strong></div>'
    )).join('');
    this.root.hidden = false;
    this.selectedIndex = 0;
    this._renderActions();
    return normalized;
  }

  hide() {
    this.root.hidden = true;
  }

  moveSelection(direction) {
    const enabled = this._enabledActions();
    if (!enabled.length) return;
    const current = enabled.findIndex(({ index }) => index === this.selectedIndex);
    const next = (Math.max(0, current) + Math.sign(direction) + enabled.length) % enabled.length;
    this.selectedIndex = enabled[next].index;
    this._syncSelection();
  }

  activateSelection() {
    const action = this.actions[this.selectedIndex];
    if (!action || !this._isEnabled(action)) return false;
    action.callback();
    return true;
  }

  handleControllerActions(actions = {}) {
    if (this.root.hidden) return false;
    if (actions.up) this.moveSelection(-1);
    if (actions.down) this.moveSelection(1);
    if (actions.confirm) return this.activateSelection();
    if (actions.cancel) {
      this.callbacks.onMainMenu?.();
      return true;
    }
    return false;
  }

  dispose() {
    this.inputTarget?.removeEventListener?.('keydown', this._onKeyDown);
    this.root.remove();
  }

  _isEnabled(action) {
    if (action.id === 'changeRider') return typeof this.callbacks.onChangeRider === 'function';
    return typeof action.callback === 'function';
  }

  _enabledActions() {
    return this.actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => this._isEnabled(action));
  }

  _renderActions() {
    this.actionsRoot.innerHTML = '';
    this.actions.forEach((action, index) => {
      if (action.id === 'changeRider' && !this._isEnabled(action)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-button';
      button.textContent = action.label;
      button.dataset.action = action.id;
      button.addEventListener('click', () => {
        this.selectedIndex = index;
        this.activateSelection();
      });
      this.actionsRoot.append(button);
    });
    if (!this._isEnabled(this.actions[this.selectedIndex])) {
      this.selectedIndex = this._enabledActions()[0]?.index ?? 0;
    }
    this._syncSelection();
  }

  _syncSelection() {
    for (const button of this.actionsRoot.querySelectorAll('[data-action]')) {
      const index = this.actions.findIndex((action) => action.id === button.dataset.action);
      button.classList.toggle('is-selected', index === this.selectedIndex);
      button.setAttribute('aria-selected', String(index === this.selectedIndex));
    }
  }
}

function formatMeasure(value, suffix) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) + suffix : '—';
}

function formatComboCount(value) {
  const number = Math.max(0, Math.round(Number(value) || 0));
  return number + (number === 1 ? ' TRICK' : ' TRICKS');
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const percent = number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, percent)).toFixed(0) + '%';
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
