import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

export class HalfpipeCamera {
  constructor() {
    const config = GAME_CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(config.fov, 16 / 9, config.near, config.far);
    this.camera.name = 'fixed-halfpipe-camera';
    this.camera.position.fromArray(config.position);
    this.target = new THREE.Vector3().fromArray(config.target);
    this.camera.lookAt(this.target);
  }

  resize(width, height) {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
