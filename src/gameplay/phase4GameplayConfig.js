export const PHASE4_GAMEPLAY_CONFIG = Object.freeze({
  launch: Object.freeze({
    thresholdSpeed: 1.2,
    visiblePopVelocity: 5.0,
    speedForMaximumVelocity: 22,
    maximumVerticalVelocity: 27,
  }),
  gravity: Object.freeze({
    downhillScale: 1.08,
    uphillScale: 1.35,
  }),
  pumping: Object.freeze({
    acceleration: 8.0,
    wrongPenaltyAcceleration: 1.25,
    ratingMultipliers: Object.freeze({
      PERFECT: 1.0,
      GOOD: 0.82,
      WEAK: 0.52,
      EARLY: 0.16,
      LATE: 0.16,
      WRONG: -0.35,
    }),
    rhythmBoostPerfect: 0.025,
    rhythmBoostGood: 0.014,
    rhythmBoostWeak: 0.005,
    rhythmBoostPenalty: 0.025,
    rhythmBoostMax: 0.08,
  }),
  aerial: Object.freeze({
    rotationDegreesPerSecond: 600,
    targetStepDegrees: 180,
    maximumDegrees: 900,
    validErrorDegrees: 48,
    hardOverrunDegrees: 72,
    idealErrorDegrees: 12,
    validMinDegrees: 132,
    idealMinDegrees: 168,
    idealMaxDegrees: 192,
    validMaxDegrees: 228,
    overturnDegrees: 972,
  }),
  backflip: Object.freeze({
    rotationDegreesPerSecond: 500,
    singleDegrees: 360,
    doubleDegrees: 720,
    validErrorDegrees: 42,
    hardOverrunDegrees: 66,
    doubleMinimumLaunchVelocity: 22,
  }),
  landing: Object.freeze({
    activeSeconds: 0.28,
    // The reduced-height V7 air model caps around 27 units/s vertically.
    // Correctly timed returns remain landable; rotation/flip timing stays the
    // primary bail criterion for 540/720/900 and backflip attempts.
    impactPerfectMax: 24,
    impactCleanMax: 40,
    impactSketchyMax: 46,
    impactHeavyMax: 52,
    rotationPerfectError: 14,
    rotationCleanError: 28,
    rotationSketchyError: 42,
    rotationHeavyError: 58,
  }),
  crash: Object.freeze({
    recoverySeconds: 1.1,
    bailMomentumRetention: 0.52,
    technicalBounceSpeed: 2.4,
  }),
  surfaceTricks: Object.freeze({
    handPlantMinimumHoldSeconds: 1 / 120,
    handPlantIdealHoldSeconds: 0.28,
    handPlantMaximumQualityHoldSeconds: 0.52,
  }),
});
