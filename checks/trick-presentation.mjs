import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';

function wallX(profile, side, fraction) {
  return side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );
}

const profile = new HalfpipeProfile();

// Drop-in starts at the top and carries a short manual-like nose lift.
const drop = new HalfpipeSimulation(profile);
const dropStart = drop.snapshot();
const dropPresentation = simulationToPresentationState(profile, dropStart);
assert.ok(
  Math.abs(dropStart.pipeX) > profile.flatHalfWidth + profile.transitionWidth * 0.97,
  `drop-in should start near coping, x=${dropStart.pipeX}`,
);
assert.ok(
  dropPresentation.dropInRoll > 0.12,
  `drop-in board should start nose-up, roll=${dropPresentation.dropInRoll}`,
);
for (
  let index = 0;
  index < Math.ceil(GAME_CONFIG.trickPresentation.dropInDuration / drop.fixedDt) + 4;
  index += 1
) {
  drop.stepFixed();
}
const dropSettled = simulationToPresentationState(profile, drop.snapshot());
assert.ok(
  Math.abs(dropSettled.dropInRoll) < 1e-6,
  `drop-in nose lift should settle to normal stance, roll=${dropSettled.dropInRoll}`,
);

// Kick turn: visible 180, while the rider is physically held at turn height.
const kick = new HalfpipeSimulation(profile);
kick.reset({
  pipeX: wallX(profile, 1, 0.84),
  tangentVelocity: 7,
});
kick.setTurnIntent(-1);
kick.stepFixed();
kick.setTurnIntent(0);
const kickFrozenX = kick.snapshot().pipeX;
const kickHalfSteps = Math.round(
  GAME_CONFIG.trickPresentation.kickTurnDuration * 0.5 / kick.fixedDt,
);
for (let index = 0; index < kickHalfSteps; index += 1) kick.stepFixed();
const kickMidState = kick.snapshot();
const kickPresentation = simulationToPresentationState(profile, kickMidState);
assert.equal(kickMidState.lastTrick, 'kick-turn');
assert.equal(kickMidState.surfaceTrickActive, true);
assert.ok(
  Math.abs(kickMidState.pipeX - kickFrozenX) < 1e-9,
  'kick turn must not lose ramp height during the animation',
);
assert.equal(kickPresentation.trickType, 'kick-turn');
assert.equal(kickPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(kickPresentation.facingYaw) > 1.2,
  `kick turn should visibly rotate rider/board at midpoint, yaw=${kickPresentation.facingYaw}`,
);
for (
  let index = kickHalfSteps;
  index < Math.ceil(GAME_CONFIG.trickPresentation.kickTurnDuration / kick.fixedDt) + 4;
  index += 1
) {
  kick.stepFixed();
}
const kickSettled = simulationToPresentationState(profile, kick.snapshot());
assert.equal(kick.snapshot().surfaceTrickActive, false);
assert.ok(kick.snapshot().tangentVelocity < 0, 'kick turn should exit back toward center');
assert.ok(
  Math.abs(Math.abs(kickSettled.facingYaw) - Math.PI) < 0.05,
  `completed kick turn should preserve reversed facing, yaw=${kickSettled.facingYaw}`,
);

// Hand plant cannot fire on the lower/upper-middle wall anymore.
const lowHand = new HalfpipeSimulation(profile);
lowHand.reset({
  pipeX: wallX(profile, 1, 0.94),
  tangentVelocity: 7,
});
lowHand.setHandPlantHeld(true);
lowHand.stepFixed();
assert.notEqual(
  lowHand.snapshot().lastTrick,
  'hand-plant',
  'hand plant must not trigger below the coping zone',
);

