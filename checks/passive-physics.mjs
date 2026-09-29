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
  first.final.bottomCrossingInterval >= 1.65 && first.final.bottomCrossingInterval <= 3.2,
  `passive no-input cadence drifted outside the Phase 4 arcade band: ${first.final.bottomCrossingInterval}`,
);
assert.ok(first.final.lastCrossingSpeed > 0);
assert.ok(first.final.lastTurningPointX !== null);
assert.ok(first.final.distanceTravelled > 0);
assert.ok(
  first.final.distanceTravelled >= Math.abs(first.final.signedDistanceTravelled),
  'absolute ramp travel must bound signed travel',
);

const presentationProbe = new HalfpipeSimulation(new HalfpipeProfile());
let presentationState = null;
for (let index = 0; index < 240; index += 1) {
  const snapshot = presentationProbe.stepFixed();
  const candidate = simulationToPresentationState(
    presentationProbe.profile,
    snapshot,
  );
  if (!candidate.airborne && Math.abs(candidate.verticalVelocity) > 0.02) {
    presentationState = candidate;
    break;
  }
}
assert.ok(presentationState, 'presentation probe should find moving contact state');
assert.equal(presentationState.airborne, false);
assert.ok(
  Math.abs(presentationState.verticalVelocity) > 0.02,
  'presentation probe should be moving vertically on the transition',
);
assert.equal(
  presentationState.ascending,
  presentationState.verticalVelocity > 0,
  'ascending flag must match vertical velocity sign',
);
assert.equal(
  presentationState.descending,
  presentationState.verticalVelocity < 0,
  'descending flag must match vertical velocity sign',
);
assert.notEqual(
  presentationState.ascending,
  presentationState.descending,
  'contact presentation should not report ascending and descending simultaneously',
);
assert.ok(Number.isFinite(presentationState.surfaceAngle));
assert.ok(presentationState.speedNormalized > 0);
assert.equal(presentationState.pumpCompression, 0);

function runPumped(seconds = 8) {
  const profile = new HalfpipeProfile();
  const simulation = new HalfpipeSimulation(profile);
  simulation.reset({
    pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.72),
    tangentVelocity: 0,
  });
  const initialAmplitude = Math.abs(simulation.snapshot().pipeX);
  const totalSteps = Math.round(seconds / simulation.fixedDt);
  let maxAbsX = initialAmplitude;
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
    initialAmplitude,
  };
}

const pumped = runPumped();
assert.ok(pumped.final.pumpWorkTotal > 0, 'correct pumping should add specific energy');
assert.ok(pumped.maxAbsX > pumped.initialAmplitude, 'correct pumping should increase amplitude from a lower transition start');
assert.ok(
  pumped.timeToHighAmplitude === null || pumped.timeToHighAmplitude >= 6,
  `V7 pumping should no longer rocket to 90% lip amplitude before 6s, got ${pumped.timeToHighAmplitude}`,
);
assert.ok(
  ['contact', 'airborne'].includes(pumped.final.mode),
  `pumped simulation ended in invalid mode: ${pumped.final.mode}`,
);

console.log(JSON.stringify({
  initial: first.initial,
  final: first.final,
  fixedDt: first.simulation.fixedDt,
  pumped: {
    initialAmplitude: pumped.initialAmplitude,
    maxAbsX: pumped.maxAbsX,
    timeToHighAmplitude: pumped.timeToHighAmplitude,
    highAmplitudeTarget: pumped.highAmplitudeTarget,
    pumpWorkTotal: pumped.final.pumpWorkTotal,
  },
}, null, 2));


function runUntilAirborne(seconds = 14) {
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
  airborne.firstAirTime <= 13.5,
  `stricter V7 pumping should still make aerial play reachable within 13.5s, got ${airborne.firstAirTime}`,
);
assert.ok(
  airborne.final.highestAir > 0.7,
  `airborne motion should produce at least a readable 0.7m rise above its takeoff base, got ${airborne.final.highestAir}`,
);
assert.ok(
  airborne.final.highestAir <= 7.6,
  `V7 airborne height should respect the approximately half-height cap, got ${airborne.final.highestAir}`,
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


function wallX(profile, side, fraction) {
  return side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );
}

