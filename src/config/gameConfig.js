export const GAME_CONFIG = Object.freeze({
  assets: Object.freeze({
    halfpipe: '/models/halfpipe/halfpipe.glb',
    skateboard: '/models/skateboard/skateboard.glb',
    chimpion: '/models/characters/The%20Heretic.glb',
    background: '/images/backgrounds/halfpipe-chimpions-merch.jpg',
  }),
  renderer: Object.freeze({
    maxPixelRatio: 2,
    clearColor: 0x000000,
    shadowMapSize: 2048,
    environmentIntensity: 0.84,
    copingGlow: Object.freeze({
      // Keep the glow clearly visible but restrained so it never blooms over
      // the rider or washes out the authored ramp materials.
      emissiveIntensity: 0.42,
      innerExpansion: 0.012,
      innerOpacity: 0.024,
      outerExpansion: 0.026,
      outerOpacity: 0.01,
    }),
    frontMetal: Object.freeze({
      materialName: 'Material',
      metalness: 1,
      envMapIntensity: 2.4,
    }),
  }),
  skateboard: Object.freeze({
    // Keep the board deliberately substantial next to the 2.32m rider.
    // Uniform scale keeps trucks/wheels/contact geometry coherent; the deck
    // receives a small extra X extension for a full-size street/vert silhouette.
    scale: 0.155,
    deckLengthScale: 1.18,
    wheelRadius: 0.05,
    surfaceClearance: 0.18,
  }),
  rider: Object.freeze({
    targetHeight: 2.32,
    deckClearance: 0.025,
    stance: 'regular',
    stanceHalfLength: 0.24,
    footLateralOffset: 0.015,
    fakieBodyDrop: 0.065,
    fakieFootTargetDrop: 0.07,
  }),
  halfpipeProfile: Object.freeze({
    flatHalfWidth: 2.35,
    transitionWidth: 5.62,
    transitionHeight: 6.62,
    debugDepth: 8.3,
    debugVisible: false,
  }),
  passivePhysics: Object.freeze({
    fixedHz: 120,
    gravity: 52,
    linearDrag: 0.035,
    maxFrameDelta: 0.1,
    maxSubSteps: 20,
    lipInset: 0.002,
    velocityEpsilon: 0.0001,
    startTransitionFraction: 0.9992,
    initialVelocity: 0,
    presentationSpeedReference: 17,
    presentationVerticalEpsilon: 0.02,
  }),
  session: Object.freeze({
    durationSeconds: 75,
  }),
  gameplay: Object.freeze({
    // Run the authoritative motion at three-quarter real-time speed. This preserves the
    // established ramp trajectories, aerial heights and trick rules while
    // giving the player more real-world time to read and control them than the original 1.0x pace.
    motionTimeScale: 0.75,
  }),
  arcadeMotion: Object.freeze({
    downhillGravityScale: 1.12,
    uphillGravityScale: 1.6,
  }),
  pumping: Object.freeze({
    acceleration: 8.5,
    upperWallRetention: 0.75,
    minimumSpeed: 0.65,
  }),
  turning: Object.freeze({
    kickTurnMinFraction: 0.78,
    kickTurnRetention: 0.93,
    handPlantMinFraction: 0.99,
    handPlantBufferSeconds: 0.25,
    handPlantRetention: 0.9,
    aerialIdealHoldSeconds: 0.55,
    aerialCompleteSeconds: 0.14,
    aerialOverturnSeconds: 0.95,
  }),
  scoring: Object.freeze({
    kickTurn: Object.freeze({ min: 100, max: 300 }),
    handPlant: Object.freeze({ min: 400, max: 700 }),
    // Rotation tiers reward the additional airtime/risk instead of treating
    // every landed aerial as the legacy 180-point band.
    aerial180: Object.freeze({ min: 400, max: 700 }),
    aerial360: Object.freeze({ min: 750, max: 1150 }),
    aerial540: Object.freeze({ min: 1250, max: 1800 }),
    aerial720: Object.freeze({ min: 1900, max: 2700 }),
    aerial900: Object.freeze({ min: 2800, max: 4000 }),
    backflip: Object.freeze({ min: 1600, max: 2400 }),
    doubleBackflip: Object.freeze({ min: 3200, max: 5000 }),
    // Compatibility fallback for older replay/state labels.
    aerialTurn: Object.freeze({ min: 400, max: 999 }),
  }),
  trickPresentation: Object.freeze({
    dropInDuration: 0.62,
    dropInNoseLift: 0.16,
    kickTurnDuration: 0.40,
    handPlantDuration: 0.64,
    aerialTurnDuration: 0.45,
    kickTurnLift: 0.13,
    kickTurnRoll: 0.16,
    handPlantLift: 0.18,
    handPlantShift: 0.08,
    handPlantRoll: 1.48,
    aerialRoll: 0.22,
  }),
  air: Object.freeze({
    takeoffInset: 0.02,
    launchMinimumSpeed: 1.2,
    minimumVerticalVelocity: 10,
    maximumVerticalVelocity: 38,
    gravity: 50,
    launchVelocityScale: 1.18,
    landingVelocityRetention: 0.94,
  }),
  camera: Object.freeze({
    fov: 30,
    near: 0.1,
    far: 180,
    position: Object.freeze([0, 6.0, 24.5]),
    target: Object.freeze([0, 3.9, 0]),
    dynamicAirTracking: Object.freeze({
      // Keep the California Games-style camera angle and FOV fixed. Once the
      // rider gets high enough, move the whole camera rig upward instead of
      // zooming out. Camera position and look target move by the same Y offset,
      // so pitch/angle never changes.
      enterHeight: 7.4,
      exitHeight: 6.8,
      maxTrackedHeight: 22,
      followRatio: 0.94,
      maxVerticalShift: 12,
      riseResponse: 7.0,
      fallResponse: 6.0,
    }),
  }),
});
