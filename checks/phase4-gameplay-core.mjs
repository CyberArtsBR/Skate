import assert from 'node:assert/strict';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { PHASE4_GAMEPLAY_CONFIG } from '../src/gameplay/phase4GameplayConfig.js';
import {
  evaluatePumpRating,
  PUMP_RATINGS,
} from '../src/gameplay/HalfpipePumpRating.js';
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

assert.equal(PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention, 0.90);
assert.equal(PHASE4_GAMEPLAY_CONFIG.pumping.acceleration, 8.2);
assert.equal(PHASE4_GAMEPLAY_CONFIG.aerial.maximumDegrees, 720);
assert.ok(PHASE4_GAMEPLAY_CONFIG.aerial.v9RotationDegreesPerSecond < 900);
assert.equal(
  evaluatePumpRating({
    intent: 1,
    desiredIntent: 1,
    wallFraction: 0.72,
    speedEligible: true,
  }),
  PUMP_RATINGS.PERFECT,
);
assert.equal(
  evaluatePumpRating({
    intent: 1,
    desiredIntent: 1,
    wallFraction: 0.85,
    speedEligible: true,
  }),
  PUMP_RATINGS.GOOD,
);
assert.equal(
  evaluatePumpRating({
    intent: 1,
    desiredIntent: 1,
    wallFraction: 0.26,
    speedEligible: true,
  }),
  PUMP_RATINGS.WEAK,
);

const launch = new HalfpipeSimulation(profile);
assert.equal(launch.computeLaunchVelocity(1.19), 0);
const atThreshold = launch.computeLaunchVelocity(1.2);
const justAbove = launch.computeLaunchVelocity(1.21);
assert.equal(atThreshold, 0);
assert.ok(justAbove >= 0 && justAbove < 0.01);
assert.ok(launch.computeLaunchVelocity(18) > 20);
assert.ok(launch.computeLaunchVelocity(18) <= 27 + 1e-9);
const maxLaunchVelocity = launch.computeLaunchVelocity(22);
assert.ok(Math.abs(maxLaunchVelocity - 27) < 1e-9);
const maxAirHeight = (maxLaunchVelocity * maxLaunchVelocity) / (2 * launch.airGravity);
assert.ok(
  maxAirHeight > 7 && maxAirHeight < 7.5,
  `V9 preserves the reduced-height maximum air envelope: ${maxAirHeight}`,
);

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
tap.setTurnIntent(-1);
for (let i=0;i<5;i++) tap.stepFixed();
const duringY = tap.state.airY;
assert.notEqual(duringY, beforeY);
assert.ok(tap.state.airRotationSignedDegrees > 0, 'front-facing LEFT must rotate counter-clockwise');
tap.setTurnIntent(0);
tap.stepFixed();
assert.equal(tap.state.airTurnCompleted, false);
assert.equal(tap.state.airTurnFailedReason, null, 'releasing in air must pause, not fail the trick');
assert.equal(tap.state.airTurnActive, false);

const aerialRate = PHASE4_GAMEPLAY_CONFIG.aerial.v9RotationDegreesPerSecond;
const stepsForAerialDegrees = (sim, degrees) => Math.round((degrees / aerialRate) / sim.fixedDt);

const clean = new HalfpipeSimulation(profile);
clean._enterAir(-1, -16, profile.leftLip + clean.airTakeoffInset);
clean.setTurnIntent(-1);
for (let i=0;i<stepsForAerialDegrees(clean, 180);i++) clean.stepFixed();
clean.setTurnIntent(0);
clean.stepFixed();
assert.equal(clean.state.airTurnCompleted, false);
clean._finishAirTurnFromInput();
assert.equal(clean.state.airTurnCompleted, true);
assert.equal(clean.state.airTurnFailedReason, null);
assert.ok(clean.state.airRotationDegrees >= 170 && clean.state.airRotationDegrees <= 190);
assert.equal(clean.state.airRotationTargetDegrees, 180);
assert.equal(clean.state.airTurnDirection, 1);

