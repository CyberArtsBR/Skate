import * as THREE from 'three';
import { ResultsScreen } from './ResultsScreen.js';
import './podium.css';

// Reuse the results menu's mouse, keyboard and gamepad actions.
export class PodiumScreen extends ResultsScreen {
  constructor(stage, options = {}) {
    super(stage, options);
    this.root.classList.remove('menu-screen', 'results-screen');
    this.root.classList.add('podium-screen');
    this.root.querySelector('.menu-eyebrow').textContent = 'HALFPIPE CHIMP · FINAL STANDINGS';
    this.root.querySelector('.menu-card').className = 'podium-layout';
    this.grid.className = 'podium-score-labels';
    this.labels = [];
    this.projected = new THREE.Vector3();
    this.status = document.createElement('p');
    this.status.className = 'podium-status';
    this.status.setAttribute('role', 'status');
    this.grid.after(this.status);
  }

  show(standings = []) {
    const place = standings.findIndex(entry => entry.isPlayer) + 1;
    const message = place === 1 ? 'Congratulations!' : place === 2 ? 'Nice try' : 'Don’t give up';
    const heading = this.root.querySelector('h1');
    heading.textContent = message;
    heading.dataset.place = String(place);
    this.grid.replaceChildren();
    this.grid.classList.remove('is-fallback');
    this.labels = standings.map((entry, index) => {
      const label = document.createElement('div');
      label.className = 'podium-score-label' + (entry.isPlayer ? ' is-player' : '');
      const name = document.createElement('span');
      name.textContent = `${index + 1}. ${entry.isPlayer ? 'YOU · ' : ''}${entry.name}`;
      const score = document.createElement('strong');
      score.textContent = entry.score.toLocaleString('en-US');
      label.append(name, score);
      label.hidden = true;
      this.grid.append(label);
      return { entry, label };
    });
    this.status.textContent = 'SETTING UP THE PODIUM…';
    this.root.hidden = false;
    this.selectedIndex = 0;
    this._renderActions();
  }

  setReady(ready) {
    this.status.textContent = ready ? '' : 'Podium unavailable · final standings';
    this.grid.classList.toggle('is-fallback', !ready);
    if (!ready) this.labels.forEach(({label}) => { label.hidden = false; label.removeAttribute('style'); });
  }

  updateLabels(anchors, camera) {
    if (this.root.hidden || !anchors.length) return;
    const {width, height} = this.root.getBoundingClientRect();
    this.labels.forEach(({entry, label}) => {
      const anchor = anchors.find(item => item.entry.id === entry.id);
      if (!anchor) return;
      this.projected.copy(anchor.position).project(camera);
      label.hidden = this.projected.z < -1 || this.projected.z > 1;
      label.style.left = `${(this.projected.x * .5 + .5) * width}px`;
      label.style.top = `${(-this.projected.y * .5 + .5) * height}px`;
    });
  }
}
