import assert from 'node:assert/strict';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { evaluateLanding, LANDING_QUALITIES } from '../src/gameplay/HalfpipeLandingSystem.js';

class Vec2 {
  constructor(x, y) { this.x = x; this.y = y; }
  clone() { return new Vec2(this.x, this.y); }
  multiplyScalar(s) { this.x *= s; this.y *= s; return this; }
}
class Profile {
  constructor() {
    this.flatHalfWidth = 2.35;
    this.transitionWidth = 5.62;
    this.transitionHeight = 6.62;
    this.leftLip = -(this.flatHalfWidth + this.transitionWidth);
    this.rightLip = this.flatHalfWidth + this.transitionWidth;
  }
  sample(x) {
    const cx = Math.max(this.leftLip, Math.min(this.rightLip, x));
    const ax = Math.abs(cx);
    if (ax <= this.flatHalfWidth) {
      return {x:cx,y:0,region:'flat-bottom',tangent:new Vec2(1,0),normal:new Vec2(0,1)};
    }
    const side = Math.sign(cx) || 1;
    const t = Math.max(0, Math.min(1, (ax-this.flatHalfWidth)/this.transitionWidth));
    const safeRoot = Math.sqrt(Math.max(1e-6,1-t*t));
    const y = this.transitionHeight*(1-safeRoot);
    const slope = (this.transitionHeight*t)/(this.transitionWidth*safeRoot);
    const len = Math.hypot(1,slope);
    return {
      x:cx,y,region:side<0?'left-transition':'right-transition',
      tangent:new Vec2(side/len,slope/len),
      normal:new Vec2(-slope/len,side/len),
    };
  }
}
const profile = new Profile();

const launch = new HalfpipeSimulation(profile);
assert.equal(launch.computeLaunchVelocity(1.19), 0);
const atThreshold = launch.computeLaunchVelocity(1.2);
const justAbove = launch.computeLaunchVelocity(1.21);
assert.ok(atThreshold > 0 && atThreshold < 2);
assert.ok(justAbove - atThreshold < 0.05);
assert.ok(launch.computeLaunchVelocity(18) > 28);
assert.ok(launch.computeLaunchVelocity(18) <= 38 + 1e-9);

launch._enterAir(-1, -12, profile.leftLip + launch.airTakeoffInset);
launch.state.currentAirPeakY += 2;
launch.state.runMaxAirY = launch.state.currentAirPeakY;
launch.state.maxAirY = launch.state.runMaxAirY;
const previousRunMax = launch.state.runMaxAirY;
launch.state.mode = 'contact';
launch._enterAir(1, 4, profile.rightLip - launch.airTakeoffInset);
assert.equal(launch.state.currentAirPeakY, launch.state.currentAirBaseY);
assert.equal(launch.state.runMaxAirY, previousRunMax);

const tap = new HalfpipeSimulation(profile);
tap._enterAir(-1, -14, profile.leftLip + tap.airTakeoffInset);
const beforeY = tap.state.airY;
tap.setTurnIntent(1);
for (let i=0;i<5;i++) tap.stepFixed();
const duringY = tap.state.airY;
assert.notEqual(duringY, beforeY);
tap.setTurnIntent(0);
tap.stepFixed();
assert.equal(tap.state.airTurnCompleted, false);
assert.equal(tap.state.airTurnFailedReason, 'UNDER_ROTATED');

const clean = new HalfpipeSimulation(profile);
clean._enterAir(-1, -16, profile.leftLip + clean.airTakeoffInset);
clean.setTurnIntent(1);
for (let i=0;i<36;i++) clean.stepFixed();
clean.setTurnIntent(0);
clean.stepFixed();
assert.equal(clean.state.airTurnCompleted, true);
assert.equal(clean.state.airTurnFailedReason, null);
assert.ok(clean.state.airRotationDegrees >= 170 && clean.state.airRotationDegrees <= 190);
assert.equal(clean.state.airRotationTargetDegrees, 180);

const spin360 = new HalfpipeSimulation(profile);
spin360._enterAir(1, 22, profile.rightLip - spin360.airTakeoffInset);
spin360.setTurnIntent(-1);
for (let i=0;i<72;i++) spin360.stepFixed();
spin360.setTurnIntent(0);
spin360.stepFixed();
assert.equal(spin360.state.airTurnCompleted, true);
assert.equal(spin360.state.airRotationTargetDegrees, 360);