// Hand plant triggers only at the coping and holds height for a slower animation.
const hand = new HalfpipeSimulation(profile);
hand.reset({
  pipeX: wallX(profile, 1, 0.995),
  tangentVelocity: 7,
});
hand.setHandPlantHeld(true);
hand.stepFixed();
hand.setHandPlantHeld(false);
const handFrozenX = hand.snapshot().pipeX;
const handHalfSteps = Math.round(
  GAME_CONFIG.trickPresentation.handPlantDuration * 0.5 / hand.fixedDt,
);
for (let index = 0; index < handHalfSteps; index += 1) hand.stepFixed();
const handMidState = hand.snapshot();
const handPresentation = simulationToPresentationState(profile, handMidState);
assert.equal(handMidState.lastTrick, 'hand-plant');
assert.equal(handMidState.surfaceTrickActive, true);
assert.ok(
  Math.abs(handMidState.pipeX - handFrozenX) < 1e-9,
  'hand plant must stay at coping height during the animation',
);
assert.equal(handPresentation.trickType, 'hand-plant');
assert.equal(handPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(handPresentation.trickRoll) > 1.0,
  `hand plant should visibly tip around the coping, roll=${handPresentation.trickRoll}`,
);
assert.ok(
  handPresentation.trickOffsetY > 0.16,
  `hand plant should visibly lift around the coping, y=${handPresentation.trickOffsetY}`,
);

// Aerial turn: freeze world height for the whole slow-motion rotation.
const aerial = new HalfpipeSimulation(profile);
aerial.reset({
  pipeX: profile.rightLip - 0.09,
  tangentVelocity: 18,
});
for (let index = 0; index < 90 && aerial.snapshot().mode !== 'airborne'; index += 1) {
  aerial.stepFixed();
}
assert.equal(aerial.snapshot().mode, 'airborne');
for (let index = 0; index < 12; index += 1) aerial.stepFixed();
const preTurnY = aerial.snapshot().airY;
aerial.setTurnIntent(-1);
aerial.stepFixed();
aerial.setTurnIntent(0);
const frozenY = aerial.snapshot().airY;
assert.ok(Math.abs(frozenY - preTurnY) < 0.2);
const airHalfSteps = Math.round(
  GAME_CONFIG.trickPresentation.aerialTurnDuration * 0.5 / aerial.fixedDt,
);
for (let index = 0; index < airHalfSteps; index += 1) aerial.stepFixed();
const aerialMid = aerial.snapshot();
const aerialPresentation = simulationToPresentationState(profile, aerialMid);
assert.equal(aerialMid.airTurnActive, true);
assert.ok(
  Math.abs(aerialMid.airY - frozenY) < 1e-9,
  'aerial turn must not lose height during bullet-time rotation',
);
assert.equal(aerialPresentation.trickType, 'aerial-turn');
assert.equal(aerialPresentation.trickVisualActive, true);
assert.ok(
  Math.abs(aerialPresentation.facingYaw) > 1.2,
  `aerial turn should visibly rotate in slow motion, yaw=${aerialPresentation.facingYaw}`,
);
for (
  let index = airHalfSteps;
  index < Math.ceil(GAME_CONFIG.trickPresentation.aerialTurnDuration / aerial.fixedDt) + 4;
  index += 1
) {
  aerial.stepFixed();
}
assert.equal(aerial.snapshot().airTurnActive, false);
assert.notEqual(
  aerial.snapshot().airVerticalVelocity,
  0,
  'aerial vertical motion should resume only after the full turn animation',
);

console.log(JSON.stringify({
  dropIn: {
    startX: dropStart.pipeX,
    startRoll: dropPresentation.dropInRoll,
    settledRoll: dropSettled.dropInRoll,
  },
  kick: {
    frozenX: kickFrozenX,
    midpointYaw: kickPresentation.facingYaw,
    settledYaw: kickSettled.facingYaw,
  },
  handPlant: {
    frozenX: handFrozenX,
    midpointRoll: handPresentation.trickRoll,
    midpointLift: handPresentation.trickOffsetY,
  },
  aerial: {
    frozenY,
    midpointY: aerialMid.airY,
    midpointYaw: aerialPresentation.facingYaw,
    resumedVerticalVelocity: aerial.snapshot().airVerticalVelocity,
  },
}, null, 2));