const spin360 = new HalfpipeSimulation(profile);
spin360._enterAir(1, 22, profile.rightLip - spin360.airTakeoffInset);
spin360.setTurnIntent(-1);
for (let i=0;i<stepsForAerialDegrees(spin360, 360);i++) spin360.stepFixed();
spin360.setTurnIntent(0);
spin360.stepFixed();
spin360._finishAirTurnFromInput();
assert.equal(spin360.state.airTurnCompleted, true);
assert.equal(spin360.state.airRotationTargetDegrees, 360);

const over = new HalfpipeSimulation(profile);
over._enterAir(-1, -30, profile.leftLip + over.airTakeoffInset);
over.setTurnIntent(-1);
for (let i=0;i<stepsForAerialDegrees(over, 240);i++) over.stepFixed();
assert.ok(over.state.airRotationDegrees > 230);

// Correct the over-turn before landing by steering in the opposite direction.
over.setTurnIntent(1);
for (let i=0;i<stepsForAerialDegrees(over, 60);i++) over.stepFixed();
assert.ok(
  over.state.airRotationDegrees >= 175 && over.state.airRotationDegrees <= 185,
  `opposite in-air input should rewind rotation toward 180: ${over.state.airRotationDegrees}`,
);
over.setTurnIntent(0);
over.stepFixed();
over._finishAirTurnFromInput();
assert.equal(over.state.airTurnCompleted, true);
assert.equal(over.state.airTurnFailedReason, null);

const backflip = new HalfpipeSimulation(profile);
backflip._enterAir(-1, -24, profile.leftLip + backflip.airTakeoffInset);
backflip.setBackflipHeld(true);
for (let i=0;i<60;i++) backflip.stepFixed();
backflip.setBackflipHeld(false);
backflip.stepFixed();
assert.equal(backflip.state.backflipCompleted, true);
assert.equal(backflip.state.backflipTargetDegrees, 360);

assert.equal(evaluateLanding({impactSpeed:20}).quality, LANDING_QUALITIES.PERFECT);
assert.equal(evaluateLanding({impactSpeed:32}).quality, LANDING_QUALITIES.CLEAN);
assert.equal(evaluateLanding({impactSpeed:43}).quality, LANDING_QUALITIES.SKETCHY);
assert.equal(evaluateLanding({impactSpeed:49}).quality, LANDING_QUALITIES.HEAVY);
assert.equal(evaluateLanding({impactSpeed:54}).quality, LANDING_QUALITIES.BAIL);

const bailRecovery = new HalfpipeSimulation(profile);
const bailTakeoff = bailRecovery._enterAir(
  -1,
  -20,
  profile.leftLip + bailRecovery.airTakeoffInset,
);
bailRecovery._resolveLanding(-1, bailTakeoff.y, -60);
assert.equal(bailRecovery.state.crashActive, true);
assert.ok(
  bailRecovery.state.tangentVelocity > 50 && bailRecovery.state.tangentVelocity < 51.5,
  `bail should retain about 90% of landing momentum, got ${bailRecovery.state.tangentVelocity}`,
);
assert.equal(PHASE4_GAMEPLAY_CONFIG.crash.pumpLockSeconds, 0.18);
assert.ok(PHASE4_GAMEPLAY_CONFIG.crash.recoveryPumpAccelerationMultiplier > 1);

