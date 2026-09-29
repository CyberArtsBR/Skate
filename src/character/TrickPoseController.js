import * as THREE from 'three';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export class TrickPoseController {
  constructor({ stance = 'regular', stanceHalfLength = 0.24 } = {}) {
    this.stance = stance === 'goofy' ? 'goofy' : 'regular';
    this.stanceHalfLength = Math.max(0.05, Number(stanceHalfLength) || 0.24);
    this.rearPivotX = (this.stance === 'goofy' ? 1 : -1) * this.stanceHalfLength;
  }

  evaluate(state = {}) {
    const progress = clamp01(state.trickProgress);
    const envelope = Math.sin(Math.PI * progress);
    const direction = Math.sign(Number(state.turnDirection) || 1) || 1;
    const drop = Number(state.dropInRoll) || 0;
    const dropFollow = smoothstep(1 - clamp01(state.dropInProgress));
    const output = {
      rearPivotX: this.rearPivotX,
      boardYaw: 0,
      boardRoll: drop,
      bodyYaw: 0,
      bodyRoll: drop * (0.32 + dropFollow * 0.18),
      bodyY: 0,
      bodyX: 0,
    };

    if (state.trickVisualActive && state.trickType === 'kick-turn') {
      // Main 180 stays on trickCarrier. Shoulders/body lead, deck follows from
      // a weighted rear-truck pivot with a restrained nose lift.
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
    } else if (state.airborne) {
      output.boardRoll += (this.stance === 'goofy' ? -1 : 1)
        * 0.035
        * clamp01(state.airTuck);
      output.bodyYaw = Number(state.secondaryLag) || 0;
    } else if (String(state.landingQuality || '').toLowerCase() === 'bail') {
      // Presentation-only separation for a failed landing. The authoritative
      // contact root remains untouched while body and deck visibly lose sync,
      // then return to neutral as the landing envelope decays.
      const bail = clamp01(state.landing);
      const side = Math.sign(Number(state.wallSide) || 0) || 1;
      output.boardYaw = side * direction * 0.2 * bail;
      output.boardRoll += side * 0.15 * bail;
      output.bodyYaw = -side * direction * 0.24 * bail;
      output.bodyRoll = -side * 0.22 * bail;
      output.bodyX = -side * 0.07 * bail;
      output.bodyY = -0.06 * bail;
    }

    return output;
  }
}
