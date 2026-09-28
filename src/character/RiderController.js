import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from './RiderPresentationState.js';
import { RiderFootIK } from './RiderFootIK.js';
import { SkatePoseController } from './SkatePoseController.js';

export class RiderController {
  constructor({ skateboard, chimpion }) {
    this.skateboard = skateboard;
    this.chimpion = chimpion;
    this.root = new THREE.Group();
    this.root.name = 'rider-and-board-presentation-root';

    // Keep authoritative ramp/contact transforms on root. Visible tricks happen
    // one level below so turns/hand plants never perturb collision or contact.
    this.trickCarrier = new THREE.Group();
    this.trickCarrier.name = 'rider-trick-presentation-carrier';
    this.root.add(this.trickCarrier);
    this.trickCarrier.add(skateboard.root, chimpion.root);

    chimpion.root.position.y = skateboard.deckSurfaceY + GAME_CONFIG.rider.deckClearance;
    chimpion.root.position.z = 0.015;

    this.poseController = new SkatePoseController({ stance: GAME_CONFIG.rider.stance });
    this.presentationState = createRiderPresentationState();
    this.footIK = new RiderFootIK({
      rigAdapter: chimpion.rigAdapter,
      riderRoot: this.root,
      skateboard,
      chimpionRoot: chimpion.root,
      stance: GAME_CONFIG.rider.stance,
    });
    this.setPresentationState(this.presentationState);

    this.root.userData.presentationOnly = true;
    this.root.userData.stance = GAME_CONFIG.rider.stance;
    this.root.userData.hasTrickCarrier = true;
  }

  setPresentationState(nextState = {}) {
    this.presentationState = createRiderPresentationState({
      ...this.presentationState,
      ...nextState,
    });

    this.trickCarrier.position.set(
      this.presentationState.trickOffsetX,
      this.presentationState.trickOffsetY,
      0,
    );
    this.trickCarrier.rotation.set(
      0,
      this.presentationState.facingYaw,
      this.presentationState.trickRoll,
    );

    const pose = this.poseController.evaluate(this.presentationState);
    this.chimpion.updatePose(pose);
    this.root.updateWorldMatrix(true, true);
    this.footIK.update(this.presentationState);
    return this.presentationState;
  }

  dispose() {
    this.root.removeFromParent();
    this.skateboard.dispose();
    this.chimpion.dispose();
  }
}
