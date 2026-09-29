import { SKATE_ANIMATION_STATE } from './SkateAnimationState.js';

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

function sanitizeWorldPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z ?? 0);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

export const DEFAULT_RIDER_PRESENTATION_STATE = Object.freeze({
  time: 0,
  pipeX: 0,
  tangentVelocity: 0,
  ascending: false,
  descending: false,
  rampAscending: false,
  pumpCompression: 0,
  airborne: false,
  verticalVelocity: 0,
  worldY: null,
  surfaceAngle: 0,
  wallFraction: 0,
  distanceFromCoping: 1,
  wallSide: 0,
  rotation: 0,
  facingYaw: 0,
  turnDirection: 1,
  trickRoll: 0,
  trickPitch: 0,
  trickOffsetX: 0,
  trickOffsetY: 0,
  trickVisualActive: false,
  dropInRoll: 0,
  dropInProgress: 1,
  landing: 0,
  landingQuality: 'none',
  landingAnticipation: 0,
  recovery: 0,
  trickType: null,
  trickProgress: 0,
  speedNormalized: 0,
  preloadCompression: 0.3,
  airHeight: 0,
  airTuck: 0,
  footIKWeight: 1,
  secondaryLag: 0,
  animationState: SKATE_ANIMATION_STATE.READY,
  animationBlend: 1,
  stateTime: 0,
  copingWorldPoint: null,
});

export function createRiderPresentationState(overrides = {}) {
  const state = { ...DEFAULT_RIDER_PRESENTATION_STATE, ...overrides };
  state.time = Number(state.time) || 0;
  state.pipeX = Number(state.pipeX) || 0;
  state.tangentVelocity = Number(state.tangentVelocity) || 0;
  state.verticalVelocity = Number(state.verticalVelocity) || 0;
  state.worldY = state.worldY === null || state.worldY === undefined
    ? null
    : (Number.isFinite(Number(state.worldY)) ? Number(state.worldY) : null);
  state.surfaceAngle = Number(state.surfaceAngle) || 0;
  state.wallFraction = clamp01(state.wallFraction);
  state.distanceFromCoping = clamp01(state.distanceFromCoping);
  state.wallSide = Math.sign(Number(state.wallSide) || 0);
  state.rotation = Number(state.rotation) || 0;
  state.facingYaw = Number(state.facingYaw) || 0;
  state.turnDirection = Math.sign(Number(state.turnDirection) || 1) || 1;
  state.trickRoll = Number(state.trickRoll) || 0;
  state.trickPitch = Number(state.trickPitch) || 0;
  state.trickOffsetX = Number(state.trickOffsetX) || 0;
  state.trickOffsetY = Number(state.trickOffsetY) || 0;
  state.trickVisualActive = Boolean(state.trickVisualActive);
  state.dropInRoll = Number(state.dropInRoll) || 0;
  state.dropInProgress = clamp01(state.dropInProgress);
  state.ascending = Boolean(state.ascending);
  state.descending = Boolean(state.descending);
  state.rampAscending = Boolean(state.rampAscending);
  state.airborne = Boolean(state.airborne);
  state.pumpCompression = clamp01(state.pumpCompression);
  state.landing = clamp01(state.landing);
  state.landingAnticipation = clamp01(state.landingAnticipation);
  state.recovery = clamp01(state.recovery);
  state.trickProgress = clamp01(state.trickProgress);
  state.speedNormalized = clamp01(state.speedNormalized);
  state.preloadCompression = clamp01(state.preloadCompression);
  state.airHeight = Math.max(0, Number(state.airHeight) || 0);
  state.airTuck = clamp01(state.airTuck);
  state.footIKWeight = clamp01(state.footIKWeight);
  state.secondaryLag = Math.max(-0.35, Math.min(0.35, Number(state.secondaryLag) || 0));
  state.animationBlend = clamp01(state.animationBlend);
  state.stateTime = Math.max(0, Number(state.stateTime) || 0);
  state.landingQuality = String(state.landingQuality || 'none').toLowerCase();
  state.trickType = state.trickType ? String(state.trickType) : null;
  state.animationState = String(state.animationState || SKATE_ANIMATION_STATE.READY);
  state.copingWorldPoint = sanitizeWorldPoint(state.copingWorldPoint);
  return state;
}
