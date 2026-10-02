import { TrickFeedback } from './TrickFeedback.js';
import { applyGameUIPreferences } from './UIPreferences.js';
import { setGraffitiText, disposeGraffitiTextTree, refreshGraffitiTextTree } from './GraffitiText.js';
import './graffiti-hud.css';

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
    this.scoreElement = this.root.querySelector('[data-score]');
    this.timeElement = this.root.querySelector('[data-time]');

    setGraffitiText(this.root.querySelector('.hud-score > span'), 'SCORE', { palette: 'gold' });
    setGraffitiText(this.root.querySelector('.hud-time > span'), 'TIME', { palette: 'cyan' });
    setGraffitiText(this.scoreElement, '0', { palette: 'gold' });
    setGraffitiText(this.timeElement, '1:15', { palette: 'gold' });

    this.feedback = new TrickFeedback(this.root);
    this.setPlayerMode({ highContrast, uiScale, reducedMotion });
    this.setDebugMode(debug);
  }

  setScore(score) {
    const label = Math.max(0, Math.round(Number(score) || 0)).toLocaleString('en-US');
    setGraffitiText(this.scoreElement, label, { palette: 'gold' });
  }

  setTime(time) {
    const label = String(time);
    const parts = label.split(':').map(Number);
    const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : Number(label);
    this.root.classList.toggle('is-time-low', seconds <= 10);
    setGraffitiText(this.timeElement, label, { palette: seconds <= 10 ? 'red' : 'gold', align: 'right' });
  }

  setCombo(multiplier = 1) {
    this.feedback.setCombo(multiplier);
  }

  showTrick(name, points = 0, options = {}) {
    this.lastScoreBreakdown = options.breakdown ? { ...options.breakdown } : null;
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
    element.dataset.tone = ['error', 'failed', 'bail'].includes(phase) ? 'bad'
      : ['finished', 'running'].includes(phase) ? 'good' : 'ok';
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
    applyGameUIPreferences(this.root.parentElement, this.playerMode);
    refreshGraffitiTextTree(this.root.parentElement);
    return { ...this.playerMode };
  }

  clearFeedback() {
    this.lastScoreBreakdown = null;
    this.feedback.clear();
  }

  dispose() {
    this.feedback.dispose();
    disposeGraffitiTextTree(this.root);
    this.root.remove();
  }
}
