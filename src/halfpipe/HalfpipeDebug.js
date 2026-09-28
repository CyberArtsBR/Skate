import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

export class HalfpipeDebug {
  constructor(profile) {
    this.profile = profile;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-reference-profile-debug';

    const points = profile.createPoints().map(
      (point) => new THREE.Vector3(point.x, point.y + 0.06, GAME_CONFIG.halfpipeProfile.debugDepth),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff4fb3, depthTest: false });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 50;
    this.root.add(line);

    const markerGeometry = new THREE.SphereGeometry(0.1, 12, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe66d, depthTest: false });
    for (const x of [profile.leftLip, profile.rightLip]) {
      const point = profile.sample(x);
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(point.x, point.y + 0.06, GAME_CONFIG.halfpipeProfile.debugDepth);
      marker.renderOrder = 51;
      this.root.add(marker);
    }

    this.root.visible = GAME_CONFIG.halfpipeProfile.debugVisible;
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  toggle() {
    this.setVisible(!this.root.visible);
    return this.root.visible;
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
  }
}