let firstRecoveryPumpTime = null;
const pumpWorkBeforeRecovery = bailRecovery.state.pumpWorkTotal;
for (let i = 0; i < Math.ceil(0.7 / bailRecovery.fixedDt); i += 1) {
  const state = bailRecovery.snapshot();
  const desiredIntent = state.pipeX * state.tangentVelocity >= 0 ? 1 : -1;
  bailRecovery.setPumpIntent(desiredIntent);
  const next = bailRecovery.stepFixed();
  if (firstRecoveryPumpTime === null && next.pumpActive) {
    firstRecoveryPumpTime = next.time;
  }
}
assert.ok(
  firstRecoveryPumpTime !== null
    && firstRecoveryPumpTime <= PHASE4_GAMEPLAY_CONFIG.crash.pumpLockSeconds + 0.08,
  `pump authority should return quickly after bail, first active at ${firstRecoveryPumpTime}`,
);
assert.ok(
  bailRecovery.state.pumpWorkTotal > pumpWorkBeforeRecovery,
  'post-bail recovery pumping should add energy before crash recovery finishes',
);
assert.equal(
  bailRecovery.state.crashActive,
  true,
  'pump recovery should begin while the bail animation/recovery is still active',
);

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
assert.equal(
  oppositeWallSurface.state.lastTrickTurnDirection,
  -1,
  'front-facing RIGHT input must rotate clockwise',
);

const frontFacingLeftTurn = new HalfpipeSimulation(profile);
frontFacingLeftTurn.reset({
  pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.85),
  tangentVelocity: -8,
});
frontFacingLeftTurn.setTurnIntent(-1);
frontFacingLeftTurn.stepFixed();
assert.equal(
  frontFacingLeftTurn.state.lastTrickTurnDirection,
  1,
  'front-facing LEFT input must rotate counter-clockwise',
);

const backFacingControls = new HalfpipeSimulation(profile);
backFacingControls.reset({
  pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.85),
  tangentVelocity: -8,
});
backFacingControls.state.facingTurns = 1;
backFacingControls.setTurnIntent(-1);
backFacingControls.stepFixed();
assert.equal(
  backFacingControls.state.lastTrickTurnDirection,
  -1,
  'back-facing LEFT input must invert to clockwise',
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

const score180 = new HalfpipeSimulation(profile)._awardValidatedTrick('aerial-180', 1, 1, -1);
const score360 = new HalfpipeSimulation(profile)._awardValidatedTrick('aerial-360', 1, 1, -1);
const score540 = new HalfpipeSimulation(profile)._awardValidatedTrick('aerial-540', 1, 1, -1);
const scoreFakie540 = new HalfpipeSimulation(profile)._awardValidatedTrick('fakie-aerial-540', 1, 1, -1);
const score720 = new HalfpipeSimulation(profile)._awardValidatedTrick('aerial-720', 1, 1, -1);
const score900 = new HalfpipeSimulation(profile)._awardValidatedTrick('aerial-900', 1, 1, -1);
const scoreBackflip = new HalfpipeSimulation(profile)._awardValidatedTrick('backflip', 1, 1, -1);
const scoreDoubleBackflip = new HalfpipeSimulation(profile)._awardValidatedTrick('double-backflip', 1, 1, -1);
assert.ok(score360 > score180);
assert.ok(score540 > score360);
assert.equal(scoreFakie540, Math.round(score540 * 1.1));
assert.ok(score720 > score540);
assert.ok(score900 > score720);
assert.ok(scoreBackflip > score360);
assert.ok(scoreDoubleBackflip > scoreBackflip);

const fakieIdentity = new HalfpipeSimulation(profile);
fakieIdentity.state.facingTurns = 1;
fakieIdentity._enterAir(-1, 12, profile.leftLip);
assert.equal(fakieIdentity.state.airTakeoffFakie, true);
assert.equal(fakieIdentity.drainEvents().find(event => event.type === 'TAKEOFF')?.fakie, true);

const varietyIdentity = new HalfpipeSimulation(profile);
varietyIdentity._awardValidatedTrick('aerial-540', 1, 1, -1);
varietyIdentity._awardValidatedTrick('fakie-aerial-540', 1, 1, 1);
assert.equal(varietyIdentity.state.repeatedTrickCount, 1,
  'fakie aerial should be a distinct variety entry');

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
