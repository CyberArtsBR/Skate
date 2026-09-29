const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export const DEFAULT_RIDER_PRESENTATION_STATE = Object.freeze({
  pipeX: 0,
  tangentVelocity: 0,
  ascending: false,
  descending: false,
  pumpCompression: 0,
  airborne: false,
  verticalVelocity: 0,
  worldY: null,
  surfaceAngle: 0,
  rotation: 0,
  facingYaw: 0,
  trickRoll: 0,
  trickOffsetX: 0,
  trickOffsetY: 0,
  trickVisualActive: false,
  dropInRoll: 0,
  dropInProgress: 1,
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
  state.worldY = Number.isFinite(Number(state.worldY)) ? Number(state.worldY) : null;
  state.surfaceAngle = Number(state.surfaceAngle) || 0;
  state.rotation = Number(state.rotation) || 0;
  state.facingYaw = Number(state.facingYaw) || 0;
  state.trickRoll = Number(state.trickRoll) || 0;
  state.trickOffsetX = Number(state.trickOffsetX) || 0;
  state.trickOffsetY = Number(state.trickOffsetY) || 0;
  state.trickVisualActive = Boolean(state.trickVisualActive);
  state.dropInRoll = Number(state.dropInRoll) || 0;
  state.dropInProgress = clamp01(state.dropInProgress);
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
