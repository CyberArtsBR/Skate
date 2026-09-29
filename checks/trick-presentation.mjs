import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';
import { SkatePoseController } from '../src/character/SkatePoseController.js';

function wallX(profile, side, fraction) {
  return side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );
}

function finishSurfaceTrick(simulation, maxSteps = 240) {
  for (
    let index = 0;
    index < maxSteps && simulation.snapshot().surfaceTrickActive;
    index += 1
  ) {
    simulation.stepFixed();
  }
  return simulation.snapshot();
}

function launchFromSide(profile, side, facingTurns = 0) {
  const simulation = new HalfpipeSimulation(profile);
  simulation.reset({
    pipeX: side < 0
      ? profile.leftLip + GAME_CONFIG.air.takeoffInset + 0.01
      : profile.rightLip - GAME_CONFIG.air.takeoffInset - 0.01,
    tangentVelocity: side < 0 ? -18 : 18,
  });
  simulation.state.facingTurns = facingTurns;

  for (
    let index = 0;
    index < 120 && simulation.snapshot().mode !== 'airborne';
    index += 1
  ) {
    simulation.stepFixed();
  }
  assert.equal(simulation.snapshot().mode, 'airborne');
  return simulation;
}

const profile = new HalfpipeProfile();

// Drop-in contract: RIGHT side, facing the camera, with a short manual-like lift.
const drop = new HalfpipeSimulation(profile);
const dropStart = drop.snapshot();
const dropPresentation = simulationToPresentationState(profile, dropStart);
assert.ok(dropStart.pipeX > 0, `drop-in must start on RIGHT side, x=${dropStart.pipeX}`);
assert.ok(
  Math.abs(dropStart.pipeX - profile.rightLip) < 0.02,
  `drop-in must start at right coping, x=${dropStart.pipeX}, lip=${profile.rightLip}`,
);
assert.ok(
  Math.abs(dropPresentation.facingYaw) < 1e-9,
  `drop-in must begin facing camera, yaw=${dropPresentation.facingYaw}`,
);
assert.ok(
  dropPresentation.dropInRoll > 0.12,
  `drop-in board should start nose-up, roll=${dropPresentation.dropInRoll}`,
);

// Turns are symmetric: either wall works regardless of facing.
const frontRight = new HalfpipeSimulation(profile);
frontRight.reset({
  pipeX: wallX(profile, 1, 0.86),
  tangentVelocity: 7,
});
frontRight.setTurnIntent(-1);
frontRight.stepFixed();
assert.equal(
  frontRight.snapshot().lastTrick,
  'kick-turn',
  'front-facing rider must be allowed to turn on RIGHT wall',
);

const frontLeft = new HalfpipeSimulation(profile);
frontLeft.reset({
  pipeX: wallX(profile, -1, 0.86),
  tangentVelocity: -7,
});
frontLeft.setTurnIntent(1);
frontLeft.stepFixed();
frontLeft.setTurnIntent(0);
assert.equal(frontLeft.snapshot().lastTrick, 'kick-turn');
assert.equal(frontLeft.snapshot().surfaceTrickActive, true);

const kickFrozenX = frontLeft.snapshot().pipeX;
const kickHalfSteps = Math.round(
  GAME_CONFIG.trickPresentation.kickTurnDuration * 0.5 / frontLeft.fixedDt,
);
for (let index = 0; index < kickHalfSteps; index += 1) frontLeft.stepFixed();
const kickMid = frontLeft.snapshot();
const kickPresentation = simulationToPresentationState(profile, kickMid);
assert.ok(
  Math.abs(kickMid.pipeX - kickFrozenX) < 1e-9,
  'kick turn must hold wall height during animation',
);
assert.ok(
  kickPresentation.facingYaw > 1.2,
  `LEFT-wall forward turn must animate counterclockwise on camera, yaw=${kickPresentation.facingYaw}`,
);
finishSurfaceTrick(frontLeft);
const kickSettled = simulationToPresentationState(profile, frontLeft.snapshot());
assert.ok(
  Math.cos(kickSettled.facingYaw) < 0,
  `successful front turn must leave rider back-facing, yaw=${kickSettled.facingYaw}`,
);

