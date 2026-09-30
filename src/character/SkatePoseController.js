import * as THREE from 'three';
import { LANDING_QUALITY } from './SkateAnimationState.js';

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
    const facingBack = Math.cos(Number(state.facingYaw) || 0) < 0;
    const facingSign = facingBack ? -1 : 1;
    const handPlant = state.trickVisualActive && state.trickType === 'hand-plant';
    const kickTurn = state.trickVisualActive && state.trickType === 'kick-turn';
    const backflip = Boolean(air && state.trickType === 'backflip');
    const trickProgress = clamp01(state.trickProgress);
    const flipTuck = backflip
      ? smoothstep(trickProgress / 0.22)
        * (1 - smoothstep((trickProgress - 0.70) / 0.30))
      : 0;
    const flipOpen = backflip
      ? smoothstep((trickProgress - 0.66) / 0.34)
      : 0;
    const airTuck = clamp01(state.airTuck);
    const anticipation = clamp01(state.landingAnticipation);
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
    compression = clamp01(
      compression
      + pump * 0.12
      + landing * 0.38 * landingScale
      + bail * 0.16
      + recovery * 0.06,
    );
    if (handPlant) compression = Math.max(0.38, compression * 0.74);

    const asymmetry = sketchy * 0.18 * wallSide * facingSign;
    const bailLean = bail * wallSide * facingSign;
    const landingRecoil = heavy * 0.18 + bail * 0.34;
    const airCounter = air
      ? (Number(state.turnDirection) || 1) * (0.07 + airTuck * 0.09)
      : 0;
    const torsoCounter = handPlant
      ? 0.22 + wallSide * 0.055
      : backflip
        ? 0.14 + flipTuck * 0.18 - flipOpen * 0.06
        : kickTurn
          ? 0.2 + secondaryLag
          : 0.12 + speed * 0.05 + airCounter + secondaryLag;

    const neutralArm = 0.58;
    const airArm = neutralArm + 0.24 * (1 - anticipation) + 0.08 * airTuck;
    const landArm = landing * (0.08 + heavy * 0.18);
    const handPlantFreeArm = 1.08;
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
      // The IK-selected plant arm will be solved to the coping afterward. Keep
      // the unsolved arm open as a visible counterbalance.
      leftArmBalance = handPlantFreeArm;
      rightArmBalance = handPlantFreeArm;
    } else if (backflip) {
      const flipArm = 0.72 + flipTuck * 0.38 - flipOpen * 0.20;
      leftArmBalance = Math.max(leftArmBalance, flipArm);
      rightArmBalance = Math.max(rightArmBalance, flipArm);
    } else if (ascendingPrep) {
      // Keep the Phase 3B silhouette strength while Phase 4 makes the preload
      // continuous: arms stay clearly down near the knees for the whole ascent.
      const prepArm = 1.15 + preload * 0.15;
      leftArmBalance = Math.max(leftArmBalance, prepArm);
      rightArmBalance = Math.max(rightArmBalance, prepArm);
    }

    const forearmDrop = handPlant
      ? 0.08
      : backflip
        ? 0.10 + flipTuck * 0.24 - flipOpen * 0.06
        : air
          ? 0.05 + anticipation * 0.08
          : ascendingPrep
            ? Math.max(0.3 + preload * 0.12, 0.1 + landing * 0.12 + heavy * 0.08)
            : 0.1 + landing * 0.12 + heavy * 0.08;

    Object.assign(this.pose, {
      stance: this.stance,
      facingSign,
      ascendingPrep,
      compression,
      hipFlex: handPlant
        ? 0.10 + compression * 0.12
        : backflip
          ? 0.12 + compression * 0.28 + flipTuck * 0.20 - flipOpen * 0.08
          : 0.07 + compression * 0.18 + landingRecoil * 0.22,
      kneeFlex: handPlant
        ? 0.48 + compression * 0.28
        : backflip
          ? Math.min(1.08, 0.42 + compression * 0.48 + flipTuck * 0.20 - flipOpen * 0.08)
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
        -surfaceAngle * 0.52 * facingSign
        + asymmetry
        + bailLean * 0.16
        - wallSide * (handPlant ? 0.19 : 0)
        - wallSide * flipTuck * 0.035,
      headBalanceZ:
        -surfaceAngle * 0.04 * facingSign
        + asymmetry * 0.28
        - bailLean * 0.07
        + wallSide * flipOpen * 0.035,
      // Airborne gaze opens toward the expected landing wall; on touchdown it
      // returns toward travel instead of snapping with the torso.
      headLook: handPlant
        ? 0.30
        : backflip
          ? 0.22 + flipOpen * 0.34
          : air
            ? 0.36 + anticipation * 0.18
            : 0.18 + speed * 0.04 + recovery * 0.05,
      armBalance: (leftArmBalance + rightArmBalance) * 0.5,
      leftArmBalance,
      rightArmBalance,
      forearmDrop,
      leftForearmDrop: forearmDrop + Math.max(0, asymmetry) * 0.3,
      rightForearmDrop: forearmDrop + Math.max(0, -asymmetry) * 0.3,
      armLag: secondaryLag,
      torsoSettle: recovery * 0.08 - heavy * 0.11 - bail * 0.08,
      airborne: Boolean(state.airborne),
    });
    return this.pose;
  }
}