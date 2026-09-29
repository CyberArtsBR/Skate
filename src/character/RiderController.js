import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from './RiderPresentationState.js';
import { RiderFootIK } from './RiderFootIK.js';
import { SkatePoseController } from './SkatePoseController.js';
import { SkateAnimationController } from './SkateAnimationController.js';
import { TrickPoseController } from './TrickPoseController.js';
import { HandPlantIK } from './HandPlantIK.js';

export class RiderController {
  constructor({ skateboard, chimpion }) {
    this.skateboard = skateboard;
    this.chimpion = chimpion;
    this.root = new THREE.Group();
    this.root.name = 'rider-and-board-presentation-root';

    // Keep authoritative ramp/contact transforms on root. Everything below it
    // is presentation-only and may animate without perturbing collision/contact.
    this.trickCarrier = new THREE.Group();
    this.trickCarrier.name = 'rider-trick-presentation-carrier';
    this.root.add(this.trickCarrier);

    this.boardPivot = new THREE.Group();
    this.boardPivot.name = 'rear-truck-visual-pivot';
    this.bodyCarrier = new THREE.Group();
    this.bodyCarrier.name = 'rider-body-follow-carrier';
    this.trickCarrier.add(this.boardPivot, this.bodyCarrier);
    this.boardPivot.add(skateboard.root);
    this.bodyCarrier.add(chimpion.root);

    this.baseChimpionY = skateboard.deckSurfaceY + GAME_CONFIG.rider.deckClearance;
    chimpion.root.position.y = this.baseChimpionY;
    chimpion.root.position.z = 0.015;

    this.poseController = new SkatePoseController({ stance: GAME_CONFIG.rider.stance });
    this.animationController = new SkateAnimationController();
    this.trickPoseController = new TrickPoseController({
      stance: GAME_CONFIG.rider.stance,
      stanceHalfLength: skateboard.stanceHalfLength,
    });

    // Keep neutral board world transform unchanged while moving the local pivot
    // to the rear truck. During kick turns the nose can lift around this point.
    this.boardPivot.position.x = this.trickPoseController.rearPivotX;
    skateboard.root.position.x = -this.trickPoseController.rearPivotX;

    this.presentationState = createRiderPresentationState();
    this.footIK = new RiderFootIK({
      rigAdapter: chimpion.rigAdapter,
      riderRoot: this.root,
      skateboard,
      chimpionRoot: chimpion.root,
      stance: GAME_CONFIG.rider.stance,
    });
    this.handPlantIK = new HandPlantIK({
      rigAdapter: chimpion.rigAdapter,
      riderRoot: this.root,
    });
    this.setPresentationState(this.presentationState);

    this.root.userData.presentationOnly = true;
    this.root.userData.stance = GAME_CONFIG.rider.stance;
    this.root.userData.hasTrickCarrier = true;
    this.root.userData.hasRearTruckPivot = true;
    this.root.userData.hasHandPlantIK = true;
  }

  setPresentationState(nextState = {}) {
    const rawState = createRiderPresentationState({
      ...this.presentationState,
      ...nextState,
    });
    this.presentationState = createRiderPresentationState(
      this.animationController.update(rawState),
    );

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

    const trickPose = this.trickPoseController.evaluate(this.presentationState);
    this.boardPivot.position.set(trickPose.rearPivotX, 0, 0);
    this.boardPivot.rotation.set(0, trickPose.boardYaw, trickPose.boardRoll);
    this.bodyCarrier.position.set(trickPose.bodyX, trickPose.bodyY, 0);
    this.bodyCarrier.rotation.set(0, trickPose.bodyYaw, trickPose.bodyRoll);

    const backAmount = (
      1 - Math.cos(this.presentationState.facingYaw)
    ) * 0.5;
    this.chimpion.root.position.y = this.baseChimpionY
      - GAME_CONFIG.rider.fakieBodyDrop * backAmount;

    const pose = this.poseController.evaluate(this.presentationState);
    this.chimpion.updatePose(pose);
    this.root.updateWorldMatrix(true, true);

    const footResult = this.footIK.update(this.presentationState);
    this.root.updateWorldMatrix(true, true);
    const handResult = this.handPlantIK.update({
      active: this.presentationState.trickVisualActive
        && this.presentationState.trickType === 'hand-plant',
      progress: this.presentationState.trickProgress,
      side: this.presentationState.wallSide,
      copingWorldPoint: this.presentationState.copingWorldPoint,
      facingYaw: this.presentationState.facingYaw,
    });

    this.root.userData.animationState = this.presentationState.animationState;
    this.root.userData.footIK = { ...footResult };
    this.root.userData.handPlantIK = { ...handResult };
    return this.presentationState;
  }

  dispose() {
    this.root.removeFromParent();
    this.skateboard.dispose();
    this.chimpion.dispose();
  }
}
