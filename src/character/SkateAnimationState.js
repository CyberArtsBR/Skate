export const SKATE_ANIMATION_STATE = Object.freeze({
  READY: 'READY',
  DROP_IN: 'DROP_IN',
  DESCENT: 'DESCENT',
  BOTTOM_COMPRESSION: 'BOTTOM_COMPRESSION',
  EXTEND: 'EXTEND',
  UP_TRANSITION: 'UP_TRANSITION',
  COPING_PREP: 'COPING_PREP',
  TAKEOFF: 'TAKEOFF',
  AIR: 'AIR',
  KICK_TURN: 'KICK_TURN',
  HAND_PLANT: 'HAND_PLANT',
  AERIAL_180: 'AERIAL_180',
  LAND: 'LAND',
  HEAVY_LAND: 'HEAVY_LAND',
  BAIL: 'BAIL',
  RECOVER: 'RECOVER',
});

export const LANDING_QUALITY = Object.freeze({
  NONE: 'none',
  PERFECT: 'perfect',
  CLEAN: 'clean',
  SKETCHY: 'sketchy',
  HEAVY: 'heavy',
  BAIL: 'bail',
});

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function normalizeLandingQuality(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['perfect'].includes(normalized)) return LANDING_QUALITY.PERFECT;
  if (['clean', 'good', 'normal'].includes(normalized)) return LANDING_QUALITY.CLEAN;
  if (['sketchy', 'rough', 'unstable'].includes(normalized)) return LANDING_QUALITY.SKETCHY;
  if (['heavy', 'hard', 'slam'].includes(normalized)) return LANDING_QUALITY.HEAVY;
  if (['bail', 'failed', 'fall'].includes(normalized)) return LANDING_QUALITY.BAIL;
  return LANDING_QUALITY.NONE;
}

export function resolveSkateAnimationState(state = {}) {
  const landing = clamp01(state.landing);
  const quality = normalizeLandingQuality(state.landingQuality);
  const trickType = String(state.trickType || '');
  const wallFraction = clamp01(state.wallFraction);
  const crashStage = String(state.crashStage || '').toUpperCase();

  // V9 exposes authoritative crash lifecycle directly to the procedural
  // animation layer. Early crash stages read as a bail/impact; late stages
  // transition into recovery instead of depending on a stale landingQuality.
  if (state.crashActive) {
    if (['RECOVER', 'RETURN_TO_RIDING'].includes(crashStage)) {
      return SKATE_ANIMATION_STATE.RECOVER;
    }
    return SKATE_ANIMATION_STATE.BAIL;
  }

  if (quality === LANDING_QUALITY.BAIL) return SKATE_ANIMATION_STATE.BAIL;
  if (state.trickVisualActive && trickType === 'hand-plant') {
    return SKATE_ANIMATION_STATE.HAND_PLANT;
  }
  if (state.trickVisualActive && trickType === 'kick-turn') {
    return SKATE_ANIMATION_STATE.KICK_TURN;
  }
  if (state.airborne && trickType === 'aerial-turn') {
    return SKATE_ANIMATION_STATE.AERIAL_180;
  }
  if (landing > 0.04) {
    return quality === LANDING_QUALITY.HEAVY
      ? SKATE_ANIMATION_STATE.HEAVY_LAND
      : SKATE_ANIMATION_STATE.LAND;
  }
  if (clamp01(state.recovery) > 0.05) return SKATE_ANIMATION_STATE.RECOVER;

  if (Number(state.dropInProgress) < 0.999) {
    return Number(state.dropInProgress) < 0.12
      ? SKATE_ANIMATION_STATE.READY
      : SKATE_ANIMATION_STATE.DROP_IN;
  }

  if (state.airborne) return SKATE_ANIMATION_STATE.AIR;

  if (state.rampAscending) {
    if (wallFraction >= 0.94) return SKATE_ANIMATION_STATE.TAKEOFF;
    if (wallFraction >= 0.78) return SKATE_ANIMATION_STATE.COPING_PREP;
    if (wallFraction >= 0.28) return SKATE_ANIMATION_STATE.UP_TRANSITION;
    return SKATE_ANIMATION_STATE.EXTEND;
  }

  if (state.descending) {
    return wallFraction <= 0.16
      ? SKATE_ANIMATION_STATE.BOTTOM_COMPRESSION
      : SKATE_ANIMATION_STATE.DESCENT;
  }

  return wallFraction <= 0.12
    ? SKATE_ANIMATION_STATE.BOTTOM_COMPRESSION
    : SKATE_ANIMATION_STATE.DESCENT;
}
