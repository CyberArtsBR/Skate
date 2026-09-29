import { PHASE4_GAMEPLAY_CONFIG } from './phase4GameplayConfig.js';

export const LANDING_QUALITIES = Object.freeze({
  PERFECT: 'PERFECT',
  CLEAN: 'CLEAN',
  SKETCHY: 'SKETCHY',
  HEAVY: 'HEAVY',
  BAIL: 'BAIL',
});

const RESULTS = Object.freeze({
  PERFECT: Object.freeze({ scoreMultiplier: 1.2, momentumRetention: 1.0 }),
  CLEAN: Object.freeze({ scoreMultiplier: 1.0, momentumRetention: 0.94 }),
  SKETCHY: Object.freeze({ scoreMultiplier: 0.78, momentumRetention: 0.82 }),
  HEAVY: Object.freeze({ scoreMultiplier: 0.5, momentumRetention: 0.65 }),
  BAIL: Object.freeze({ scoreMultiplier: 0, momentumRetention: 0.35 }),
});

export function evaluateLanding({
  attemptedTrick = false,
  trickSucceeded = true,
  rotationDegrees = 180,
  impactSpeed = 0,
  returnDirectionValid = true,
  failedManeuver = false,
}) {
  const cfg = PHASE4_GAMEPLAY_CONFIG.landing;
  const impact = Math.max(0, Number(impactSpeed) || 0);
  const rotationError = attemptedTrick
    ? Math.abs((Number(rotationDegrees) || 0) - 180)
    : 0;

  let quality;
  if (
    failedManeuver
    || !returnDirectionValid
    || !trickSucceeded
    || impact > cfg.impactHeavyMax
    || rotationError > cfg.rotationHeavyError
  ) {
    quality = LANDING_QUALITIES.BAIL;
  } else if (
    impact > cfg.impactSketchyMax
    || rotationError > cfg.rotationSketchyError
  ) {
    quality = LANDING_QUALITIES.HEAVY;
  } else if (
    impact > cfg.impactCleanMax
    || rotationError > cfg.rotationCleanError
  ) {
    quality = LANDING_QUALITIES.SKETCHY;
  } else if (
    impact > cfg.impactPerfectMax
    || rotationError > cfg.rotationPerfectError
  ) {
    quality = LANDING_QUALITIES.CLEAN;
  } else {
    quality = LANDING_QUALITIES.PERFECT;
  }

  const result = RESULTS[quality];
  return {
    quality,
    impact,
    rotationError,
    scoreMultiplier: result.scoreMultiplier,
    momentumRetention: result.momentumRetention,
  };
}
