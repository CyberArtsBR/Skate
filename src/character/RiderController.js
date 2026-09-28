import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

export class RiderController {
  constructor({ skateboard, chimpion }) {
    this.skateboard = skateboard;
    this.chimpion = chimpion;
    this.root = new THREE.Group();
    this.root.name = 'rider-and-board-presentation-root';
    this.root.position.fromArray(GAME_CONFIG.rider.position);

    this.root.add(skateboard.root, chimpion.root);
    chimpion.root.position.y = skateboard.deckSurfaceY + GAME_CONFIG.rider.deckClearance;
    chimpion.root.position.z = 0.015;

    this.presentationState = {
      crouch: 0.55,
      torsoTurn: 0.08,
    };
    this.chimpion.updatePose(this.presentationState);
  }

  setPresentationState(nextState = {}) {
    Object.assign(this.presentationState, nextState);
    this.chimpion.updatePose(this.presentationState);
  }

  dispose() {
    this.root.removeFromParent();
    this.skateboard.dispose();
    this.chimpion.dispose();
  }
}
