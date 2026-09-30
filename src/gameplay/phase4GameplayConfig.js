export const PHASE4_GAMEPLAY_CONFIG = Object.freeze({
  launch: Object.freeze({
    thresholdSpeed: 1.2,
    // Continuous V9 launch: exactly zero at threshold, then eased upward.
    visiblePopVelocity: 0,
    speedForMaximumVelocity: 22,
    maximumVerticalVelocity: 27,
  }),
  gravity: Object.freeze({
    downhillScale: 1.08,
    uphillScale: 1.35,
  }),
  pumping: Object.freeze({
    acceleration: 8.2,
    wrongPenaltyAcceleration: 0.9,
    ratingMultipliers: Object.freeze({
      PERFECT: 1.0,
      GOOD: 0.84,
      WEAK: 0.55,
      EARLY: 0.18,
      LATE: 0.18,
      WRONG: -0.35,
    }),
    rhythmBoostPerfect: 0.027,
    rhythmBoostGood: 0.016,
    rhythmBoostWeak: 0.0055,
    rhythmBoostPenalty: 0.02,
    rhythmBoostMax: 0.085,
    lowEnergyRecovery: Object.freeze({
      // Low-energy pumping must remain playable instead of falling into a
      // dead-zone below the normal cruising speed. Correctly timed pumping is
      // still required; this only strengthens recovery while energy is low.
      referenceSpeed: 4.8,
      minimumSpeed: 0.05,
      acceleration: 3.8,
      eligibleRatings: Object.freeze(['PERFECT', 'GOOD', 'WEAK']),
    }),
  }),
  aerial: Object.freeze({
    // V14 deliberately slows aerial turning and caps the highest valid turn at
    // 720. The 720 remains achievable on a maximum-energy launch, but 900 is
    // no longer a valid or reachable scored target.
    rotationDegreesPerSecond: 600,
    v9RotationDegreesPerSecond: 720,
    targetStepDegrees: 180,
    maximumDegrees: 720,
    validErrorDegrees: 48,
    hardOverrunDegrees: 72,
    idealErrorDegrees: 12,
    validMinDegrees: 132,
    idealMinDegrees: 168,
    idealMaxDegrees: 192,
    validMaxDegrees: 228,
    overturnDegrees: 792,
  }),
  backflip: Object.freeze({
    rotationDegreesPerSecond: 500,
    v9RotationDegreesPerSecond: 720,
    singleDegrees: 360,
    doubleDegrees: 720,
    validErrorDegrees: 42,
    hardOverrunDegrees: 66,
    doubleMinimumLaunchVelocity: 22,
  }),
  landing: Object.freeze({
    activeSeconds: 0.28,
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
    bailMomentumRetention: 0.90,
    pumpLockSeconds: 0.18,
    recoveryPumpAccelerationMultiplier: 1.5,
    recoveryMinimumPumpMultiplier: 0.55,
    recoveryWrongPumpPenaltyMultiplier: 0.35,
    recoveryPumpMinimumSpeed: 0.20,
    technicalBounceSpeed: 2.4,
  }),
  surfaceTricks: Object.freeze({
    handPlantMinimumHoldSeconds: 1 / 120,
    handPlantIdealHoldSeconds: 0.28,
    handPlantMaximumQualityHoldSeconds: 0.52,
    kickTurnBufferSeconds: 0.13,
  }),
});
