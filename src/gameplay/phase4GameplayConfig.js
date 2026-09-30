export const PHASE4_GAMEPLAY_CONFIG = Object.freeze({
  launch: Object.freeze({
    thresholdSpeed: 1.2,
    // V9 removes the 1.19 -> 1.20 launch cliff. computeLaunchVelocity already
    // uses smoothstep from threshold to maximum speed; starting that curve at
    // zero makes the takeoff continuous while preserving momentum-earned air.
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
      referenceSpeed: 3.2,
      minimumSpeed: 0.18,
      acceleration: 2.1,
      eligibleRatings: Object.freeze(['PERFECT', 'GOOD', 'WEAK']),
    }),
  }),
  aerial: Object.freeze({
    // Maximum-air airtime is ~1.08 simulation seconds. 900 deg/s makes 900
    // mechanically reachable only when the player has earned near-maximum air,
    // while reversible steering preserves correction authority for lower tiers.
    rotationDegreesPerSecond: 900,
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
    // A double still requires the existing high-launch gate. At 720 deg/s the
    // full 720 fits inside maximum-air airtime without increasing air height.
    rotationDegreesPerSecond: 720,
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
    bailMomentumRetention: 0.90,

    // A bail should interrupt the rider briefly, not disable pumping for the
    // entire recovery animation. Re-enable pump input quickly and give it a
    // temporary recovery assist so the player can rebuild amplitude.
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
