import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';
import { HandPlantIK } from '../src/character/HandPlantIK.js';
import { installHalfpipeV9GameplayPatches } from '../src/v9/installHalfpipeV9GameplayPatches.js';

installHalfpipeV9GameplayPatches();

class Profile {
  constructor() {
    this.flatHalfWidth = 2.35;
    this.transitionWidth = 5.62;
    this.transitionHeight = 6.62;
    this.leftLip = -(this.flatHalfWidth + this.transitionWidth);
    this.rightLip = this.flatHalfWidth + this.transitionWidth;
  }

  sample(x) {
    const cx = THREE.MathUtils.clamp(Number(x) || 0, this.leftLip, this.rightLip);
    const ax = Math.abs(cx);
    if (ax <= this.flatHalfWidth) {
      return {
        x: cx,
        y: 0,
        region: 'flat-bottom',
        tangent: new THREE.Vector2(1, 0),
        normal: new THREE.Vector2(0, 1),
      };
    }
    const side = Math.sign(cx) || 1;
    const t = THREE.MathUtils.clamp(
      (ax - this.flatHalfWidth) / this.transitionWidth,
      0,
      1,
    );
    const safeRoot = Math.sqrt(Math.max(1e-6, 1 - t * t));
    const y = this.transitionHeight * (1 - safeRoot);
    const slope = (this.transitionHeight * t) / (this.transitionWidth * safeRoot);
    const length = Math.hypot(1, slope);
    return {
      x: cx,
      y,
      region: side < 0 ? 'left-transition' : 'right-transition',
      tangent: new THREE.Vector2(side / length, slope / length),
      normal: new THREE.Vector2(-slope / length, side / length),
    };
  }
}

const profile = new Profile();

function runUntilContact(sim, maxSteps = 360) {
  for (let index = 0; index < maxSteps && sim.state.mode === 'airborne'; index += 1) {
    sim.stepFixed();
  }
  assert.equal(sim.state.mode, 'contact', 'airborne simulation should land within the bounded window');
}

function completeSpin(targetDegrees, incomingSpeed) {
  const sim = new HalfpipeSimulation(profile);
  sim._enterAir(-1, -incomingSpeed, profile.leftLip + sim.airTakeoffInset);
  sim.setTurnIntent(-1);
  const steps = Math.round(targetDegrees / 900 * 120);
  for (let index = 0; index < steps; index += 1) sim.stepFixed();
  sim.setTurnIntent(0);
  runUntilContact(sim);

  const expected = `aerial-${targetDegrees}`;
  const landing = sim.drainEvents().findLast?.((event) => event.type === 'LANDING')
    || null;
  assert.equal(sim.state.lastTrick, expected, `${targetDegrees} should land as ${expected}`);
  assert.ok(sim.state.tricksLanded >= 1, `${targetDegrees} should increment landed tricks`);
  assert.equal(landing?.trick, expected, `${targetDegrees} landing event should preserve the resolved trick`);
  return sim;
}

function completeBackflip(targetDegrees, incomingSpeed) {
  const sim = new HalfpipeSimulation(profile);
  sim._enterAir(-1, -incomingSpeed, profile.leftLip + sim.airTakeoffInset);
  sim.setBackflipHeld(true);
  const steps = Math.round(targetDegrees / 720 * 120);
  for (let index = 0; index < steps; index += 1) sim.stepFixed();
  sim.setBackflipHeld(false);
  sim.stepFixed();
  runUntilContact(sim);

  const expected = targetDegrees >= 720 ? 'double-backflip' : 'backflip';
  const landing = sim.drainEvents().findLast?.((event) => event.type === 'LANDING')
    || null;
  assert.equal(sim.state.lastTrick, expected, `${targetDegrees} should land as ${expected}`);
  assert.ok(sim.state.tricksLanded >= 1, `${targetDegrees} should increment landed tricks`);
  assert.equal(landing?.trick, expected, `${targetDegrees} landing event should preserve the resolved trick`);
  return sim;
}

// 1) Takeoff continuity: no 1.19 -> 1.20 giant pop.
{
  const sim = new HalfpipeSimulation(profile);
  const below = sim.computeLaunchVelocity(1.19);
  const at = sim.computeLaunchVelocity(1.20);
  const above = sim.computeLaunchVelocity(1.21);
  assert.equal(below, 0);
  assert.equal(at, 0);
  assert.ok(above >= 0 && above < 0.01, `near-threshold pop should be tiny, got ${above}`);
  assert.ok(sim.computeLaunchVelocity(12) > above);
  assert.equal(sim.computeLaunchVelocity(22), 27);
}

// 2) Full-air reachability under momentum requirements.
completeSpin(180, 8);
completeSpin(360, 11);
completeSpin(540, 14);
completeSpin(720, 18);
completeSpin(900, 22);
completeBackflip(360, 14);
const doubleFlip = completeBackflip(720, 22);
assert.equal(doubleFlip.state.lastTrick, 'double-backflip');

// 3) Landing animation envelope is normalized independently from impact.
for (const impact of [20, 30, 40, 50]) {
  const state = {
    mode: 'contact',
    time: 1,
    pipeX: 0,
    tangentVelocity: 1,
    landingActive: true,
    landingRemaining: 0.14,
    landingImpact: impact,
    landingQuality: 'clean',
    crashActive: false,
  };
  const presentation = simulationToPresentationState(profile, state);
  assert.ok(presentation.landing >= 0 && presentation.landing <= 1);
  assert.ok(Math.abs(presentation.landing - 0.5) < 0.02);
  assert.equal(presentation.landingImpact, impact);

  const finished = simulationToPresentationState(profile, {
    ...state,
    landingActive: false,
    landingRemaining: 0,
  });
  assert.equal(finished.landing, 0, `impact ${impact} must not leave landing pose stuck`);
  assert.equal(finished.landingImpact, impact);
}

