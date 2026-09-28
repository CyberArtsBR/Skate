import assert from 'node:assert/strict';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';

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

console.log(JSON.stringify({
  initial: first.initial,
  final: first.final,
  fixedDt: first.simulation.fixedDt,
}, null, 2));
