import assert from 'node:assert/strict';

export const PHASE4_ENUMS = Object.freeze({
  aerialRotation: Object.freeze(['under', 'valid', 'over']),
  landing: Object.freeze(['clean', 'sketchy', 'bail']),
});

export function validatePhase4Snapshot(snapshot = {}) {
  const errors = [];
  const finite = (value) => Number.isFinite(value);

  if ('currentAirPeak' in snapshot && !finite(snapshot.currentAirPeak)) {
    errors.push('currentAirPeak must be finite');
  }
  if ('runMaxAir' in snapshot && !finite(snapshot.runMaxAir)) {
    errors.push('runMaxAir must be finite');
  }
  if (finite(snapshot.currentAirPeak) && finite(snapshot.runMaxAir)
      && snapshot.currentAirPeak > snapshot.runMaxAir + 1e-6) {
    errors.push('currentAirPeak cannot exceed runMaxAir');
  }

  if ('aerialRotationClass' in snapshot
      && !PHASE4_ENUMS.aerialRotation.includes(snapshot.aerialRotationClass)) {
    errors.push('aerialRotationClass must be under, valid, or over');
  }
  if ('landingClass' in snapshot && !PHASE4_ENUMS.landing.includes(snapshot.landingClass)) {
    errors.push('landingClass must be clean, sketchy, or bail');
  }

  if ('combo' in snapshot) {
    if (!snapshot.combo || typeof snapshot.combo !== 'object') {
      errors.push('combo must be an object');
    } else {
      if (!Number.isInteger(snapshot.combo.count) || snapshot.combo.count < 0) {
        errors.push('combo.count must be a non-negative integer');
      }
      if (!finite(snapshot.combo.score) || snapshot.combo.score < 0) {
        errors.push('combo.score must be a non-negative finite number');
      }
    }
  }

  if ('resultsStats' in snapshot) {
    if (!snapshot.resultsStats || typeof snapshot.resultsStats !== 'object') {
      errors.push('resultsStats must be an object');
    } else if (!finite(snapshot.resultsStats.score) || snapshot.resultsStats.score < 0) {
      errors.push('resultsStats.score must be a non-negative finite number');
    }
  }

  if ('resetSafe' in snapshot && snapshot.resetSafe !== true) {
    errors.push('resetSafe must be true after reset');
  }
  if ('controllerGlyph' in snapshot
      && !['xbox', 'playstation', 'switch', 'generic', 'keyboard'].includes(snapshot.controllerGlyph)) {
    errors.push('controllerGlyph must use a supported family');
  }

  if ('cameraTracking' in snapshot) {
    const camera = snapshot.cameraTracking;
    if (!camera || !finite(camera.verticalShift) || !finite(camera.fov)) {
      errors.push('cameraTracking must expose finite verticalShift and fov');
    }
  }

  if ('wheelSpin' in snapshot) {
    const wheel = snapshot.wheelSpin;
    if (!wheel || !finite(wheel.distance) || !finite(wheel.rotation)) {
      errors.push('wheelSpin must expose finite distance and rotation');
    }
  }

  if ('takeoffContinuity' in snapshot) {
    const value = snapshot.takeoffContinuity;
    if (!value || !finite(value.rootDelta) || value.rootDelta < 0) {
      errors.push('takeoffContinuity.rootDelta must be a non-negative finite number');
    }
  }

  return errors;
}

const validFixture = {
  currentAirPeak: 2.5,
  runMaxAir: 3.1,
  aerialRotationClass: 'valid',
  landingClass: 'clean',
  combo: { count: 2, score: 900 },
  resultsStats: { score: 1900 },
  resetSafe: true,
  controllerGlyph: 'xbox',
  cameraTracking: { verticalShift: 1.25, fov: 30 },
  wheelSpin: { distance: 4.2, rotation: 17.1 },
  takeoffContinuity: { rootDelta: 0.08 },
};

assert.deepEqual(validatePhase4Snapshot(validFixture), []);
assert.ok(validatePhase4Snapshot({ currentAirPeak: 5, runMaxAir: 4 }).length > 0);
assert.ok(validatePhase4Snapshot({ aerialRotationClass: 'unknown' }).length > 0);
assert.ok(validatePhase4Snapshot({ landingClass: 'teleport' }).length > 0);

console.log('Phase 4 reusable contracts passed.');