// 4) Correct low-speed pumping rebuilds amplitude; wrong pumping gets no free assist.
function lowSpeedRun({ pipeX, velocity, correct = true, steps = 900 }) {
  const sim = new HalfpipeSimulation(profile);
  sim.reset({ pipeX, tangentVelocity: velocity });
  let maxAmplitude = Math.abs(pipeX);
  let maxSpeed = Math.abs(velocity);
  for (let index = 0; index < steps; index += 1) {
    const state = sim.snapshot();
    const desired = state.pipeX * state.tangentVelocity >= 0 ? 1 : -1;
    sim.setPumpIntent(correct ? desired : -desired);
    const next = sim.stepFixed();
    maxAmplitude = Math.max(maxAmplitude, Math.abs(next.pipeX));
    maxSpeed = Math.max(maxSpeed, Math.abs(next.tangentVelocity));
  }
  return { sim, maxAmplitude, maxSpeed };
}

for (const start of [
  { pipeX: 0.05, velocity: 0.7 },
  { pipeX: -0.1, velocity: 1.0 },
  { pipeX: profile.flatHalfWidth + 0.3, velocity: -1.5 },
]) {
  const correct = lowSpeedRun({ ...start, correct: true });
  const wrong = lowSpeedRun({ ...start, correct: false });
  assert.ok(
    correct.maxAmplitude > Math.max(profile.flatHalfWidth + 0.35, wrong.maxAmplitude),
    `correct pumping should recover wall amplitude from ${JSON.stringify(start)}`,
  );
  assert.ok(
    correct.sim.state.pumpWorkTotal > wrong.sim.state.pumpWorkTotal,
    'wrong pumping must not receive equivalent free acceleration',
  );
}

// 5) Kick Turn has a short buffer and continuous motion through the pivot.
{
  const sim = new HalfpipeSimulation(profile);
  sim.reset({
    pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.77),
    tangentVelocity: -10,
  });
  sim.setTurnIntent(1);
  sim.stepFixed();
  sim.setTurnIntent(0);
  for (let index = 0; index < 12 && !sim.state.surfaceTrickActive; index += 1) sim.stepFixed();
  assert.equal(sim.state.surfaceTrickActive, true, 'buffered Kick Turn should fire on entering valid wall region');
  assert.equal(sim.state.surfaceTrickType, 'kick-turn');

  const velocities = [];
  while (sim.state.surfaceTrickActive) {
    velocities.push(sim.state.tangentVelocity);
    sim.stepFixed();
  }
  assert.ok(velocities.some((value) => Math.abs(value) > 0.2), 'Kick Turn must not freeze for the whole trick');
  assert.ok(velocities.some((value) => value < -0.05));
  assert.ok(velocities.some((value) => value > 0.05));
}

// 6) Rejected attempts are semantic, edge-triggered and do not spam every frame.
{
  const sim = new HalfpipeSimulation(profile);
  sim.reset({ pipeX: 0, tangentVelocity: 1 });
  sim.setTurnIntent(1);
  sim.setTurnIntent(0);
  for (let index = 0; index < 40; index += 1) sim.stepFixed();
  const rejected = sim.drainEvents().filter((event) => event.type === 'TRICK_REJECTED');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'TOO_EARLY');
}

// 7) Hand Plant locks the selected hand for the whole active maneuver.
{
  const riderRoot = new THREE.Group();
  const makeArm = (x) => {
    const upper = new THREE.Object3D();
    const forearm = new THREE.Object3D();
    const hand = new THREE.Object3D();
    upper.position.set(x, 1, 0);
    forearm.position.set(0, -0.35, 0);
    hand.position.set(0, -0.35, 0);
    upper.add(forearm);
    forearm.add(hand);
    riderRoot.add(upper);
    return { upper, forearm, hand };
  };
  const left = makeArm(-0.8);
  const right = makeArm(0.8);
  const ik = new HandPlantIK({
    riderRoot,
    rigAdapter: {
      capabilities: { leftArm: true, rightArm: true },
      rig: {
        leftUpperArm: left.upper,
        leftForearm: left.forearm,
        leftHand: left.hand,
        leftShoulder: null,
        rightUpperArm: right.upper,
        rightForearm: right.forearm,
        rightHand: right.hand,
        rightShoulder: null,
      },
    },
  });
  riderRoot.updateWorldMatrix(true, true);
  const first = ik.update({
    active: true,
    progress: 0.3,
    copingWorldPoint: { x: -0.85, y: 0.3, z: 0 },
  });
  const selected = first.selectedPlantHand;
  assert.equal(selected, 'left');
  const second = ik.update({
    active: true,
    progress: 0.6,
    copingWorldPoint: { x: 0.85, y: 0.3, z: 0 },
  });
  assert.equal(second.selectedPlantHand, selected, 'plant hand must never switch mid-trick');
  assert.ok(second.plantHandWorldPosition?.isVector3);
  assert.ok(second.plantTargetWorldPosition?.isVector3);
  assert.ok(Number.isFinite(second.contactError));
  ik.update({ active: false });
  assert.equal(ik.selectedPlantHand, null);
}

console.log('V9 gameplay regression checks passed.');
