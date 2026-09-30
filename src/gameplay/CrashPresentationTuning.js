export const CRASH_PRESENTATION = Object.freeze({
  gameOverDelay: 1.8,
  grayscaleSeconds: 0.38,
  gravity: 26,
  fixedDt: 1 / 120,
  bodyRestitution: 0.08,
  boardRestitution: 0.34,
  bodyFriction: 5,
  boardFriction: 1.4,
  boardSeparationSpeed: 4.2,
  bodySeparationSpeed: 1.3,
  bodyAngularSpeed: 2.6,
  boardAngularSpeed: 8.5,
  surfaceMargin: 0.015,
});

export const HANDPLANT_CLEARANCE = Object.freeze({
  enterEnd: 0.32,
  releaseStart: 0.78,
  surfaceMargin: 0.06,
  headCopingMargin: 0.10,
  maxCorrection: 3.6,
  iterations: 3,
});
