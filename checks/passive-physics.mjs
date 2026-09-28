import assert from 'node:assert/strict';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';

function runPassive(seconds = 20) {
  const profile = new HalfpipeProfile();
  const simulation = new HalfpipeSimulation(profile);
  const initial = simulation.snapshot();
  const samples = [initial];
  const totalSteps = Math.round(seconds / simulation.fixedDt);

  for (let index = 0; index < totalSteps; index += 1) {
    const state = simulation.stepFixed();
    assert.ok(Number.isFinite(state.pipeX));
    assert.ok(Number.isFinite(state.tangentVelocity));
    assert.ok(Number.isFinite(state.specificEnergy));
    assert.ok(state.pipeX > profile.leftLip);
    assert.ok(state.pipeX < profile.rightLip);
    if (index % 120 === 0) samples.push(state);
  }

  return { profile, simulation, initial, final: simulation.snapshot(), samples };
}

const first = runPassive();
const second = runPassive();

assert.deepEqual(
  first.final,
  second.final,
  'fixed-step passive simulation must be deterministic for identical initial state',
);

assert.ok(first.final.time > 19.99 && first.final.time < 20.01);
assert.ok(first.final.bottomCrossings >= 4, 'passive rider should traverse the flat repeatedly');
assert.ok(first.final.turningPoints >= 3, 'passive rider should reverse naturally on the walls');
assert.ok(
  first.final.specificEnergy < first.initial.specificEnergy,
  'configured passive drag should gradually remove mechanical energy',
);
assert.equal(first.final.lipContacts, 0, 'default passive calibration should remain below coping');
assert.equal(first.final.mode, 'contact');
assert.ok(first.final.lastBottomCrossingTime !== null);
assert.ok(
  first.final.bottomCrossingInterval >= 1.35 && first.final.bottomCrossingInterval <= 1.75,
  `passive crossing cadence drifted outside the current reference band: ${first.final.bottomCrossingInterval}`,
);
assert.ok(first.final.lastCrossingSpeed > 0);
assert.ok(first.final.lastTurningPointX !== null);
assert.ok(first.final.distanceTravelled > 0);
assert.ok(
  first.final.distanceTravelled >= Math.abs(first.final.signedDistanceTravelled),
  'absolute ramp travel must bound signed travel',
);

const presentationProbe = new HalfpipeSimulation(new HalfpipeProfile());
for (let index = 0; index < 60; index += 1) presentationProbe.stepFixed();
const presentationState = simulationToPresentationState(
  presentationProbe.profile,
  presentationProbe.snapshot(),
);
assert.equal(presentationState.airborne, false);
assert.equal(presentationState.descending, true);
assert.equal(presentationState.ascending, false);
assert.ok(presentationState.verticalVelocity < 0);
assert.ok(presentationState.surfaceAngle < 0);
assert.ok(presentationState.speedNormalized > 0);
assert.equal(presentationState.pumpCompression, 0);

function runPumped(seconds = 8) {
  const profile = new HalfpipeProfile();
  const simulation = new HalfpipeSimulation(profile);
  const totalSteps = Math.round(seconds / simulation.fixedDt);
  let maxAbsX = Math.abs(simulation.snapshot().pipeX);
  let timeToHighAmplitude = null;
  const highAmplitudeTarget = profile.rightLip * 0.9;

  for (let index = 0; index < totalSteps; index += 1) {
    const state = simulation.snapshot();
    const desiredIntent = state.pipeX * state.tangentVelocity >= 0 ? 1 : -1;
    simulation.setPumpIntent(desiredIntent);
    const next = simulation.stepFixed();
    maxAbsX = Math.max(maxAbsX, Math.abs(next.pipeX));
    if (timeToHighAmplitude === null && Math.abs(next.pipeX) >= highAmplitudeTarget) {
      timeToHighAmplitude = next.time;
    }
  }

  return {
    simulation,
    final: simulation.snapshot(),
    maxAbsX,
    timeToHighAmplitude,
    highAmplitudeTarget,
  };
}

const pumped = runPumped();
assert.ok(pumped.final.pumpWorkTotal > 0, 'correct pumping should add specific energy');
assert.ok(pumped.maxAbsX > Math.abs(first.initial.pipeX), 'correct pumping should increase amplitude');
assert.ok(
  pumped.timeToHighAmplitude !== null && pumped.timeToHighAmplitude <= 2.9,
  `strong correct pumping should reach 90% lip amplitude within 2.9s, got ${pumped.timeToHighAmplitude}`,
);
assert.equal(pumped.final.mode, 'contact');

console.log(JSON.stringify({
  initial: first.initial,
  final: first.final,
  fixedDt: first.simulation.fixedDt,
  pumped: {
    maxAbsX: pumped.maxAbsX,
    timeToHighAmplitude: pumped.timeToHighAmplitude,
    highAmplitudeTarget: pumped.highAmplitudeTarget,
    pumpWorkTotal: pumped.final.pumpWorkTotal,
  },
}, null, 2));


function runUntilAirborne(seconds = 10) {
  const profile = new HalfpipeProfile();
  const simulation = new HalfpipeSimulation(profile);
  const totalSteps = Math.round(seconds / simulation.fixedDt);
  let firstAirTime = null;
  let peakY = null;

  for (let index = 0; index < totalSteps; index += 1) {
    const state = simulation.snapshot();
    if (state.mode === 'contact') {
      const desiredIntent = state.pipeX * state.tangentVelocity >= 0 ? 1 : -1;
      simulation.setPumpIntent(desiredIntent);
    } else {
      simulation.setPumpIntent(0);
    }

    const next = simulation.stepFixed();
    if (next.mode === 'airborne' && firstAirTime === null) firstAirTime = next.time;
    if (next.maxAirY !== null) peakY = next.maxAirY;
  }

  return { profile, simulation, final: simulation.snapshot(), firstAirTime, peakY };
}

const airborne = runUntilAirborne();
const lipY = airborne.profile.sample(airborne.profile.rightLip).y;
assert.ok(airborne.firstAirTime !== null, 'strong pumping should launch vertically above a lip');
assert.ok(
  airborne.firstAirTime <= 6,
  `vertical air launch should be reachable within 6s, got ${airborne.firstAirTime}`,
);
assert.ok(
  airborne.peakY !== null && airborne.peakY > lipY + 0.7,
  `airborne peak should visibly clear the lip, got peak ${airborne.peakY} vs lip ${lipY}`,
);
assert.ok(
  airborne.peakY <= lipY + 3.5,
  `airborne peak should stay camera-readable, got peak ${airborne.peakY} vs lip ${lipY}`,
);
assert.ok(airborne.final.airLaunches >= 1, 'air launch telemetry must be recorded');

console.log(JSON.stringify({
  airPrototype: {
    firstAirTime: airborne.firstAirTime,
    peakY: airborne.peakY,
    lipY,
    launches: airborne.final.airLaunches,
  },
}, null, 2));
