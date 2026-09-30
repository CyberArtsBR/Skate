const LANDING_LABELS = Object.freeze({
  perfect: 'PERFECT LANDING',
  clean: 'CLEAN LANDING',
  heavy: 'HEAVY LANDING',
});

const ACTION_LABELS = Object.freeze({
  tooEarly: 'TOO EARLY',
  wrongWall: 'WRONG WALL',
  tooLow: 'TOO LOW',
  turnFirst: 'TURN FIRST',
  missedCoping: 'MISSED COPING',
  underRotated: 'UNDER ROTATED',
  overRotated: 'OVER ROTATED',
});

export class TrickFeedback {
  constructor(root) {
    this.root = root;
    this.trick = root.querySelector('[data-trick-feedback]');
    this.landing = root.querySelector('[data-landing-feedback]');
    this.status = root.querySelector('[data-action-feedback]');
    this.combo = root.querySelector('[data-combo]');
    this.timers = new Map();
  }

  showTrick(name, points = 0, { duration = 1500, breakdown = null } = {}) {
    const label = escapeText(formatTrickName(name));
    const pointsLabel = Number(points) > 0
      ? ' <span>+' + Math.round(Number(points)).toLocaleString('en-US') + '</span>'
      : '';
    const details = [];
    if (breakdown?.airHeight >= 0.5) details.push(breakdown.airHeight.toFixed(1) + 'm AIR');
    if (breakdown?.varietyMultiplier < 1) details.push('REPEAT ×' + trimMultiplier(breakdown.varietyMultiplier));
    else if (breakdown?.quality >= 0.9) details.push('GREAT EXECUTION');
    const detailLabel = details.length ? '<small>' + escapeText(details.join(' · ')) + '</small>' : '';
    this._show(this.trick, label + pointsLabel + detailLabel, duration, 'is-trick');
  }

  showLanding(result, {
    multiplier = null,
    duration = 1200,
  } = {}) {
    const key = normalizeKey(result);
    const label = LANDING_LABELS[key] || String(result || '').toUpperCase();
    const multiplierLabel = Number(multiplier) > 1
      ? ' <span>×' + trimMultiplier(multiplier) + '</span>'
      : '';
    this._show(
      this.landing,
      escapeText(label) + multiplierLabel,
      duration,
      'is-' + key,
    );
  }

  showActionFeedback(type, {
    text = null,
    duration = 900,
  } = {}) {
    const key = normalizeKey(type);
    const label = text || ACTION_LABELS[key] || String(type || '').toUpperCase();
    this._show(this.status, escapeText(label), duration, 'is-action');
  }

  setCombo(multiplier = 1) {
    const value = Math.max(1, Number(multiplier) || 1);
    if (!this.combo) return;
    if (value <= 1) {
      this.combo.hidden = true;
      this.combo.textContent = '';
      return;
    }
    this.combo.hidden = false;
    this.combo.textContent = 'COMBO ×' + trimMultiplier(value);
  }

  clear() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const element of [this.trick, this.landing, this.status]) {
      if (!element) continue;
      element.hidden = true;
      element.textContent = '';
      element.classList.remove(
        'is-visible',
        'is-leaving',
        'is-trick',
        'is-perfect',
        'is-clean',
        'is-heavy',
        'is-sketchy',
        'is-bail',
        'is-action',
      );
    }
    this.setCombo(1);
  }

  dispose() {
    this.clear();
  }

  _show(element, html, duration, className) {
    if (!element) return;
    const previous = this.timers.get(element);
    if (previous) clearTimeout(previous);

    element.innerHTML = html;
    element.hidden = false;
    element.classList.remove('is-visible', 'is-leaving', 'is-perfect', 'is-clean', 'is-heavy', 'is-sketchy', 'is-bail');
    // Restart the short pop for successive awards, including identical tricks.
    void element.offsetWidth;
    element.classList.add('is-visible', className);

    const timer = setTimeout(() => {
      element.classList.add('is-leaving');
      const hideTimer = setTimeout(() => {
        element.hidden = true;
        element.classList.remove('is-visible', 'is-leaving', className);
        this.timers.delete(element);
      }, 160);
      this.timers.set(element, hideTimer);
    }, Math.max(250, Number(duration) || 900));

    this.timers.set(element, timer);
  }
}

export function formatTrickName(name) {
  return String(name || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+(.)?/g, (_, char = '') => char.toUpperCase());
}

function trimMultiplier(value) {
  return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