const over = new HalfpipeSimulation(profile);
over._enterAir(-1, -30, profile.leftLip + over.airTakeoffInset);
over.setTurnIntent(1);
for (let i=0;i<50;i++) over.stepFixed();
over.setTurnIntent(0);
over.stepFixed();
assert.equal(over.state.airTurnOverturned, true);
assert.equal(over.state.airTurnFailedReason, 'OVER_ROTATED');

const backflip = new HalfpipeSimulation(profile);
backflip._enterAir(-1, -24, profile.leftLip + backflip.airTakeoffInset);
backflip.setBackflipHeld(true);
for (let i=0;i<86;i++) backflip.stepFixed();
backflip.setBackflipHeld(false);
backflip.stepFixed();
assert.equal(backflip.state.backflipCompleted, true);
assert.equal(backflip.state.backflipTargetDegrees, 360);

assert.equal(evaluateLanding({impactSpeed:8}).quality, LANDING_QUALITIES.PERFECT);
assert.equal(evaluateLanding({impactSpeed:16}).quality, LANDING_QUALITIES.CLEAN);
assert.equal(evaluateLanding({impactSpeed:20}).quality, LANDING_QUALITIES.SKETCHY);
assert.equal(evaluateLanding({impactSpeed:24}).quality, LANDING_QUALITIES.HEAVY);
assert.equal(evaluateLanding({impactSpeed:27}).quality, LANDING_QUALITIES.BAIL);

const surface = new HalfpipeSimulation(profile);
surface.reset({ pipeX: -(profile.flatHalfWidth + profile.transitionWidth*0.85), tangentVelocity:-8 });
surface.setTurnIntent(1);
surface.stepFixed();
assert.equal(surface.state.surfaceTrickActive, true);
assert.equal(surface.state.score, 0);
while (surface.state.surfaceTrickActive) surface.stepFixed();
assert.ok(surface.state.score > 0);

const oppositeWallSurface = new HalfpipeSimulation(profile);
oppositeWallSurface.reset({
  pipeX: profile.flatHalfWidth + profile.transitionWidth * 0.85,
  tangentVelocity: 8,
});
oppositeWallSurface.setTurnIntent(1);
oppositeWallSurface.stepFixed();
assert.equal(
  oppositeWallSurface.state.surfaceTrickActive,
  true,
  'turns must work on either wall regardless of facing',
);

const failedHandPlant = new HalfpipeSimulation(profile);
failedHandPlant.reset({
  pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.995),
  tangentVelocity: -7,
});
failedHandPlant.handPlantBufferRemaining = 0.1;
failedHandPlant.stepFixed();
assert.equal(failedHandPlant.state.surfaceTrickActive, true);
while (failedHandPlant.state.surfaceTrickActive) failedHandPlant.stepFixed();
assert.equal(failedHandPlant.state.crashActive, true);
assert.equal(failedHandPlant.state.crashReason, 'HAND_PLANT_TIMING');

const scoring = new HalfpipeSimulation(profile);
const first = scoring._awardValidatedTrick('kick-turn',1,1,-1);
const second = scoring._awardValidatedTrick('kick-turn',1,1,1);
const third = scoring._awardValidatedTrick('kick-turn',1,1,-1);
assert.ok(second < first * 1.25 * 1.2);
assert.ok(third < first * 1.5 * 1.2);

scoring._startCrash('BAD_LANDING');
assert.equal(scoring.state.comboCount, 0);
assert.equal(scoring.state.comboMultiplier, 1);
assert.equal(scoring.state.crashActive, true);
assert.ok(scoring.drainEvents().some((event)=>event.type==='BAIL'));

function run() {
  const sim = new HalfpipeSimulation(profile);
  sim.reset({pipeX:4,tangentVelocity:-3});
  for (let i=0;i<600;i++) {
    const s = sim.snapshot();
    sim.setPumpIntent(s.pipeX*s.tangentVelocity>=0?1:-1);
    sim.stepFixed();
  }
  sim.drainEvents();
  return sim.snapshot();
}
assert.deepEqual(run(), run());

console.log('Phase 4 gameplay-core checks passed.');
