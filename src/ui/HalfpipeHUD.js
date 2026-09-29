import { TrickFeedback } from './TrickFeedback.js';

export function resolveDebugMode(search = globalThis.location?.search || '') {
  try {
    return new URLSearchParams(String(search || '')).get('debug') === '1';
  } catch {
    return false;
  }
}

export class HalfpipeHUD {
  constructor(stage, {
    debug = resolveDebugMode(),
    highContrast = false,
    uiScale = 1,
    reducedMotion = false,
  } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'halfpipe-hud';
    this.root.innerHTML = [
      '<div class="hud-block hud-score"><span>SCORE</span><strong data-score>0</strong></div>',
      '<div class="hud-context" aria-live="polite">',
      '<div class="hud-combo" data-combo hidden></div>',
      '<div class="hud-trick-feedback" data-trick-feedback hidden></div>',
      '<div class="hud-landing-feedback" data-landing-feedback hidden></div>',
      '<div class="hud-action-feedback" data-action-feedback hidden></div>',
      '<div class="hud-status" data-status hidden></div>',
      '</div>',
      '<div class="hud-block hud-time"><span>TIME</span><strong data-time>1:15</strong></div>',
      '<pre class="hud-debug" data-debug hidden></pre>',
    ].join('');
    stage.append(this.root);

    this.feedback = new TrickFeedback(this.root);
    this.setPlayerMode({ highContrast, uiScale, reducedMotion });
    this.setDebugMode(debug);
  }

  setScore(score) {
    this.root.querySelector('[data-score]').textContent = String(
      Math.max(0, Math.round(Number(score) || 0)),
    );
  }

  setTime(time) {
    this.root.querySelector('[data-time]').textContent = String(time);
  }

  setCombo(multiplier = 1) {
    this.feedback.setCombo(multiplier);
  }

  showTrick(name, points = 0, options = {}) {
    this.feedback.showTrick(name, points, options);
  }

  showLanding(result, options = {}) {
    this.feedback.showLanding(result, options);
  }

  showActionFeedback(type, options = {}) {
    this.feedback.showActionFeedback(type, options);
  }

  setDebugText(text) {
    const element = this.root.querySelector('[data-debug]');
    element.textContent = String(text || '');
  }

  setDebugMode(enabled = false) {
    this.debugMode = Boolean(enabled);
    const element = this.root.querySelector('[data-debug]');
    element.hidden = !this.debugMode;
    this.root.dataset.debug = this.debugMode ? '1' : '0';
    return this.debugMode;
  }

  setStatus(text, phase = '') {
    const element = this.root.querySelector('[data-status]');
    element.textContent = String(text || '');
    element.dataset.phase = String(phase || '');
    element.hidden = !text;
  }

  setPlayerMode({
    highContrast = false,
    uiScale = 1,
    reducedMotion = false,
  } = {}) {
    const scale = Math.max(0.85, Math.min(1.5, Number(uiScale) || 1));
    this.root.style.setProperty('--ui-scale', String(scale));
    this.root.classList.toggle('is-high-contrast', Boolean(highContrast));
    this.root.classList.toggle('is-reduced-motion', Boolean(reducedMotion));
    this.playerMode = {
      highContrast: Boolean(highContrast),
      uiScale: scale,
      reducedMotion: Boolean(reducedMotion),
    };
    return { ...this.playerMode };
  }

  clearFeedback() {
    this.feedback.clear();
  }

  dispose() {
    this.feedback.dispose();
    this.root.remove();
  }
}
