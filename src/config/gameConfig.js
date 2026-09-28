export const GAME_CONFIG = Object.freeze({
  assets: Object.freeze({
    halfpipe: '/models/halfpipe/halfpipe.glb',
    skateboard: '/models/skateboard/skateboard.glb',
    chimpion: '/models/characters/The%20Heretic.glb',
    background: '/images/backgrounds/urban-sports-beach.jpg',
  }),
  renderer: Object.freeze({
    maxPixelRatio: 2,
    clearColor: 0x000000,
    shadowMapSize: 2048,
  }),
  skateboard: Object.freeze({
    scale: 0.095,
    wheelRadius: 0.036,
  }),
  rider: Object.freeze({
    targetHeight: 2.15,
    deckClearance: 0.025,
    position: Object.freeze([0, 0.16, 0]),
  }),
  halfpipeProfile: Object.freeze({
    flatHalfWidth: 2.35,
    transitionWidth: 5.62,
    transitionHeight: 6.62,
    debugDepth: 8.3,
    debugVisible: false,
  }),
  camera: Object.freeze({
    fov: 33,
    near: 0.1,
    far: 180,
    position: Object.freeze([0, 7.2, 36]),
    target: Object.freeze([0, 4.4, 0]),
  }),
});
