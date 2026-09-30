import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class TrickPoseController {
  constructor({
    stance = 'regular',
    stanceHalfLength = 0.24,
    rearAxleX = null,
  } = {}) {
    this.stance = stance === 'goofy' ? 'goofy' : 'regular';
    this.stanceHalfLength = Math.max(0.05, Number(stanceHalfLength) || 0.24);
    this.rearPivotSource = Number.isFinite(Number(rearAxleX))
      ? 'measured-rear-axle'
      : 'stance-fallback';
    this.rearPivotX = this.rearPivotSource === 'measured-rear-axle'
      ? Number(rearAxleX)
      : (this.stance === 'goofy' ? 1 : -1) * this.stanceHalfLength;
  }

  evaluate(state = {}) {
    const progress = clamp01(state.trickProgress);
    const envelope = Math.sin(Math.PI * progress);
    const direction = Math.sign(Number(state.turnDirection) || 1) || 1;
    const drop = Number(state.dropInRoll) || 0;
    const dropFollow = smoothstep(1 - clamp01(state.dropInProgress));
    const output = {
      rearPivotX: this.rearPivotX,
      rearPivotSource: this.rearPivotSource,
      boardYaw: 0,
      boardRoll: drop,
      bodyYaw: 0,
      bodyRoll: drop * (0.32 + dropFollow * 0.18),
      bodyY: 0,
      bodyX: 0,
    };

    if (state.trickVisualActive && state.trickType === 'kick-turn') {
      // Main 180 stays on trickCarrier. Shoulders/body lead, deck follows from
      // the measured rear axle/truck pivot with a restrained nose lift.
      output.bodyYaw = direction * 0.12 * envelope;
      output.boardYaw = -direction * 0.07 * envelope;
      output.boardRoll += (this.stance === 'goofy' ? -1 : 1) * 0.18 * envelope;
      output.bodyY = -0.035 * envelope;
    } else if (state.trickVisualActive && state.trickType === 'hand-plant') {
      output.boardYaw = -direction * 0.05 * envelope;
      output.boardRoll += (Number(state.wallSide) || 1) * 0.2 * envelope;
      output.bodyYaw = direction * 0.08 * envelope;
      output.bodyY = 0.04 * envelope;
      output.bodyX = -(Number(state.wallSide) || 1) * 0.035 * envelope;
    } else if (state.airborne && state.trickType === 'backflip') {
      const tuck = Math.max(0.72, clamp01(state.airTuck));
      const side = Math.sign(Number(state.wallSide) || 0) || 1;
      const flipDirection = Math.sign(Number(state.trickRoll) || 0) || side;
      output.boardRoll += -flipDirection * 0.09 * envelope;
      output.bodyRoll = flipDirection * 0.16 * envelope;
      output.bodyY = -0.18 * tuck * (0.62 + 0.38 * envelope);
      output.bodyX = -side * 0.065 * envelope;
      output.bodyYaw = (Number(state.secondaryLag) || 0) * 0.18;
    } else if (state.airborne) {
      output.boardRoll += (this.stance === 'goofy' ? -1 : 1)
        * 0.035
        * clamp01(state.airTuck);
      output.bodyYaw = Number(state.secondaryLag) || 0;
    } else if (String(state.landingQuality || '').toLowerCase() === 'bail') {
      const bail = clamp01(state.landing);
      const side = Math.sign(Number(state.wallSide) || 0) || 1;
      output.boardYaw = side * direction * 0.035 * bail;
      output.boardRoll += side * 0.045 * bail;
      output.bodyYaw = -side * direction * 0.045 * bail;
      output.bodyRoll = -side * 0.075 * bail;
      output.bodyX = -side * 0.012 * bail;
      output.bodyY = -0.025 * bail;
    }

    return output;
  }
}
