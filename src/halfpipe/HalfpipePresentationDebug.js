import * as THREE from 'three';

function createStations(profile) {
  const transitionX = (fraction) => profile.flatHalfWidth + profile.transitionWidth * fraction;
  return Object.freeze([
    Object.freeze({ name: 'CENTER / FLAT', pipeX: 0, pumpCompression: 0.24 }),
    Object.freeze({ name: 'LOWER LEFT', pipeX: -transitionX(0.24), descending: true, pumpCompression: 0.42 }),
    Object.freeze({ name: 'UPPER LEFT', pipeX: -transitionX(0.68), descending: true, pumpCompression: 0.28 }),
    Object.freeze({ name: 'LEFT LIP', pipeX: -transitionX(0.92), descending: true, pumpCompression: 0.16 }),
    Object.freeze({ name: 'LOWER RIGHT', pipeX: transitionX(0.24), ascending: true, pumpCompression: 0.42 }),
    Object.freeze({ name: 'UPPER RIGHT', pipeX: transitionX(0.68), ascending: true, pumpCompression: 0.28 }),
    Object.freeze({ name: 'RIGHT LIP', pipeX: transitionX(0.92), ascending: true, pumpCompression: 0.16 }),
  ]);
}

export class HalfpipePresentationDebug {
  constructor(profile, binder, { onChange = null } = {}) {
    this.profile = profile;
    this.binder = binder;
    this.stations = createStations(profile);
    this.index = 0;
    this.onChange = onChange;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-presentation-station-debug';
    this.root.visible = false;

    const markerGeometry = new THREE.RingGeometry(0.11, 0.16, 18);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x67f5ff,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    for (const station of this.stations) {
      const sample = profile.sample(station.pipeX);
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(sample.x, sample.y + 0.03, 0.05);
      marker.renderOrder = 52;
      this.root.add(marker);
    }
  }

  get current() {
    return this.stations[this.index];
  }

  select(index) {
    const count = this.stations.length;
    this.index = ((index % count) + count) % count;
    const station = this.current;
    this.binder.apply(station);
    this.onChange?.(station, this.index, count);
    return station;
  }

  next() {
    return this.select(this.index + 1);
  }

  previous() {
    return this.select(this.index - 1);
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.removeFromParent();
  }
}
