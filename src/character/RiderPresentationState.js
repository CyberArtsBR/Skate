const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export const DEFAULT_RIDER_PRESENTATION_STATE = Object.freeze({
  pipeX: 0,
  tangentVelocity: 0,
  ascending: false,
  descending: false,
  pumpCompression: 0,
  airborne: false,
  verticalVelocity: 0,
  surfaceAngle: 0,
  rotation: 0,
  landing: 0,
  landingQuality: 'none',
  trickType: null,
  trickProgress: 0,
  speedNormalized: 0,
});

export function createRiderPresentationState(overrides = {}) {
  const state = { ...DEFAULT_RIDER_PRESENTATION_STATE, ...overrides };
  state.pipeX = Number(state.pipeX) || 0;
  state.tangentVelocity = Number(state.tangentVelocity) || 0;
  state.verticalVelocity = Number(state.verticalVelocity) || 0;
  state.surfaceAngle = Number(state.surfaceAngle) || 0;
  state.rotation = Number(state.rotation) || 0;
  state.ascending = Boolean(state.ascending);
  state.descending = Boolean(state.descending);
  state.airborne = Boolean(state.airborne);
  state.pumpCompression = clamp01(state.pumpCompression);
  state.landing = clamp01(state.landing);
  state.trickProgress = clamp01(state.trickProgress);
  state.speedNormalized = clamp01(state.speedNormalized);
  state.landingQuality = String(state.landingQuality || 'none');
  state.trickType = state.trickType ? String(state.trickType) : null;
  return state;
}