// BACK-facing turns are symmetric too.
const backLeft = new HalfpipeSimulation(profile);
backLeft.reset({
  pipeX: wallX(profile, -1, 0.86),
  tangentVelocity: -7,
});
backLeft.state.facingTurns = 1;
backLeft.setTurnIntent(1);
backLeft.stepFixed();
assert.equal(
  backLeft.snapshot().lastTrick,
  'kick-turn',
  'back-facing rider must be allowed to turn on LEFT wall',
);

const backRight = new HalfpipeSimulation(profile);
backRight.reset({
  pipeX: wallX(profile, 1, 0.86),
  tangentVelocity: 7,
});
backRight.state.facingTurns = 1;
backRight.setTurnIntent(-1);
backRight.stepFixed();
backRight.setTurnIntent(0);
assert.equal(backRight.snapshot().lastTrick, 'kick-turn');
for (let index = 0; index < kickHalfSteps; index += 1) backRight.stepFixed();
const backKickPresentation = simulationToPresentationState(profile, backRight.snapshot());
assert.ok(
  backKickPresentation.facingYaw > Math.PI + 1.2,
  `RIGHT-wall back-facing turn must continue counterclockwise on camera, yaw=${backKickPresentation.facingYaw}`,
);
finishSurfaceTrick(backRight);
const backKickSettled = simulationToPresentationState(profile, backRight.snapshot());
assert.ok(
  Math.cos(backKickSettled.facingYaw) > 0,
  `second counterclockwise 180 must return rider front-facing, yaw=${backKickSettled.facingYaw}`,
);

// Hand Plant: coping-only, but valid on either wall.
const lowHand = new HalfpipeSimulation(profile);
lowHand.reset({
  pipeX: wallX(profile, -1, 0.975),
  tangentVelocity: -7,
});
lowHand.setHandPlantHeld(true);
lowHand.stepFixed();
assert.notEqual(
  lowHand.snapshot().lastTrick,
  'hand-plant',
  'hand plant must not trigger below the coping zone',
);

const rightSideHand = new HalfpipeSimulation(profile);
rightSideHand.reset({
  pipeX: wallX(profile, 1, 0.997),
  tangentVelocity: 7,
});
rightSideHand.setHandPlantHeld(true);
rightSideHand.stepFixed();
assert.equal(
  rightSideHand.snapshot().lastTrick,
  'hand-plant',
  'front-facing hand plant must be allowed on RIGHT wall',
);

const bufferedHand = new HalfpipeSimulation(profile);
bufferedHand.reset({
  pipeX: wallX(profile, -1, 0.985),
  tangentVelocity: -7,
});
bufferedHand.setHandPlantHeld(true);
bufferedHand.stepFixed();
bufferedHand.setHandPlantHeld(false);
for (let index = 0; index < 60 && bufferedHand.snapshot().lastTrick !== 'hand-plant'; index += 1) {
  bufferedHand.stepFixed();
}
assert.equal(
  bufferedHand.snapshot().lastTrick,
  'hand-plant',
  'a near-coping hand-plant button tap should be buffered until the rider reaches the coping zone',
);
assert.ok(
  Math.abs(
    bufferedHand.snapshot().pipeX - (profile.leftLip + bufferedHand.lipInset)
  ) < 1e-9,
  'buffered hand plant must execute at the actual coping, not at the early button-press position',
);

