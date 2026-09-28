import assert from 'node:assert/strict';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';

function wallX(profile, side, fraction) {
  return side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );
}

const profile = new HalfpipeProfile();

const kick = new HalfpipeSimulation(profile);
kick.reset({
  pipeX: wallX(profile, 1, 0.84),
  tangentVelocity: 7,
});
kick.setTurnIntent(-1);
kick.stepFixed();
kick.setTurnIntent(0);
for (let index = 0; index < 20; index += 1) kick.stepFixed();
const kickPresentation = simulationToPresentationState(profile, kick.snapshot());
assert.equal(kick.snapshot().lastTrick, 'kick-turn');
assert.equal(kickPresentation.trickType, 'kick-turn');
assert.equal(kickPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(kickPresentation.facingYaw) > 0.45,
  `kick turn should visibly rotate rider/board, yaw=${kickPresentation.facingYaw}`,
);
assert.ok(
  Math.abs(kickPresentation.trickRoll) > 0.03,
  `kick turn should include readable board/rider roll, roll=${kickPresentation.trickRoll}`,
);

for (let index = 0; index < 60; index += 1) kick.stepFixed();
const kickSettled = simulationToPresentationState(profile, kick.snapshot());
assert.ok(
  Math.abs(Math.abs(kickSettled.facingYaw) - Math.PI) < 0.05,
  `completed kick turn should preserve reversed facing, yaw=${kickSettled.facingYaw}`,
);

const hand = new HalfpipeSimulation(profile);
hand.reset({
  pipeX: wallX(profile, 1, 0.95),
  tangentVelocity: 7,
});
hand.setHandPlantHeld(true);
hand.stepFixed();
hand.setHandPlantHeld(false);
for (let index = 0; index < 30; index += 1) hand.stepFixed();
const handPresentation = simulationToPresentationState(profile, hand.snapshot());
assert.equal(hand.snapshot().lastTrick, 'hand-plant');
assert.equal(handPresentation.trickType, 'hand-plant');
assert.equal(handPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(handPresentation.trickRoll) > 0.6,
  `hand plant should visibly tip the rider, roll=${handPresentation.trickRoll}`,
);
assert.ok(
  handPresentation.trickOffsetY > 0.12,
  `hand plant should visibly lift around the coping, y=${handPresentation.trickOffsetY}`,
);

const aerial = new HalfpipeSimulation(profile);
aerial.reset({
  pipeX: profile.rightLip - 0.006,
  tangentVelocity: 18,
});
for (let index = 0; index < 60 && aerial.snapshot().mode !== 'airborne'; index += 1) {
  aerial.stepFixed();
}
assert.equal(aerial.snapshot().mode, 'airborne');
aerial.setTurnIntent(-1);
for (let index = 0; index < 18; index += 1) aerial.stepFixed();
aerial.setTurnIntent(0);
for (let index = 0; index < 12; index += 1) aerial.stepFixed();
const aerialPresentation = simulationToPresentationState(profile, aerial.snapshot());
assert.equal(aerialPresentation.airborne, true);
assert.equal(aerialPresentation.trickType, 'aerial-turn');
assert.equal(aerialPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(aerialPresentation.facingYaw) > 1.5,
  `aerial turn should visibly spin in air, yaw=${aerialPresentation.facingYaw}`,
);

console.log(JSON.stringify({
  kick: {
    yaw: kickPresentation.facingYaw,
    roll: kickPresentation.trickRoll,
    settledYaw: kickSettled.facingYaw,
  },
  handPlant: {
    yaw: handPresentation.facingYaw,
    roll: handPresentation.trickRoll,
    offsetY: handPresentation.trickOffsetY,
  },
  aerial: {
    yaw: aerialPresentation.facingYaw,
    roll: aerialPresentation.trickRoll,
    progress: aerialPresentation.trickProgress,
  },
}, null, 2));
