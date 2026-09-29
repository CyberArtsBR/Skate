export class PauseMenu {
  constructor(stage, {
    onResume = null,
    onRestart = null,
    onControls = null,
    onGraphics = null,
    onAudio = null,
    onMainMenu = null,
    inputTarget = globalThis.window,
  } = {}) {
    this.callbacks = {
      onResume,
      onRestart,
      onControls,
      onGraphics,
      onAudio,
      onMainMenu,
    };
    this.inputTarget = inputTarget;
    this.selectedIndex = 0;
    this.items = [
      ['resume', 'RESUME', 'onResume'],
      ['restart', 'RESTART RUN', 'onRestart'],
      ['controls', 'CONTROLS', 'onControls'],
      ['graphics', 'GRAPHICS', 'onGraphics'],
      ['audio', 'AUDIO', 'onAudio'],
      ['mainMenu', 'MAIN MENU', 'onMainMenu'],
    ];

    this.root = document.createElement('section');
    this.root.className = 'game-ui-layer menu-screen pause-menu';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="menu-card"><p class="menu-eyebrow">HALF-PIPE</p><h1>PAUSED</h1><div class="menu-actions" data-actions></div></div>';
    stage.append(this.root);
    this.actionsRoot = this.root.querySelector('[data-actions]');

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
      } else if (event.code === 'Escape' || event.code === 'KeyP') {
        this.callbacks.onResume?.();
        event.preventDefault();
      }
    };
    this.inputTarget?.addEventListener?.('keydown', this._onKeyDown);
    this._render();
  }

  setCallbacks(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this._render();
  }

  show() {
    this.root.hidden = false;
    this.selectedIndex = this._enabledItems()[0]?.index ?? 0;
    this._syncSelection();
  }

  hide() {
    this.root.hidden = true;
  }

  moveSelection(direction) {
    const enabled = this._enabledItems();
    if (!enabled.length) return;
    const current = enabled.findIndex(({ index }) => index === this.selectedIndex);
    const next = (Math.max(0, current) + Math.sign(direction) + enabled.length) % enabled.length;
    this.selectedIndex = enabled[next].index;
    this._syncSelection();
  }

  activateSelection() {
    const item = this.items[this.selectedIndex];
    if (!item) return false;
    const callback = this.callbacks[item[2]];
    if (typeof callback !== 'function') return false;
    callback();
    return true;
  }

  handleControllerActions(actions = {}) {
    if (this.root.hidden) return false;
    if (actions.up) this.moveSelection(-1);
    if (actions.down) this.moveSelection(1);
    if (actions.confirm) return this.activateSelection();
    if (actions.cancel || actions.pause) {
      this.callbacks.onResume?.();
      return true;
    }
    return false;
  }

  dispose() {
    this.inputTarget?.removeEventListener?.('keydown', this._onKeyDown);
    this.root.remove();
  }

  _enabledItems() {
    return this.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => typeof this.callbacks[item[2]] === 'function');
  }

  _render() {
    this.actionsRoot.innerHTML = '';
    this.items.forEach((item, index) => {
      const callback = this.callbacks[item[2]];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-button';
      button.textContent = item[1];
      button.dataset.action = item[0];
      button.disabled = typeof callback !== 'function';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        this.selectedIndex = index;
        this.activateSelection();
      });
      this.actionsRoot.append(button);
    });
    this._syncSelection();
  }

  _syncSelection() {
    for (const button of this.actionsRoot.querySelectorAll('[data-action]')) {
      const index = this.items.findIndex((item) => item[0] === button.dataset.action);
      button.classList.toggle('is-selected', index === this.selectedIndex && !button.disabled);
    }
  }
}
