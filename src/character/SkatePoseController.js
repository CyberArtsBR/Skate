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
    const surfaceAngle = THREE.MathUtils.clamp(Number(state.surfaceAngle) || 0, -1.25, 1.25);
    const landingScale = state.landingQuality === 'hard'
      ? 1.2
      : state.landingQuality === 'rough' ? 1.08 : 1;

    const compression = clamp01(
      0.28
      + pump * 0.42
      + landing * 0.34 * landingScale
      + descending * 0.08
      + air * 0.05
      - ascending * 0.08,
    );

    Object.assign(this.pose, {
      stance: this.stance,
      compression,
      hipFlex: 0.07 + compression * 0.16,
      kneeFlex: 0.38 + compression * 0.42,
      ankleFlex: -0.08 - compression * 0.07,
      torsoCounter: 0.12 + speed * 0.05 - landing * 0.04,
      torsoBalanceZ: -surfaceAngle * 0.56,
      headBalanceZ: -surfaceAngle * 0.12,
      headLook: 0.42 + speed * 0.08,
      armBalance: 0.58 + air * 0.08 + landing * 0.06,
      airborne: Boolean(state.airborne),
    });
    return this.pose;
  }
}
