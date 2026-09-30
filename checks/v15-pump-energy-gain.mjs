import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { PHASE4_GAMEPLAY_CONFIG } from '../src/gameplay/phase4GameplayConfig.js';
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
const recovery = PHASE4_GAMEPLAY_CONFIG.pumping.lowEnergyRecovery;

function makeSimulation({ wallFraction, velocity }) {
  const sim = new HalfpipeSimulation(profile);
  const pipeX = -(profile.flatHalfWidth + profile.transitionWidth * wallFraction);
  sim.reset({ pipeX, tangentVelocity: velocity });
  return sim;
}

function stepComparison({ wallFraction, velocity, intent, expectedRating }) {
  const pumped = makeSimulation({ wallFraction, velocity });
  const coast = makeSimulation({ wallFraction, velocity });

  pumped.setPumpIntent(intent);
  const pumpedState = pumped.stepFixed();
  const coastState = coast.stepFixed();
  const boost = pumped.drainEvents().find((event) => event.type === 'PUMP_BOOST') || null;

  assert.equal(pumpedState.pumpRating, expectedRating);
  return {
    pumpedState,
    coastState,
    boost,
    speedGain: Math.abs(pumpedState.tangentVelocity) - Math.abs(coastState.tangentVelocity),
  };
}

// A PERFECT pump must create a clear, immediate gain that cannot be swallowed
// by gravity/drag before the player reaches the next passage.
{
  const perfect = stepComparison({
    wallFraction: 0.62,
    velocity: -3,
    intent: 1,
    expectedRating: 'PERFECT',
  });
  assert.ok(
    perfect.speedGain >= 0.9,
    `PERFECT low-energy pump should visibly gain speed immediately, got ${perfect.speedGain}`,
  );
  assert.ok(perfect.pumpedState.lastPumpImpulse >= 0.9);
  assert.ok(perfect.pumpedState.pumpBoosts >= 1);
  assert.equal(perfect.boost?.rating, 'PERFECT');
  assert.ok(perfect.boost?.speedAfter > perfect.boost?.speedBefore);
}

// GOOD timing must also accelerate the rider, but by less than PERFECT.
{
  const good = stepComparison({
    wallFraction: 0.80,
    velocity: -3,
    intent: 1,
    expectedRating: 'GOOD',
  });
  assert.ok(
    good.speedGain >= 0.55,
    `GOOD low-energy pump should gain useful speed, got ${good.speedGain}`,
  );
  assert.ok(good.pumpedState.lastPumpImpulse >= 0.55);
}

// Wrong-direction input never receives the guaranteed energy reward.
{
  const wrong = stepComparison({
    wallFraction: 0.62,
    velocity: -3,
    intent: -1,
    expectedRating: 'WRONG',
  });
  assert.equal(wrong.pumpedState.lastPumpImpulse, 0);
  assert.equal(wrong.pumpedState.pumpBoosts, 0);
  assert.equal(wrong.boost, null);
}

// The reward tapers and stops at a controlled useful-speed target rather than
// becoming an infinite arcade boost at high velocity.
{
  const nearTarget = makeSimulation({
    wallFraction: 0.62,
    velocity: -(recovery.rewardTargetSpeed - 0.1),
  });
  nearTarget.setPumpIntent(1);
  const state = nearTarget.stepFixed();
  assert.equal(state.pumpRating, 'PERFECT');
  assert.ok(state.lastPumpImpulse >= 0);
  assert.ok(
    state.lastPumpImpulse <= 0.11,
    `pump impulse must respect the recovery target cap, got ${state.lastPumpImpulse}`,
  );
}

assert.ok(recovery.referenceSpeed >= 7.5);
assert.ok(recovery.rewardTargetSpeed >= 11.5);
assert.ok(recovery.attemptImpulseByRating.PERFECT > recovery.attemptImpulseByRating.GOOD);
assert.ok(recovery.attemptImpulseByRating.GOOD > recovery.attemptImpulseByRating.WEAK);

console.log('V15 pump energy-gain checks passed.');