const trickProfile = new HalfpipeProfile();

const kickTurnSim = new HalfpipeSimulation(trickProfile);
kickTurnSim.reset({
  pipeX: wallX(trickProfile, -1, 0.82),
  tangentVelocity: -8,
});
kickTurnSim.setTurnIntent(1);
const kickTurnStart = kickTurnSim.stepFixed();
assert.equal(kickTurnStart.lastTrick, 'kick-turn');
assert.equal(kickTurnStart.surfaceTrickActive, true);
assert.equal(kickTurnStart.tangentVelocity, 0);
kickTurnSim.setTurnIntent(0);
for (let index = 0; index < 120 && kickTurnSim.snapshot().surfaceTrickActive; index += 1) {
  kickTurnSim.stepFixed();
}
const kickTurnState = kickTurnSim.snapshot();
assert.ok(kickTurnState.tangentVelocity > 0, 'left-wall kick turn should reverse back toward center after the slow-motion hold');
assert.equal(kickTurnState.trickCount, 1);
assert.ok(kickTurnState.lastTrickPoints >= 100 && kickTurnState.lastTrickPoints <= 300);
assert.equal(kickTurnState.score, kickTurnState.lastTrickPoints);

const handPlantSim = new HalfpipeSimulation(trickProfile);
handPlantSim.reset({
  pipeX: wallX(trickProfile, -1, 0.999),
  tangentVelocity: -7,
});
handPlantSim.setHandPlantHeld(true);
const handPlantStart = handPlantSim.stepFixed();
assert.equal(handPlantStart.lastTrick, 'hand-plant');
assert.equal(handPlantStart.surfaceTrickActive, true);
assert.equal(handPlantStart.tangentVelocity, 0);
assert.ok(
  Math.abs(handPlantStart.pipeX - (trickProfile.leftLip + handPlantSim.lipInset)) < 1e-9,
  `hand plant must be pinned to the physical coping/lip: ${handPlantStart.pipeX}`,
);
handPlantSim.setHandPlantHeld(false);
for (let index = 0; index < 180 && handPlantSim.snapshot().surfaceTrickActive; index += 1) {
  handPlantSim.stepFixed();
}
const handPlantState = handPlantSim.snapshot();
assert.ok(handPlantState.tangentVelocity > 0, 'front-facing left-wall hand plant should reverse the rider back into the pipe after the coping hold');
assert.ok(handPlantState.lastTrickPoints >= 400 && handPlantState.lastTrickPoints <= 700);

const aerialTurnSim = new HalfpipeSimulation(trickProfile);
aerialTurnSim.reset({
  pipeX: trickProfile.leftLip + 0.03,
  tangentVelocity: -20,
});
for (let index = 0; index < 60 && aerialTurnSim.snapshot().mode !== 'airborne'; index += 1) {
  aerialTurnSim.stepFixed();
}
assert.equal(aerialTurnSim.snapshot().mode, 'airborne', 'aerial-turn probe must launch');
aerialTurnSim.setTurnIntent(1);
for (let index = 0; index < 36; index += 1) aerialTurnSim.stepFixed();
aerialTurnSim.setTurnIntent(0);
aerialTurnSim.stepFixed();
assert.equal(aerialTurnSim.snapshot().airTurnCompleted, true, 'aerial 180 must be earned from held rotation input');
for (let index = 0; index < 900 && aerialTurnSim.snapshot().mode === 'airborne'; index += 1) {
  aerialTurnSim.stepFixed();
}
const aerialTurnState = aerialTurnSim.snapshot();
assert.equal(aerialTurnState.mode, 'contact');
assert.equal(aerialTurnState.lastTrick, 'aerial-180');
assert.ok(aerialTurnState.trickCount >= 1);
assert.ok(aerialTurnState.lastTrickPoints >= 400 && aerialTurnState.lastTrickPoints <= 999);

console.log(JSON.stringify({
  trickRegression: {
    kickTurn: kickTurnState.lastTrick,
    handPlant: handPlantState.lastTrick,
    aerialTurn: aerialTurnState.lastTrick,
  },
}, null, 2));
