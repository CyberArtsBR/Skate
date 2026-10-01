import { MAP_IMAGES } from './mapAssets.js';
import { publicAssetUrl } from './publicAssetUrl.js';

// Scale both authored visuals before their deck/sole/contact measurements are
// built, preserving rider-to-board proportions without scaling gameplay space.
const RIDER_VISUAL_SCALE = 1.2;

export const GAME_CONFIG = Object.freeze({
  assets: Object.freeze({
    halfpipe: publicAssetUrl('models/halfpipe/halfpipe.glb'),
    skateboard: publicAssetUrl('models/skateboard/skateboard.glb'),
    chimpion: publicAssetUrl('models/characters/The_Heretic.glb'),
    background: MAP_IMAGES.city,
    environment: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/piazza_martin_lutero_1k.hdr',
  }),
  renderer: Object.freeze({
    maxPixelRatio: 2,
    clearColor: 0x000000,
    shadowMapSize: 2048,
    environmentIntensity: 0.84,
    copingGlow: Object.freeze({
      // Keep the glow clearly visible but restrained so it never blooms over
      // the rider or washes out the authored ramp materials.
      emissiveIntensity: 3.2,
      innerExpansion: 0.012,
      innerOpacity: 0.024,
      outerExpansion: 0.026,
      outerOpacity: 0.01,
    }),
    frontMetal: Object.freeze({
      // V9 asset audit of public/models/halfpipe/halfpipe.glb resolves the
      // generic material name "Material" to exactly one source mesh Object_0,
      // instantiated by the GLTF node Object_4. Match the runtime node AND the
      // material so no unrelated future "Material" can be made metallic.
      nodeName: 'Object_4',
      materialName: 'Material',
      metalness: 1,
      envMapIntensity: 2.4,
    }),
  }),
  skateboard: Object.freeze({
    scale: 0.155 * RIDER_VISUAL_SCALE,
    deckLengthScale: 1.18,
    wheelRadius: 0.05 * RIDER_VISUAL_SCALE,
    surfaceClearance: 0.18 * RIDER_VISUAL_SCALE,
  }),
  rider: Object.freeze({
    targetHeight: 2.32 * RIDER_VISUAL_SCALE,
    deckClearance: 0.025 * RIDER_VISUAL_SCALE,
    stance: 'regular',
    stanceHalfLength: 0.24 * RIDER_VISUAL_SCALE,
    footLateralOffset: 0.015 * RIDER_VISUAL_SCALE,
    fakieBodyDrop: 0.065 * RIDER_VISUAL_SCALE,
    fakieFootTargetDrop: 0.07 * RIDER_VISUAL_SCALE,
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
  session: Object.freeze({ durationSeconds: 75 }),
  // Original arcade motion pace; the round countdown remains in real time.
  gameplay: Object.freeze({ motionTimeScale: 0.75 }),
  arcadeMotion: Object.freeze({ downhillGravityScale: 1.12, uphillGravityScale: 1.6 }),
  // Pumping remains timing/direction based, but it is now eligible essentially
  // from rest so a low-energy run can always be rebuilt by player input.
  pumping: Object.freeze({ acceleration: 8.5, upperWallRetention: 0.75, minimumSpeed: 0.05 }),
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
    aerial180: Object.freeze({ min: 400, max: 700 }),
    aerial360: Object.freeze({ min: 750, max: 1150 }),
    aerial540: Object.freeze({ min: 1250, max: 1800 }),
    aerial720: Object.freeze({ min: 1900, max: 2700 }),
    aerial900: Object.freeze({ min: 2800, max: 4000 }),
    backflip: Object.freeze({ min: 1600, max: 2400 }),
    doubleBackflip: Object.freeze({ min: 3200, max: 5000 }),
    airCombinationMultiplier: 1.1,
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
    minimumVerticalVelocity: 8.5,
    maximumVerticalVelocity: 27,
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