const hand = new HalfpipeSimulation(profile);
hand.reset({
  pipeX: wallX(profile, -1, 0.995),
  tangentVelocity: -7,
});
hand.setHandPlantHeld(true);
hand.stepFixed();
hand.setHandPlantHeld(false);
assert.equal(hand.snapshot().lastTrick, 'hand-plant');
assert.equal(hand.snapshot().surfaceTrickActive, true);
assert.ok(
  Math.abs(hand.snapshot().pipeX - (profile.leftLip + hand.lipInset)) < 1e-9,
  `hand plant must pin exactly to left coping/white bar: x=${hand.snapshot().pipeX}, lip=${profile.leftLip}`,
);
const handFrozenX = hand.snapshot().pipeX;
const handHalfSteps = Math.round(
  GAME_CONFIG.trickPresentation.handPlantDuration * 0.5 / hand.fixedDt,
);
for (let index = 0; index < handHalfSteps; index += 1) hand.stepFixed();
const handMid = hand.snapshot();
const handPresentation = simulationToPresentationState(profile, handMid);
assert.ok(
  Math.abs(handMid.pipeX - handFrozenX) < 1e-9,
  'hand plant must hold exact coping height',
);
assert.ok(
  Math.abs(handPresentation.trickRoll) > 1.0,
  `hand plant must have readable plant rotation, roll=${handPresentation.trickRoll}`,
);

// Hand Plant can never activate once the rider is airborne.
const noAirHandPlant = launchFromSide(profile, -1, 0);
noAirHandPlant.setHandPlantHeld(true);
for (let index = 0; index < 30; index += 1) noAirHandPlant.stepFixed();
assert.notEqual(
  noAirHandPlant.snapshot().lastTrick,
  'hand-plant',
  'hand plant must be impossible in air',
);
assert.equal(
  noAirHandPlant.snapshot().surfaceTrickActive,
  false,
  'airborne hand-plant input must not create a surface trick',
);

// FRONT-facing aerials can start on either side.
const frontRightAir = launchFromSide(profile, 1, 0);
frontRightAir.setTurnIntent(-1);
for (let index = 0; index < 20; index += 1) frontRightAir.stepFixed();
assert.equal(
  frontRightAir.snapshot().airTurnActive,
  true,
  'front-facing aerial must be allowed on RIGHT side',
);

const aerial = launchFromSide(profile, -1, 0);
for (let index = 0; index < 10; index += 1) aerial.stepFixed();
const turnStartY = aerial.snapshot().airY;
aerial.setTurnIntent(1);
const cleanTurnSteps = Math.round(0.3 / aerial.fixedDt);
const airHalfSteps = Math.round(cleanTurnSteps * 0.5);
for (let index = 0; index < airHalfSteps; index += 1) aerial.stepFixed();
const aerialMid = aerial.snapshot();
const aerialPresentation = simulationToPresentationState(profile, aerialMid);
assert.equal(aerialMid.airTurnActive, true);
assert.ok(
  Math.abs(aerialMid.airY - turnStartY) > 1e-4,
  'aerial rotation must not freeze authoritative vertical physics',
);
assert.ok(
  aerialMid.airRotationDegrees > 70 && aerialMid.airRotationDegrees < 110,
  `half-held aerial should be near 90 degrees: ${aerialMid.airRotationDegrees}`,
);
assert.ok(
  aerialPresentation.facingYaw > 1.2,
  `front-facing LEFT aerial must animate counterclockwise on camera, yaw=${aerialPresentation.facingYaw}`,
);
for (let index = airHalfSteps; index < cleanTurnSteps; index += 1) {
  aerial.stepFixed();
}
aerial.setTurnIntent(0);
aerial.stepFixed();
assert.equal(
  aerial.snapshot().airTurnCompleted,
  true,
  'aerial 180 must complete from sufficient held rotation input',
);
assert.equal(aerial.snapshot().airTurnActive, false);
assert.ok(
  aerial.snapshot().airRotationDegrees >= 176
    && aerial.snapshot().airRotationDegrees <= 188,
  `clean aerial rotation should resolve near 180 degrees: ${aerial.snapshot().airRotationDegrees}`,
);

