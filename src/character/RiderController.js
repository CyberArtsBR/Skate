import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createRiderPresentationState } from './RiderPresentationState.js';
import { RiderFootIK } from './RiderFootIK.js';
import { SkatePoseController } from './SkatePoseController.js';
import { SkateAnimationController } from './SkateAnimationController.js';
import { TrickPoseController } from './TrickPoseController.js';
import { HandPlantIK } from './HandPlantIK.js';
import { correctHandPlantClearance } from './HandPlantClearance.js';
import { HANDPLANT_CLEARANCE as PLANT_PHASES } from '../gameplay/CrashPresentationTuning.js';

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
    this._handPlantClearanceState = null;
    this._plantActive = false;
    this.plantContact = null;
    this.plantProgress = 0;
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

  _beginHandPlant(state) {
    // Sample a riding pose before inversion and before the trick's 180 yaw.
    // Choosing after those rotations made the far arm win in fakie stance.
    const entryYaw = state.facingYaw - state.turnDirection * Math.PI * state.trickProgress;
    this.plantEntryYaw = entryYaw;
    this.trickCarrier.position.set(0, 0, 0);
    this.trickCarrier.rotation.set(0, entryYaw, 0, 'ZXY');
    this.boardPivot.position.set(this.trickPoseController.rearPivotX, 0, 0);
    this.boardPivot.rotation.set(0, 0, 0);
    this.bodyCarrier.position.set(0, 0, 0);
    this.bodyCarrier.rotation.set(0, 0, 0);
    const backAmount = (1 - Math.cos(entryYaw)) * 0.5;
    this.chimpion.root.position.set(0, this.baseChimpionY
      - GAME_CONFIG.rider.fakieBodyDrop * backAmount, 0.015);
    const entryPose = this.poseController.evaluate({ ...state, facingYaw: entryYaw,
      trickVisualActive: false, trickType: null, trickProgress: 0 });
    this.chimpion.updatePose(entryPose);
    this.root.updateWorldMatrix(true, true);
    this.footIK.update({ ...state, kneeFlex: entryPose.kneeFlex });
    const contact = this.handPlantIK.beginPlant({ copingWorldPoint: state.copingWorldPoint,
      side: state.wallSide, facingYaw: entryYaw });
    this.plantContact = contact?.target
      ? { x: contact.target.x, y: contact.target.y, z: contact.target.z }
      : state.copingWorldPoint ? { ...state.copingWorldPoint } : null;
    this._handPlantClearanceState = null;
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

    const planting = this.presentationState.trickVisualActive
      && this.presentationState.trickType === 'hand-plant';
    const newPlant = planting && (!this._plantActive
      || this.presentationState.trickProgress < this.plantProgress
      || this.presentationState.time < (this.poseTime ?? this.presentationState.time));
    if (newPlant) this._beginHandPlant(this.presentationState);
    if (planting) {
      this.presentationState.copingWorldPoint = this.plantContact;
      this.presentationState.selectedPlantHand = this.handPlantIK.selectedPlantHand;
      this.presentationState.plantFacingSign = this.handPlantIK.plantFacingSign;
      this.plantProgress = this.presentationState.trickProgress;
    }

    const plantEnter = THREE.MathUtils.smoothstep(
      this.presentationState.trickProgress / PLANT_PHASES.enterEnd, 0, 1,
    );
    const plantRelease = 1 - THREE.MathUtils.smoothstep(
      (this.presentationState.trickProgress - PLANT_PHASES.releaseStart)
        / (1 - PLANT_PHASES.releaseStart), 0, 1,
    );
    const plantRoll = (this.presentationState.wallSide || 1)
      * GAME_CONFIG.trickPresentation.handPlantRoll * plantEnter * plantRelease;

    this.trickCarrier.position.set(
      planting ? 0 : this.presentationState.trickOffsetX,
      planting ? 0 : this.presentationState.trickOffsetY,
      0,
    );
    this.trickCarrier.rotation.set(
      this.presentationState.trickPitch,
      this.presentationState.facingYaw,
      planting ? plantRoll : this.presentationState.trickRoll,
      this.presentationState.trickType === 'hand-plant' ? 'ZXY' : 'XYZ',
    );
    if (this.presentationState.trickVisualActive
      && this.presentationState.trickType === 'hand-plant'
      && this.presentationState.copingWorldPoint) {
      const point = this.presentationState.copingWorldPoint;
      const anchor = this.root.worldToLocal(new THREE.Vector3(point.x, point.y, point.z));
      const unrolled = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        this.presentationState.trickPitch, this.plantEntryYaw, 0, 'ZXY',
      ));
      const rotatedAnchor = anchor.clone().applyQuaternion(unrolled.invert())
        .applyQuaternion(this.trickCarrier.quaternion);
      // Pivot the shared board/body assembly about the latched coping point.
      // Independent lift/shift offsets would move that pivot away from the bar.
      // The incoming yaw is fixed so the 180 also turns around the hand.
      // Release the pivot with the contact envelope to meet normal riding
      // continuously at exit. Physics, duration, inputs and score are untouched.
      this.trickCarrier.position.addScaledVector(anchor.sub(rotatedAnchor), plantEnter * plantRelease);
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
    if (planting) {
      this.root.userData.handPlantClearance = correctHandPlantClearance(this, this.presentationState);
    } else {
      this._handPlantClearanceState = null;
      this.plantContact = null;
      this.plantProgress = 0;
      this.presentationState.selectedPlantHand = null;
      this.presentationState.plantFacingSign = null;
      this.root.userData.handPlantClearance = null;
    }
    const handResult = this.handPlantIK.update({
      active: planting,
      progress: this.presentationState.trickProgress,
      side: this.presentationState.wallSide,
      copingWorldPoint: this.presentationState.copingWorldPoint,
      facingYaw: this.presentationState.facingYaw,
    });
    if (handResult.active && handResult.plantHandWorldPosition && handResult.plantTargetWorldPosition) {
      // Clearance owns the shared body/deck placement. Pulling that assembly
      // back to an unreachable wrist undid clearance and buried the head.
      // The analytical arm solve preserves its lengths and the stored contact.
      const bone = this.chimpion.rigAdapter.rig[`${handResult.side}Hand`];
      bone.getWorldPosition(handResult.plantHandWorldPosition);
      handResult.error = handResult.plantHandWorldPosition.distanceTo(handResult.plantTargetWorldPosition);
      handResult.contactError = handResult.error;
    }

    this.root.userData.animationState = this.presentationState.animationState;
    this.root.userData.footIK = { ...footResult };
    this.root.userData.handPlantIK = { ...handResult };
    this._plantActive = planting;
    return this.presentationState;
  }

  dispose() {
    this.root.removeFromParent();
    this.skateboard.dispose();
    this.chimpion.dispose();
  }
}
