export class HalfpipeHUD {
  constructor(stage) {
    this.root = document.createElement('div');
    this.root.className = 'halfpipe-hud';
    this.root.innerHTML = `
      <div class="hud-block hud-score"><span>SCORE</span><strong data-score>0</strong></div>
      <div class="hud-title"><small>PASSIVE PHYSICS // PHASE 3A</small><strong>HALF-PIPE</strong></div>
      <div class="hud-block hud-time"><span>TIME</span><strong data-time>1:15</strong></div>
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

  dispose() {
    this.root.remove();
  }
}
