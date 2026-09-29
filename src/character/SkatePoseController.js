import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);

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
    const ascending = state.ascending ? 1 : 0;
    const descending = state.descending ? 1 : 0;
    const surfaceAngle = THREE.MathUtils.clamp(
      Number(state.surfaceAngle) || 0,
      -1.25,
      1.25,
    );
    const facingBack = Math.cos(Number(state.facingYaw) || 0) < 0;
    const facingSign = facingBack ? -1 : 1;
    const handPlant = state.trickVisualActive && state.trickType === 'hand-plant';
    const ascendingPrep = Boolean(
      state.rampAscending
      && !air
      && !state.trickVisualActive
      && !handPlant
    );
    const landingScale = state.landingQuality === 'hard'
      ? 1.2
      : state.landingQuality === 'rough' ? 1.08 : 1;

    // Ascending the wall is now an immediate preload: knees compress and both
    // arms come down near the knees, like preparing to pop off the coping.
    const compression = ascendingPrep
      ? clamp01(0.84 + pump * 0.10 + speed * 0.06)
      : clamp01(
        0.28
        + pump * 0.42
        + landing * 0.34 * landingScale
        + descending * 0.08
        + air * 0.05,
      );

    Object.assign(this.pose, {
      stance: this.stance,
      facingSign,
      ascendingPrep,
      compression,
      hipFlex: handPlant
        ? 0.03
        : ascendingPrep ? 0.28 + compression * 0.08 : 0.07 + compression * 0.16,
      kneeFlex: handPlant
        ? 0.22
        : ascendingPrep ? 0.94 + compression * 0.20 : 0.38 + compression * 0.42,
      ankleFlex: handPlant
        ? -0.03
        : ascendingPrep ? -0.19 : -0.08 - compression * 0.07,
      torsoCounter: handPlant
        ? 0.04
        : ascendingPrep ? 0.025 : 0.12 + speed * 0.05 - landing * 0.04,
      torsoBalanceZ: -surfaceAngle * 0.56 * facingSign,
      headBalanceZ: -surfaceAngle * 0.045 * facingSign,
      headLook: handPlant
        ? 0.08
        : ascendingPrep ? 0.10 : 0.18 + speed * 0.03,
      // On CC-style rigs, larger signed Z rotation lowers the arms from the
      // rest/T-pose. Keep the local side signs stable when fakie; the 180° root
      // yaw already mirrors them on screen. This avoids the previous "both arms
      // up" fakie pose.
      armBalance: handPlant
        ? 1.0
        : ascendingPrep ? 1.22 : 0.58 + air * 0.08 + landing * 0.06,
      forearmDrop: ascendingPrep ? 0.32 : 0.11,
      airborne: Boolean(state.airborne),
    });
    return this.pose;
  }
}
