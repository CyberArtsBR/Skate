import assert from 'node:assert/strict';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import {
  HalfpipeMotionSolver,
  clamp01,
  nearestRotationTarget,
  rotationQualityFromDegrees,
  signWithEpsilon,
  smoothstep01,
} from '../src/halfpipe/HalfpipeMotionSolver.js';
import { snapshotRunStatistics } from '../src/halfpipe/RunStatistics.js';

const profile = new HalfpipeProfile();
const simulation = new HalfpipeSimulation(profile);
const solver = new HalfpipeMotionSolver(profile, {
  velocityEpsilon: simulation.velocityEpsilon,
  airLaunchMinimumSpeed: simulation.airLaunchMinimumSpeed,
  airMaximumVerticalVelocity: simulation.airMaximumVerticalVelocity,
  airGravity: simulation.airGravity,
});

const approximatelyEqual = (actual, expected, epsilon = 1e-10, message = '') => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message || 'values differ'}: ${actual} vs ${expected}`,
  );
};

// Preserve the exact scalar helpers currently embedded in HalfpipeSimulation.
assert.equal(signWithEpsilon(0.2, 0.1), 1);
assert.equal(signWithEpsilon(-0.2, 0.1), -1);
assert.equal(signWithEpsilon(0.05, 0.1), 0);
assert.equal(clamp01(-2), 0);
assert.equal(clamp01(0.42), 0.42);
assert.equal(clamp01(4), 1);
approximatelyEqual(smoothstep01(0.5), 0.5);
assert.deepEqual(nearestRotationTarget(356, 180, 720), {
  rotation: 356,
  target: 360,
  error: 4,
});
approximatelyEqual(rotationQualityFromDegrees(180, 180), 1);
approximatelyEqual(rotationQualityFromDegrees(250, 180), 0);

// Geometry orientation and wall fraction must remain byte-for-byte equivalent
// to the current coordinator's private helpers before Phase 3 delegates them.
for (const x of [
  profile.leftLip,
  profile.leftLip * 0.92,
  -profile.flatHalfWidth,
  0,
  profile.flatHalfWidth,
  profile.rightLip * 0.92,
  profile.rightLip,
]) {
  const current = simulation._sampleIncreasingX(x);
  const extracted = solver.sampleIncreasingX(x);
  assert.equal(extracted.region, current.region, `region changed at x=${x}`);
  approximatelyEqual(extracted.x, current.x, 1e-10, `sample x changed at x=${x}`);
  approximatelyEqual(extracted.y, current.y, 1e-10, `sample y changed at x=${x}`);
  approximatelyEqual(extracted.tangent.x, current.tangent.x, 1e-10, `tangent.x changed at x=${x}`);
  approximatelyEqual(extracted.tangent.y, current.tangent.y, 1e-10, `tangent.y changed at x=${x}`);
  approximatelyEqual(extracted.normal.x, current.normal.x, 1e-10, `normal.x changed at x=${x}`);
  approximatelyEqual(extracted.normal.y, current.normal.y, 1e-10, `normal.y changed at x=${x}`);
  approximatelyEqual(solver.wallFraction(x), simulation._wallFraction(x), 1e-10, `wall fraction changed at x=${x}`);
}

// Launch velocity is a core player-visible motion curve. The extracted solver
// must match the production coordinator exactly across threshold/normal/max air.
for (const speed of [0, 1, simulation.airLaunchMinimumSpeed - 0.001,
  simulation.airLaunchMinimumSpeed, simulation.airLaunchMinimumSpeed + 0.5,
  8, 12, 18, 26, 50]) {
  approximatelyEqual(
    solver.computeLaunchVelocity(speed),
    simulation.computeLaunchVelocity(speed),
    1e-10,
    `launch velocity changed at speed=${speed}`,
  );
}

// Surface and airborne integration use the same semi-implicit formulas that are
// currently in HalfpipeSimulation; no physics redesign is permitted in Phase 3.
const contactSample = simulation._sampleIncreasingX(profile.flatHalfWidth + profile.transitionWidth * 0.4);
const contactX = 3.25;
const contactVelocity = 9.4;
const contactDt = simulation.fixedDt;
approximatelyEqual(
  solver.integrateSurfaceX({
    x: contactX,
    tangentVelocity: contactVelocity,
    tangentX: contactSample.tangent.x,
    dt: contactDt,
  }),
  contactX + contactVelocity * contactSample.tangent.x * contactDt,
  1e-12,
  'surface integration changed',
);

const air = solver.integrateAirStep({
  y: 5.5,
  verticalVelocity: 7.25,
  dt: simulation.fixedDt,
});
const expectedAirVelocity = 7.25 - simulation.airGravity * simulation.fixedDt;
approximatelyEqual(air.verticalVelocity, expectedAirVelocity, 1e-12, 'air velocity integration changed');
approximatelyEqual(
  air.y,
  5.5 + expectedAirVelocity * simulation.fixedDt,
  1e-12,
  'air height integration changed',
);
assert.equal(air.crossedApex, false);

// RunStatistics must be a read-only extraction of the existing public contract.
simulation.state.score = 4321;
simulation.state.bestTrick = 'backflip';
simulation.state.bestTrickPoints = 1234;
simulation.state.highestAir = 4.25;
simulation.state.bestCombo = 3;
simulation.state.tricksAttempted = 9;
simulation.state.tricksLanded = 7;
simulation.state.perfectLandings = 2;
simulation.state.cleanLandings = 4;
simulation.state.crashes = 1;
simulation.state.pumpAccuracy = 0.875;
assert.deepEqual(snapshotRunStatistics(simulation.state), simulation.getRunStats());

console.log('Phase 3 decomposition boundary: motion solver and run statistics match the current authoritative simulation.');