// BACK-facing aerial: RIGHT side + LEFT input.
const backAir = launchFromSide(profile, 1, 1);
backAir.setTurnIntent(-1);
for (let index = 0; index < airHalfSteps; index += 1) backAir.stepFixed();
const backAirPresentation = simulationToPresentationState(profile, backAir.snapshot());
assert.equal(backAir.snapshot().airTurnActive, true);
assert.ok(
  backAir.snapshot().airRotationDegrees > 70
    && backAir.snapshot().airRotationDegrees < 110,
  `back-facing half-held aerial should be near 90 degrees: ${backAir.snapshot().airRotationDegrees}`,
);
assert.ok(
  backAirPresentation.facingYaw < Math.PI - 1.2,
  `back-facing RIGHT aerial must follow LEFT input clockwise on camera, yaw=${backAirPresentation.facingYaw}`,
);

// Pose mirroring contract when riding with back to camera.
const poseController = new SkatePoseController();
const forwardPose = { ...poseController.evaluate({
  pumpCompression: 0.35,
  landing: 0,
  speedNormalized: 0.5,
  airborne: false,
  ascending: true,
  descending: false,
  surfaceAngle: 0.9,
  facingYaw: 0,
  trickVisualActive: false,
  trickType: null,
  landingQuality: 'none',
}) };
const backwardPose = { ...poseController.evaluate({
  pumpCompression: 0.35,
  landing: 0,
  speedNormalized: 0.5,
  airborne: false,
  ascending: true,
  descending: false,
  surfaceAngle: 0.9,
  facingYaw: Math.PI,
  trickVisualActive: false,
  trickType: null,
  landingQuality: 'none',
}) };
assert.equal(forwardPose.facingSign, 1);
assert.equal(backwardPose.facingSign, -1);
assert.ok(forwardPose.torsoBalanceZ * backwardPose.torsoBalanceZ < 0);
assert.ok(forwardPose.headBalanceZ * backwardPose.headBalanceZ < 0);

// Going up either wall must immediately switch to and HOLD the jump-preload
// pose for the whole ascent, then release once the rider starts descending.
const leftAscentSim = new HalfpipeSimulation(profile);
leftAscentSim.reset({
  pipeX: wallX(profile, -1, 0.35),
  tangentVelocity: -7,
});
const leftAscentPresentation = simulationToPresentationState(
  profile,
  leftAscentSim.snapshot(),
);
const leftAscentPose = { ...poseController.evaluate(leftAscentPresentation) };
assert.equal(leftAscentPresentation.rampAscending, true);
assert.equal(leftAscentPose.ascendingPrep, true);

const rightAscentSim = new HalfpipeSimulation(profile);
rightAscentSim.reset({
  pipeX: wallX(profile, 1, 0.35),
  tangentVelocity: 7,
});
rightAscentSim.state.facingTurns = 1;
const rightAscentPresentation = simulationToPresentationState(
  profile,
  rightAscentSim.snapshot(),
);
const rightAscentPose = { ...poseController.evaluate(rightAscentPresentation) };
assert.equal(rightAscentPresentation.rampAscending, true);
assert.equal(rightAscentPose.ascendingPrep, true);

const descendingSim = new HalfpipeSimulation(profile);
descendingSim.reset({
  pipeX: wallX(profile, -1, 0.35),
  tangentVelocity: 7,
});
const descendingPresentation = simulationToPresentationState(
  profile,
  descendingSim.snapshot(),
);
const descendingPose = { ...poseController.evaluate(descendingPresentation) };
assert.equal(descendingPresentation.rampAscending, false);
assert.equal(descendingPose.ascendingPrep, false);

for (const prep of [leftAscentPose, rightAscentPose]) {
  assert.ok(
    prep.kneeFlex > descendingPose.kneeFlex + 0.35,
    `ramp ascent should use a clearly deeper knee bend: up=${prep.kneeFlex}, down=${descendingPose.kneeFlex}`,
  );
  assert.ok(
    prep.armBalance >= 1.15,
    `ramp ascent should keep both arms down near knees: ${prep.armBalance}`,
  );
  assert.ok(
    prep.forearmDrop >= 0.3,
    `ramp ascent should maintain the forearm-down preload: ${prep.forearmDrop}`,
  );
}

