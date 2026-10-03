import * as THREE from 'three';
import { LANDING_QUALITY } from './SkateAnimationState.js';
import { HANDPLANT_CLEARANCE as PLANT_PHASES } from '../gameplay/CrashPresentationTuning.js';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class SkatePoseController {
  constructor({ stance = 'regular' } = {}) {
    this.stance = stance === 'goofy' ? 'goofy' : 'regular';
    this.pose = {};
  }

  evaluate(state) {
    const pump = clamp01(state.pumpCompression);
    const landing = clamp01(state.landing);
    const speed = clamp01(state.speedNormalized);
    const air = state.airborne ? 1 : 0;
    const surfaceAngle = THREE.MathUtils.clamp(
      Number(state.surfaceAngle) || 0,
      -1.25,
      1.25,
    );
    // Board yaw already turns the whole rider. Only the secondary upper-body
    // response changes here, continuously, so quarter turns cannot flip the
    // chest and gaze instantaneously between normal and fakie.
    const facingSign = Math.cos(Number(state.facingYaw) || 0);
    const handPlant = state.trickVisualActive && state.trickType === 'hand-plant';
    const kickTurn = state.trickVisualActive && state.trickType === 'kick-turn';
    const backflip = Boolean(air && state.trickType === 'backflip');
    const aerialTurn = Boolean(air && state.trickType === 'aerial-turn');
    const trickProgress = clamp01(state.trickProgress);
    const plantHold = handPlant
      ? smoothstep(trickProgress / PLANT_PHASES.enterEnd)
        * (1 - smoothstep((trickProgress - PLANT_PHASES.releaseStart)
          / (1 - PLANT_PHASES.releaseStart)))
      : 0;
    const plantFacingSign = Number(state.plantFacingSign) < 0 ? -1 : 1;
    const plantHand = state.selectedPlantHand;
    const flipTuck = backflip
      ? smoothstep(trickProgress / 0.22)
        * (1 - smoothstep((trickProgress - 0.70) / 0.30))
      : 0;
    const flipOpen = backflip
      ? smoothstep((trickProgress - 0.66) / 0.34)
      : 0;
    const airTuck = clamp01(state.airTuck);
    const anticipation = clamp01(state.landingAnticipation);
    // Aerial yaw can contain several 180-degree segments. Hold one compact
    // silhouette through the flight instead of standing up at every segment.
    // Handplants share the compact aerial pose, blended with the planted phase.
    // The supporting arm is still solved separately against the coping.
    const aerialCrouch = handPlant
      ? plantHold * 0.94
      : backflip
      ? clamp01(0.68 + flipTuck * 0.32 - flipOpen * 0.14)
      : aerialTurn
        ? 0.94 - anticipation * 0.16
        : 0;
    const recovery = clamp01(state.recovery);
    const preload = clamp01(state.preloadCompression);
    const secondaryLag = THREE.MathUtils.clamp(
      Number(state.secondaryLag) || 0,
      -0.3,
      0.3,
    );
    const wallSide = Math.sign(Number(state.wallSide) || 0) || 1;
    const ascendingPrep = Boolean(state.rampAscending) && !air && !handPlant;

    const quality = String(state.landingQuality || LANDING_QUALITY.NONE);
    const landingScale = quality === LANDING_QUALITY.HEAVY
      ? 1.42
      : quality === LANDING_QUALITY.SKETCHY
        ? 1.18
        : quality === LANDING_QUALITY.PERFECT
          ? 0.82
          : 1;
    const sketchy = quality === LANDING_QUALITY.SKETCHY ? landing : 0;
    const heavy = quality === LANDING_QUALITY.HEAVY ? landing : 0;
    const bail = quality === LANDING_QUALITY.BAIL ? landing : 0;

    let compression = preload;
    if (air) {
      compression = clamp01(0.22 + airTuck * 0.48 + anticipation * 0.16);
    }
    if (backflip) {
      // Compress aggressively after takeoff, keep the tuck through the center
      // of the flip, then open the rider before touchdown to spot the landing.
      compression = Math.max(
        compression,
        clamp01(0.42 + flipTuck * 0.46 - flipOpen * 0.22),
      );
    }
    if (aerialCrouch > 0) {
      compression = Math.max(compression, 0.62 + aerialCrouch * 0.36);
    }
    compression = clamp01(
      compression
      + pump * 0.12
      + landing * 0.38 * landingScale
      + bail * 0.16
      + recovery * 0.06,
    );
    if (handPlant) compression = THREE.MathUtils.lerp(0.46, 0.9584, plantHold);

    const asymmetry = sketchy * 0.18 * wallSide * facingSign;
    const bailLean = bail * wallSide * facingSign;
    const landingRecoil = heavy * 0.18 + bail * 0.34;
    const airCounter = air
      ? (Number(state.turnDirection) || 1) * (0.07 + airTuck * 0.09)
      : 0;
    const torsoCounter = handPlant
      ? 0.12 + plantHold * 0.12
      : backflip
        ? 0.14 + flipTuck * 0.18 - flipOpen * 0.06
        : kickTurn
          ? 0.2 + secondaryLag
          : 0.12 + speed * 0.05 + airCounter + secondaryLag;

    const neutralArm = 0.58;
    const airArm = neutralArm + 0.24 * (1 - anticipation) + 0.08 * airTuck;
    const landArm = landing * (0.08 + heavy * 0.18);
    const handPlantFreeArm = THREE.MathUtils.lerp(0.92, 1.3068, plantHold);
    let leftArmBalance = air ? airArm : neutralArm + landArm;
    let rightArmBalance = leftArmBalance;
    if (sketchy > 0) {
      leftArmBalance += asymmetry * 0.8;
      rightArmBalance -= asymmetry * 0.8;
    }
    if (bail > 0) {
      // Arms catch balance asymmetrically while feet remain planted.
      const bailArmReaction = 0.34 * bail;
      leftArmBalance += bailArmReaction + bailLean * 0.12;
      rightArmBalance += bailArmReaction - bailLean * 0.12;
    }
    if (handPlant) {
      // The near arm anticipates support; the free arm folds down with the tuck.
      // This identity is latched before inversion, including fakie approaches.
      const supportArm = 0.76 - plantHold * 0.22;
      leftArmBalance = plantHand === 'left' ? supportArm : handPlantFreeArm;
      rightArmBalance = plantHand === 'right' ? supportArm : handPlantFreeArm;
    } else if (aerialCrouch > 0) {
      const tuckArm = 1.10 + aerialCrouch * 0.22;
      leftArmBalance = tuckArm;
      rightArmBalance = tuckArm;
    } else if (ascendingPrep) {
      // Keep the Phase 3B silhouette strength while Phase 4 makes the preload
      // continuous: arms stay clearly down near the knees for the whole ascent.
      const prepArm = 1.15 + preload * 0.15;
      leftArmBalance = Math.max(leftArmBalance, prepArm);
      rightArmBalance = Math.max(rightArmBalance, prepArm);
    }

    const forearmDrop = handPlant
      ? 0.08
      : aerialCrouch > 0
        ? 0.28 + aerialCrouch * 0.18
        : air
          ? 0.05 + anticipation * 0.08
          : ascendingPrep
            ? Math.max(0.3 + preload * 0.12, 0.1 + landing * 0.12 + heavy * 0.08)
            : 0.1 + landing * 0.12 + heavy * 0.08;

    Object.assign(this.pose, {
      stance: this.stance,
      facingSign,
      ascendingPrep,
      aerialCrouch,
      torsoForwardLean: aerialCrouch * 0.42,
      compression,
      hipFlex: handPlant
        ? THREE.MathUtils.lerp(0.10 + 0.46 * 0.12, 0.28 + 0.94 * 0.36, plantHold)
        : aerialCrouch > 0
          ? 0.28 + aerialCrouch * 0.36
          : 0.07 + compression * 0.18 + landingRecoil * 0.22,
      kneeFlex: handPlant
        ? THREE.MathUtils.lerp(0.48 + 0.46 * 0.28, 1.18 + 0.94 * 0.76, plantHold)
        : aerialCrouch > 0
          ? 1.18 + aerialCrouch * 0.76
          : Math.min(
            1.02,
            0.36
              + compression * 0.5
              + landingRecoil * 0.22
              + (ascendingPrep ? 0.36 : 0),
          ),
      ankleFlex: handPlant
        ? -0.04
        : backflip
          ? -0.08 - compression * 0.06 + flipOpen * 0.035
          : -0.08 - compression * 0.075 + anticipation * 0.035,
      torsoCounter,
      torsoBalanceZ:
        handPlant
          ? -wallSide * plantFacingSign * (0.04 + plantHold * 0.08)
          : -surfaceAngle * (air ? 0.12 : 0.42) * facingSign
            + asymmetry
            + bailLean * 0.16
            - wallSide * flipTuck * 0.035,
      headBalanceZ:
        handPlant
          ? -wallSide * plantFacingSign * plantHold * 0.035
          : -surfaceAngle * (air ? 0.01 : 0.04) * facingSign
            + asymmetry * 0.28
            - bailLean * 0.07
            + wallSide * flipOpen * 0.035,
      // Airborne gaze opens toward the expected landing wall; on touchdown it
      // returns toward travel instead of snapping with the torso.
      headLook: handPlant
        ? 0.22 + plantHold * 0.16
        : backflip
          ? 0.22 + flipOpen * 0.34
          : air
            ? 0.36 + anticipation * 0.18
            : 0.18 + speed * 0.04 + recovery * 0.05,
      armBalance: (leftArmBalance + rightArmBalance) * 0.5,
      leftArmBalance,
      rightArmBalance,
      forearmDrop,
      leftForearmDrop: handPlant
        ? (plantHand === 'left' ? 0.07 : THREE.MathUtils.lerp(0.20, 0.28 + 0.94 * 0.18, plantHold))
        : forearmDrop + Math.max(0, asymmetry) * 0.3,
      rightForearmDrop: handPlant
        ? (plantHand === 'right' ? 0.07 : THREE.MathUtils.lerp(0.20, 0.28 + 0.94 * 0.18, plantHold))
        : forearmDrop + Math.max(0, -asymmetry) * 0.3,
      armLag: secondaryLag,
      torsoSettle: recovery * 0.08 - heavy * 0.11 - bail * 0.08,
      airborne: Boolean(state.airborne),
    });
    return this.pose;
  }
}
