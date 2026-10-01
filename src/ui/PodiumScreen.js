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
    this.cameraWorld = new THREE.Matrix4();
    this.cameraProjection = new THREE.Matrix4();
    this.layoutDirty = true;
    this.labelLayout = null;
    this.anchorPositions = new Map();
    this.heading = this.root.querySelector('h1');
    this.connectors = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.connectors.classList.add('podium-label-connectors');
    this.connectors.setAttribute('aria-hidden', 'true');
    this.grid.before(this.connectors);
    this.status = document.createElement('p');
    this.status.className = 'podium-status';
    this.status.setAttribute('role', 'status');
    this.grid.after(this.status);
    if (globalThis.ResizeObserver) {
      this.layoutObserver = new ResizeObserver(() => { this.layoutDirty = true; });
      [this.root, this.heading, this.actionsRoot].forEach(element => this.layoutObserver.observe(element));
    }
    document.fonts?.ready?.then(() => { this.layoutDirty = true; });
  }

  show(standings = []) {
    const place = standings.findIndex(entry => entry.isPlayer) + 1;
    const message = place === 1 ? 'Congratulations!' : place === 2 ? 'Nice try' : 'Don’t give up';
    const heading = this.heading;
    heading.textContent = message;
    heading.dataset.place = String(place);
    this.labels.forEach(({label}) => this.layoutObserver?.unobserve(label));
    this.grid.replaceChildren();
    this.connectors.replaceChildren();
    this.grid.classList.remove('is-fallback');
    this.labels = standings.map((entry, index) => {
      const label = document.createElement('div');
      label.className = 'podium-score-label' + (entry.isPlayer ? ' is-player' : '');
      const name = document.createElement('span');
      name.textContent = `${index + 1}. ${entry.isPlayer ? 'YOU · ' : ''}${entry.name}`;
      name.title = name.textContent;
      const score = document.createElement('strong');
      score.textContent = entry.score.toLocaleString('en-US');
      score.style.setProperty('--score-glyph-span', String(Math.max(4.6, score.textContent.length * .72)));
      label.append(name, score);
      label.hidden = true;
      this.grid.append(label);
      const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      connector.style.display = 'none';
      this.connectors.append(connector);
      this.layoutObserver?.observe(label);
      return { entry, label, connector };
    });
    this.status.textContent = 'SETTING UP THE PODIUM…';
    this.root.hidden = false;
    this.selectedIndex = 0;
    this._renderActions();
    this.layoutDirty = true;
    this.anchorPositions.clear();
  }

  setReady(ready) {
    this.status.textContent = ready ? '' : 'Podium unavailable · final standings';
    this.grid.classList.toggle('is-fallback', !ready);
    this.connectors.style.display = ready ? '' : 'none';
    this.labels.forEach(({label}) => {
      label.hidden = false;
      label.removeAttribute('style');
      if (ready) label.style.visibility = 'hidden';
    });
    this.layoutDirty = true;
  }

  updateLabels(anchors, camera) {
    if (this.root.hidden || this.grid.classList.contains('is-fallback') || !anchors.length) return;
    // The ceremony camera is static. Read DOM geometry only on presentation,
    // viewport/font/preference changes; three score labels need no frame loop
    // layout work while the scene and camera remain unchanged.
    camera.updateMatrixWorld();
    const anchorsChanged = anchors.length !== this.anchorPositions.size
      || anchors.some(anchor => !this.anchorPositions.get(anchor.entry.id)?.equals(anchor.position));
    if (!this.layoutDirty && this.cameraWorld.equals(camera.matrixWorld)
      && this.cameraProjection.equals(camera.projectionMatrix) && !anchorsChanged) return;
    this.anchorPositions.clear();
    anchors.forEach(anchor => this.anchorPositions.set(anchor.entry.id, anchor.position.clone()));
    this.cameraWorld.copy(camera.matrixWorld);
    this.cameraProjection.copy(camera.projectionMatrix);
    if (this.layoutDirty) this._measureLabelLayout();
    const {width, height, top, bottom, margin, gap, sizes} = this.labelLayout;
    const projectedLabels = [];
    this.labels.forEach(({entry, label, connector}, index) => {
      const anchor = anchors.find(item => item.entry.id === entry.id);
      connector.style.display = 'none';
      if (!anchor) { label.hidden = true; return; }
      this.projected.copy(anchor.position).project(camera);
      label.hidden = ![this.projected.x, this.projected.y, this.projected.z].every(Number.isFinite)
        || this.projected.z < -1 || this.projected.z > 1;
      if (label.hidden) return;
      const anchorX = (this.projected.x * .5 + .5) * width;
      const anchorY = (-this.projected.y * .5 + .5) * height;
      const size = sizes[index];
      projectedLabels.push({label, connector, anchorX, anchorY, ...size,
        left: clamp(anchorX - size.width / 2, margin, width - margin - size.width),
        top: clamp(anchorY - size.height - 5, top, Math.max(top, bottom - size.height))});
    });
    // Preserve left/center/right rank placement. A forward/backward sweep
    // separates the complete row and keeps every box inside the safe region.
    projectedLabels.sort((a, b) => a.anchorX - b.anchorX);
    for (let index = 1; index < projectedLabels.length; index++) {
      const previous = projectedLabels[index - 1], item = projectedLabels[index];
      item.left = Math.max(item.left, previous.left + previous.width + gap);
    }
    for (let index = projectedLabels.length - 1; index >= 0; index--) {
      const item = projectedLabels[index], next = projectedLabels[index + 1];
      item.left = Math.min(item.left, next ? next.left - gap - item.width : width - margin - item.width);
    }
    projectedLabels.forEach(({label, connector, left, top: y, width: labelWidth, height: labelHeight, anchorX, anchorY}) => {
      label.style.left = `${Math.round(left)}px`;
      label.style.top = `${Math.round(y)}px`;
      label.style.visibility = '';
      const centerX = left + labelWidth / 2, lowerY = y + labelHeight;
      if (Math.abs(centerX - anchorX) > 18 || Math.abs(lowerY - anchorY) > 24) {
        connector.setAttribute('x1', String(centerX));
        connector.setAttribute('y1', String(lowerY));
        connector.setAttribute('x2', String(clamp(anchorX, margin, width - margin)));
        connector.setAttribute('y2', String(clamp(anchorY, top, bottom)));
        connector.style.display = '';
      }
    });
    this.layoutDirty = false;
  }

  _measureLabelLayout() {
    const bounds = this.root.getBoundingClientRect();
    const width = bounds.width, height = bounds.height;
    const margin = width <= 480 ? 8 : 12, gap = width <= 480 ? 6 : 10;
    const cap = Math.max(1, (width - margin * 2 - gap * 2) / 3);
    this.root.style.setProperty('--podium-label-cap', `${cap}px`);
    const headingBottom = this.heading.getBoundingClientRect().bottom - bounds.top;
    const footerTop = this.actionsRoot.getBoundingClientRect().top - bounds.top;
    this.connectors.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const hiddenStates = this.labels.map(({label}) => label.hidden);
    this.labels.forEach(({label}) => { label.hidden = false; });
    const sizes = this.labels.map(({label}) => ({width: label.offsetWidth, height: label.offsetHeight}));
    this.labels.forEach(({label}, index) => { label.hidden = hiddenStates[index]; });
    this.labelLayout = {width, height, margin, gap,
      top: Math.max(margin, headingBottom + 12),
      bottom: Math.min(height - margin, footerTop - 12),
      sizes};
  }

  dispose() {
    this.layoutObserver?.disconnect();
    super.dispose();
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
