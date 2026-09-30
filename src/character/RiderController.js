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
    const measuredRearAxleX = Number(skateboard.rearContact?.position?.x);
    this.trickPoseController = new TrickPoseController({
      stance: GAME_CONFIG.rider.stance,
      stanceHalfLength: skateboard.stanceHalfLength,
      rearAxleX: Number.isFinite(measuredRearAxleX) ? measuredRearAxleX : null,
    });

    // Keep neutral board world transform unchanged while moving the local pivot
    // to the measured rear axle/truck. The controller falls back to the old
    // stance-based estimate only if semantic wheel measurements are unavailable.
    this.boardPivot.position.x = this.trickPoseController.rearPivotX;
    skateboard.root.position.x = -this.trickPoseController.rearPivotX;

    this.presentationState = createRiderPresentationState();
    this._rebuildCharacterIK();
    this.setPresentationState(this.presentationState);

    this.root.userData.presentationOnly = true;
    this.root.userData.stance = GAME_CONFIG.rider.stance;
    this.root.userData.hasTrickCarrier = true;
    this.root.userData.hasRearTruckPivot = true;
    this.root.userData.rearTruckPivotX = this.trickPoseController.rearPivotX;
    this.root.userData.rearTruckPivotSource = this.trickPoseController.rearPivotSource;
    this.root.userData.hasHandPlantIK = true;
  }

  _rebuildCharacterIK() {
    this.smoothedPose = null;
    this.poseTime = null;
    const boardRotation = this.boardPivot.quaternion.clone();
    const bodyRotation = this.bodyCarrier.quaternion.clone();
    this.boardPivot.quaternion.identity();
    this.bodyCarrier.quaternion.identity();
    this.footIK = new RiderFootIK({
      rigAdapter: this.chimpion.rigAdapter,
      riderRoot: this.root,
      skateboard: this.skateboard,
      chimpionRoot: this.chimpion.root,
      stance: GAME_CONFIG.rider.stance,
    });
    this.boardPivot.quaternion.copy(boardRotation);
    this.bodyCarrier.quaternion.copy(bodyRotation);
    this.handPlantIK = new HandPlantIK({
      rigAdapter: this.chimpion.rigAdapter,
      riderRoot: this.root,
    });
  }

  replaceChimpion(chimpion) {
    if (!chimpion?.root || !chimpion?.rigAdapter?.valid) {
      throw new Error('Cannot replace rider with an invalid Chimpion rig');
    }

    const previous = this.chimpion;
    previous?.root?.removeFromParent?.();

    this.chimpion = chimpion;
    this.bodyCarrier.add(chimpion.root);
    chimpion.root.position.y = this.baseChimpionY;
    chimpion.root.position.z = 0.015;
    this._rebuildCharacterIK();

    const pose = this.poseController.evaluate(this.presentationState);
    chimpion.updatePose(pose);
    this.setPresentationState(this.presentationState);
    previous?.dispose?.();
    return chimpion;
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
      this.presentationState.trickPitch,
      this.presentationState.facingYaw,
      this.presentationState.trickRoll,
      this.presentationState.trickType === 'hand-plant' ? 'ZXY' : 'XYZ',
    );
    if (this.presentationState.trickVisualActive
      && this.presentationState.trickType === 'hand-plant'
      && this.presentationState.copingWorldPoint) {
      const point = this.presentationState.copingWorldPoint;
      const anchor = this.root.worldToLocal(new THREE.Vector3(point.x, point.y, point.z));
      const unrolled = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        this.presentationState.trickPitch, this.presentationState.facingYaw, 0, 'ZXY',
      ));
      const rotatedAnchor = anchor.clone().applyQuaternion(unrolled.invert())
        .applyQuaternion(this.trickCarrier.quaternion);
      // The existing roll/timing stays intact. Its visual pivot is now the
      // actual coping region, with continuous entry and exit at zero roll.
      this.trickCarrier.position.add(anchor.sub(rotatedAnchor));
    }

    const trickPose = this.trickPoseController.evaluate(this.presentationState);
    this.boardPivot.position.set(trickPose.rearPivotX, 0, 0);
    this.boardPivot.rotation.set(0, trickPose.boardYaw, trickPose.boardRoll);
    this.bodyCarrier.position.set(trickPose.bodyX, trickPose.bodyY, 0);
    this.bodyCarrier.rotation.set(0, trickPose.bodyYaw, trickPose.bodyRoll);

    const backAmount = (
      1 - Math.cos(this.presentationState.facingYaw)
    ) * 0.5;
    this.chimpion.root.position.set(0, this.baseChimpionY
      - GAME_CONFIG.rider.fakieBodyDrop * backAmount, 0.015);

    const targetPose = this.poseController.evaluate(this.presentationState);
    const time = this.presentationState.time;
    const resetPose = !this.smoothedPose || time < this.poseTime;
    const dt = Math.min(0.05, Math.max(0, time - (this.poseTime ?? time)));
    const alpha = 1 - Math.exp(-22 * dt);
    const pose = { ...targetPose };
    if (!resetPose) {
      for (const [key, value] of Object.entries(pose)) {
        if (typeof value === 'number' && key !== 'facingSign') {
          pose[key] = THREE.MathUtils.lerp(this.smoothedPose[key] ?? value, value, alpha);
        }
      }
    }
    this.smoothedPose = { ...pose };
    this.poseTime = time;
    this.chimpion.updatePose(pose);
    this.root.updateWorldMatrix(true, true);

    const footResult = this.footIK.update({ ...this.presentationState, kneeFlex: pose.kneeFlex });
    this.root.updateWorldMatrix(true, true);
    const handResult = this.handPlantIK.update({
      active: this.presentationState.trickVisualActive
        && this.presentationState.trickType === 'hand-plant',
      progress: this.presentationState.trickProgress,
      side: this.presentationState.wallSide,
      copingWorldPoint: this.presentationState.copingWorldPoint,
      facingYaw: this.presentationState.facingYaw,
    });
    if (handResult.active && handResult.plantHandWorldPosition && handResult.plantTargetWorldPosition) {
      // Anchor the whole visual maneuver to the planted wrist, keeping board
      // and body together. This closes an unreachable arm without stretching
      // bones or moving the authoritative contact root. Reach/release weights
      // bring the board continuously into and out of the coping pivot.
      const target = this.root.worldToLocal(handResult.plantTargetWorldPosition.clone());
      const hand = this.root.worldToLocal(handResult.plantHandWorldPosition.clone());
      this.trickCarrier.position.add(target.sub(hand).multiplyScalar(handResult.weight));
      this.root.updateWorldMatrix(true, true);
      const bone = this.chimpion.rigAdapter.rig[`${handResult.side}Hand`];
      bone.getWorldPosition(handResult.plantHandWorldPosition);
      handResult.error = handResult.plantHandWorldPosition.distanceTo(handResult.plantTargetWorldPosition);
      handResult.contactError = handResult.error;
    }

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
