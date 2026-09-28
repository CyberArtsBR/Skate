export class HalfpipeHUD {
  constructor(stage) {
    this.root = document.createElement('div');
    this.root.className = 'halfpipe-hud';
    this.root.innerHTML = `
      <div class="hud-block hud-score"><span>SCORE</span><strong data-score>0</strong></div>
      <div class="hud-title"><small>PUMPING // PHASE 3B</small><strong>HALF-PIPE</strong></div>
      <div class="hud-block hud-time"><span>TIME</span><strong data-time>1:15</strong></div>
      <div class="hud-status" data-status>READY · PRESS ↑/↓ OR ENTER TO START</div>
      <div class="hud-debug" data-debug>P · PAUSE&nbsp;&nbsp; R · RESET&nbsp;&nbsp; D · PROFILE</div>
    `;
    stage.append(this.root);
  }

  setScore(score) {
    this.root.querySelector('[data-score]').textContent = String(score);
  }

  setTime(time) {
    this.root.querySelector('[data-time]').textContent = String(time);
  }

  setDebugText(text) {
    this.root.querySelector('[data-debug]').textContent = String(text);
  }

  setStatus(text, phase = '') {
    const element = this.root.querySelector('[data-status]');
    element.textContent = String(text || '');
    element.dataset.phase = String(phase || '');
    element.hidden = !text;
  }

  dispose() {
    this.root.remove();
  }
}