// Turn yaw must be linear: equal time slices produce equal angular increments.
const linearTurn = new HalfpipeSimulation(profile);
linearTurn.reset({
  pipeX: wallX(profile, -1, 0.86),
  tangentVelocity: -7,
});
linearTurn.setTurnIntent(1);
linearTurn.stepFixed();
linearTurn.setTurnIntent(0);
assert.ok(
  GAME_CONFIG.trickPresentation.kickTurnDuration <= 0.42,
  `kick turn should be faster and snappier: ${GAME_CONFIG.trickPresentation.kickTurnDuration}`,
);
assert.ok(
  GAME_CONFIG.trickPresentation.aerialTurnDuration <= 0.47,
  `aerial turn should be faster and snappier: ${GAME_CONFIG.trickPresentation.aerialTurnDuration}`,
);
const durationSteps = Math.round(
  GAME_CONFIG.trickPresentation.kickTurnDuration / linearTurn.fixedDt,
);
const sampleAt = new Set([
  Math.round(durationSteps * 0.25),
  Math.round(durationSteps * 0.50),
  Math.round(durationSteps * 0.75),
]);
const yawSamples = [0];
for (let index = 1; index <= durationSteps; index += 1) {
  linearTurn.stepFixed();
  if (sampleAt.has(index)) {
    yawSamples.push(
      simulationToPresentationState(profile, linearTurn.snapshot()).facingYaw,
    );
  }
}
yawSamples.push(
  simulationToPresentationState(profile, linearTurn.snapshot()).facingYaw,
);
assert.equal(yawSamples.length, 5);
const yawDeltas = yawSamples.slice(1).map(
  (value, index) => value - yawSamples[index],
);
const avgYawDelta = yawDeltas.reduce((sum, value) => sum + value, 0)
  / yawDeltas.length;
for (const delta of yawDeltas) {
  assert.ok(
    Math.abs(delta - avgYawDelta) < 0.12,
    `turn rotation must stay linear without midpoint speed-up: ${JSON.stringify({ yawSamples, yawDeltas })}`,
  );
}

console.log(JSON.stringify({
  dropIn: {
    pipeX: dropStart.pipeX,
    rightLip: profile.rightLip,
    facingYaw: dropPresentation.facingYaw,
    dropInRoll: dropPresentation.dropInRoll,
  },
  frontLeftTurn: {
    midpointYaw: kickPresentation.facingYaw,
    settledYaw: kickSettled.facingYaw,
  },
  backRightTurn: {
    midpointYaw: backKickPresentation.facingYaw,
    settledYaw: backKickSettled.facingYaw,
  },
  handPlant: {
    frozenX: handFrozenX,
    midpointRoll: handPresentation.trickRoll,
  },
  aerial: {
    turnStartY,
    midpointYaw: aerialPresentation.facingYaw,
    resumedVerticalVelocity: aerial.snapshot().airVerticalVelocity,
  },
  backAerial: {
    midpointYaw: backAirPresentation.facingYaw,
  },
  ascendingPrep: {
    leftKneeFlex: leftAscentPose.kneeFlex,
    rightKneeFlex: rightAscentPose.kneeFlex,
    armBalance: leftAscentPose.armBalance,
    forearmDrop: leftAscentPose.forearmDrop,
    descendingKneeFlex: descendingPose.kneeFlex,
  },
  linearTurn: {
    yawSamples,
    yawDeltas,
  },
  poseMirror: {
    forward: {
      facingSign: forwardPose.facingSign,
      torsoBalanceZ: forwardPose.torsoBalanceZ,
      headBalanceZ: forwardPose.headBalanceZ,
    },
    backward: {
      facingSign: backwardPose.facingSign,
      torsoBalanceZ: backwardPose.torsoBalanceZ,
      headBalanceZ: backwardPose.headBalanceZ,
    },
  },
}, null, 2));
