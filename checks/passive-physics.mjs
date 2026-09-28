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
  first.final.bottomCrossingInterval >= 1.7 && first.final.bottomCrossingInterval <= 2.2,
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
assert.ok(presentationState.speedNormalized > 0);
assert.equal(presentationState.pumpCompression, 0);

console.log(JSON.stringify({
  initial: first.initial,
  final: first.final,
  fixedDt: first.simulation.fixedDt,
}, null, 2));
