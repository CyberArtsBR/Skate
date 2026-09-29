export const PHASE4_GAMEPLAY_CONFIG = Object.freeze({
  launch: Object.freeze({
    thresholdSpeed: 1.2,
    visiblePopVelocity: 0.8,
    speedForMaximumVelocity: 22,
    maximumVerticalVelocity: 38,
  }),
  gravity: Object.freeze({
    downhillScale: 1.08,
    uphillScale: 1.35,
  }),
  pumping: Object.freeze({
    acceleration: 10.2,
    wrongPenaltyAcceleration: 0.6,
    ratingMultipliers: Object.freeze({
      PERFECT: 1.2,
      GOOD: 1.05,
      WEAK: 0.82,
      EARLY: 0.68,
      LATE: 0.68,
      WRONG: -0.35,
    }),
    rhythmBoostPerfect: 0.04,
    rhythmBoostGood: 0.026,
    rhythmBoostWeak: 0.012,
    rhythmBoostPenalty: 0.018,
    rhythmBoostMax: 0.18,
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
    doubleMinimumLaunchVelocity: 30,
  }),
  landing: Object.freeze({
    activeSeconds: 0.28,
    // High-air landings can carry ~38 units/s vertically. A correctly timed
    // return should remain landable; rotation/flip timing is the primary bail
    // criterion for the new 540/720/900 and backflip system.
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
