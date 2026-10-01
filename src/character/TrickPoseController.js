import * as THREE from 'three';
import { HANDPLANT_CLEARANCE as PLANT_PHASES } from '../gameplay/CrashPresentationTuning.js';

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function phaseEnvelope(progress, enterEnd, exitStart) {
  const t = clamp01(progress);
  const enter = smoothstep(t / Math.max(0.001, enterEnd));
  const exit = t <= exitStart
    ? 1
    : 1 - smoothstep((t - exitStart) / Math.max(0.001, 1 - exitStart));
  return clamp01(enter * exit);
}

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
      const side = Math.sign(Number(state.wallSide) || 0) || 1;
      const plant = phaseEnvelope(progress, PLANT_PHASES.enterEnd, PLANT_PHASES.releaseStart);
      const facing = Number(state.plantFacingSign) < 0 ? -1 : 1;
      const hand = state.selectedPlantHand === 'left' ? -1 : 1;
      const scale = this.stanceHalfLength / 0.24;

      // The common carrier supplies the actual coping pivot and inversion.
      // Small secondary offsets stack the torso over the supporting shoulder
      // without introducing a second flip or pulling the feet off the deck.
      output.boardYaw = -direction * 0.022 * plant;
      output.boardRoll += side * facing * 0.055 * plant;
      output.bodyYaw = (hand * 0.055 + direction * 0.025) * plant;
      output.bodyRoll = -side * facing * 0.035 * plant;
      output.bodyY = 0.025 * scale * plant;
      output.bodyX = -side * facing * 0.018 * scale * plant;
    } else if (state.airborne && state.trickType === 'backflip') {
      const side = Math.sign(Number(state.wallSide) || 0) || 1;
      const flipDirection = Math.sign(Number(state.trickRoll) || 0) || side;
      const tuck = phaseEnvelope(progress, 0.2, 0.7);
      const open = smoothstep((progress - 0.68) / 0.32);
      const takeoff = 1 - smoothstep(progress / 0.16);

      // Main 360/720 rotation remains on trickCarrier. These are secondary
      // body/deck offsets that create a readable takeoff -> tuck -> spot-landing
      // sequence instead of rotating a rigid rider-and-board silhouette.
      output.boardRoll += -flipDirection * (0.055 * envelope + 0.055 * tuck);
      output.bodyRoll = flipDirection * (0.11 * envelope + 0.12 * tuck);
      output.bodyY = -0.08 * takeoff - 0.24 * tuck + 0.035 * open;
      output.bodyX = -side * (0.035 * envelope + 0.045 * tuck - 0.02 * open);
      output.bodyYaw = (Number(state.secondaryLag) || 0) * 0.16
        - flipDirection * 0.045 * tuck;
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
