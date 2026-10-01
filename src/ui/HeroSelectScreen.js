import { loadCustomAvatar, releaseCustomAvatar } from '../character/CustomAvatar.js';

export class HeroSelectScreen {
  constructor(stage, {
    heroes = [],
    boardColors = [],
    selectedHeroId = null,
    selectedBoardColorId = null,
    onHeroChange = null,
    onBoardColorChange = null,
    onConfirm = null,
    onBack = null,
  } = {}) {
    this.heroes = [...heroes];
    this.boardColors = boardColors;
    this.onHeroChange = onHeroChange;
    this.onBoardColorChange = onBoardColorChange;
    this.onConfirm = onConfirm;
    this.onBack = onBack;
    this.selectedHeroIndex = Math.max(
      0,
      heroes.findIndex((hero) => hero.id === selectedHeroId),
    );
    this.selectedBoardIndex = Math.max(
      0,
      boardColors.findIndex((entry) => entry.id === selectedBoardColorId),
    );
    this.busy = false;

    this.root = document.createElement('section');
    this.root.className = 'game-ui-layer menu-screen hero-select-screen';
    this.root.hidden = true;
    this.root.innerHTML = [
      '<div class="hero-select-shell">',
      '<div class="hero-select-header">',
      '<p class="menu-eyebrow">YOUR NEXT SESSION</p>',
      '<h1>BUILD YOUR LINE</h1>',
      '<p class="hero-select-help">LEFT / RIGHT · RIDER &nbsp;&nbsp; UP / DOWN · BOARD COLOR</p>',
      '</div>',
      '<div class="hero-select-body">',
      '<div class="hero-roster-heading"><strong>01 · CHOOSE YOUR RIDER</strong>',
      '<button type="button" class="avatar-upload-button" data-upload>↑ UPLOAD YOUR GLB</button>',
      '<input type="file" accept=".glb,model/gltf-binary" data-avatar-file hidden></div>',
      '<p class="avatar-upload-hint">Your avatar, your session · Rigged GLB with embedded textures · Stays on this device</p>',
      '<div class="hero-grid" data-heroes></div>',
      '<div class="board-customizer">',
      '<div><p class="menu-eyebrow">02 · BOARD FINISH</p><strong data-board-name></strong></div>',
      '<div class="board-swatches" data-board-swatches></div>',
      '</div>',
      '</div>',
      '<div class="hero-select-footer">',
      '<button type="button" class="menu-button" data-back>BACK</button>',
      '<button type="button" class="menu-button hero-confirm" data-confirm>CONTINUE</button>',
      '</div>',
      '<p class="hero-load-state" data-status role="status" aria-live="polite"></p>',
      '</div>',
    ].join('');
    stage.append(this.root);

    this.heroRoot = this.root.querySelector('[data-heroes]');
    this.swatchRoot = this.root.querySelector('[data-board-swatches]');
    this.boardName = this.root.querySelector('[data-board-name]');
    this.status = this.root.querySelector('[data-status]');
    this.backButton = this.root.querySelector('[data-back]');
    this.confirmButton = this.root.querySelector('[data-confirm]');
    this.fileInput = this.root.querySelector('[data-avatar-file]');
    this.uploadButton = this.root.querySelector('[data-upload]');
    this.uploadButton.addEventListener('click', () => { if (!this.busy) this.fileInput.click(); });
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.importAvatar(file);
    });

    this.backButton.addEventListener('click', () => this.onBack?.());
    this.confirmButton.addEventListener('click', () => this._confirm());
    this.render();
  }

  get selectedHero() {
    return this.heroes[this.selectedHeroIndex] || null;
  }

  get selectedBoardColor() {
    return this.boardColors[this.selectedBoardIndex] || null;
  }

  setBusy(busy, message = '') {
    this.busy = Boolean(busy);
    this.confirmButton.disabled = this.busy;
    this.backButton.disabled = this.busy;
    this.uploadButton.disabled = this.busy;
    this.root.classList.toggle('is-busy', this.busy);
    this.status.textContent = message;
  }

  selectHero(index, { notify = true } = {}) {
    if (!this.heroes.length) return null;
    this.selectedHeroIndex = (
      index % this.heroes.length + this.heroes.length
    ) % this.heroes.length;
    this.renderSelection();
    if (notify) this.onHeroChange?.(this.selectedHero);
    return this.selectedHero;
  }

  selectBoardColor(index, { notify = true } = {}) {
    if (!this.boardColors.length) return null;
    this.selectedBoardIndex = (
      index % this.boardColors.length + this.boardColors.length
    ) % this.boardColors.length;
    this.renderSelection();
    if (notify) this.onBoardColorChange?.(this.selectedBoardColor);
    return this.selectedBoardColor;
  }

  _confirm() {
    if (this.busy) return false;
    return this.onConfirm?.({
      hero: this.selectedHero,
      boardColor: this.selectedBoardColor,
    }) ?? true;
  }

  async importAvatar(file) {
    if (this.busy) return;
    this.setBusy(true, 'LOADING YOUR AVATAR…');
    let message = '';
    try {
      const hero = await loadCustomAvatar(file);
      if (this.disposed) { releaseCustomAvatar(hero); return; }
      const previous = this.customAvatar;
      const index = this.heroes.findIndex(entry => entry.custom);
      if (index < 0) this.heroes.push(hero);
      else this.heroes[index] = hero;
      this.customAvatar = hero;
      releaseCustomAvatar(previous);
      this.render();
      this.selectHero(index < 0 ? this.heroes.length - 1 : index);
      message = 'AVATAR READY · CONFIRM RIDER & PARK TO CONTINUE';
    } catch (error) {
      message = error.message || 'Could not load this avatar. Try another GLB.';
    } finally {
      if (!this.disposed) this.setBusy(false, message);
    }
  }

  handleButtonKey(event) {
    if (event.code !== 'Enter' && event.code !== 'Space') return false;
    const button = event.target?.closest?.('button');
    if (button && this.root.contains(button) && !button.disabled) button.click();
    // Pump input consumes Space globally, so activate the focused button here.
    // A focused rider selects that rider; only the confirm button proceeds.
    event.preventDefault?.();
    return true;
  }

  handleKeyboardEvent(event) {
    if (this.root.hidden || this.busy) return false;
    if (this.handleButtonKey(event)) return true;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      this.selectHero(this.selectedHeroIndex - 1);
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      this.selectHero(this.selectedHeroIndex + 1);
    } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      this.selectBoardColor(this.selectedBoardIndex + 1);
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      this.selectBoardColor(this.selectedBoardIndex - 1);
    } else if (event.code === 'Escape' || event.code === 'Backspace') {
      this.onBack?.();
    } else {
      return false;
    }
    event.preventDefault?.();
    return true;
  }

  handleControllerActions(actions = {}) {
    if (this.root.hidden || this.busy) return false;
    if (actions.left) this.selectHero(this.selectedHeroIndex - 1);
    else if (actions.right) this.selectHero(this.selectedHeroIndex + 1);
    else if (actions.up) this.selectBoardColor(this.selectedBoardIndex + 1);
    else if (actions.down) this.selectBoardColor(this.selectedBoardIndex - 1);
    else if (actions.confirm) this._confirm();
    else if (actions.cancel) this.onBack?.();
    else return false;
    return true;
  }

  show() {
    this.root.hidden = false;
    this.renderSelection();
    this.heroRoot.querySelector('.is-selected')?.focus({ preventScroll: true });
  }

  hide() {
    this.root.hidden = true;
  }

  render() {
    this.heroRoot.replaceChildren();
    this.heroes.forEach((hero, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hero-card';
      button.dataset.heroId = hero.id;
      button.innerHTML = [
        '<span class="hero-card-image-wrap">',
        '<img class="hero-card-image" alt="" loading="eager" decoding="async" draggable="false">',
        '<span class="hero-card-monogram" aria-hidden="true"></span>',
        '</span>',
        '<span class="hero-card-copy">',
        '<strong></strong>',
        '<small></small>',
        '</span>',
      ].join('');

      const initials = hero.name
        .replace(/^The\s+/i, '')
        .split(/\s+/)
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const image = button.querySelector('.hero-card-image');
      const fallback = button.querySelector('.hero-card-monogram');
      if (hero.portraitUrl) image.src = hero.portraitUrl;
      else image.remove();
      image.alt = hero.name;
      fallback.textContent = initials;
      image.addEventListener('load', () => {
        button.classList.add('has-thumb');
        button.classList.remove('thumb-failed');
      });
      image.addEventListener('error', () => {
        button.classList.remove('has-thumb');
        button.classList.add('thumb-failed');
      });
      button.querySelector('strong').textContent = hero.name;
      button.querySelector('small').textContent = hero.tribe;
      button.addEventListener('click', () => this.selectHero(index));
      this.heroRoot.append(button);
    });

    this.swatchRoot.replaceChildren();
    this.boardColors.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'board-swatch';
      button.dataset.boardColorId = entry.id;
      button.title = entry.name;
      button.setAttribute('aria-label', entry.name);
      if (entry.color === null) {
        button.classList.add('is-original');
      } else {
        button.style.setProperty('--swatch', '#' + entry.color.toString(16).padStart(6, '0'));
      }
      button.addEventListener('click', () => this.selectBoardColor(index));
      this.swatchRoot.append(button);
    });

    this.renderSelection();
  }

  renderSelection() {
    const hero = this.selectedHero;
    const board = this.selectedBoardColor;
    for (const card of this.heroRoot.querySelectorAll('.hero-card')) {
      const selected = card.dataset.heroId === hero?.id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    for (const swatch of this.swatchRoot.querySelectorAll('.board-swatch')) {
      const selected = swatch.dataset.boardColorId === board?.id;
      swatch.classList.toggle('is-selected', selected);
      swatch.setAttribute('aria-pressed', String(selected));
    }
    this.boardName.textContent = board?.name || 'Original';
    this.confirmButton.textContent = hero ? 'RIDE AS ' + hero.name.toUpperCase() : 'CONTINUE';
  }

  dispose() {
    this.disposed = true;
    releaseCustomAvatar(this.customAvatar);
    this.root.remove();
  }
}
