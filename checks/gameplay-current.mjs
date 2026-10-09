import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { PHASE4_GAMEPLAY_CONFIG } from '../src/gameplay/phase4GameplayConfig.js';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';

const profile = new HalfpipeProfile();
const simulation = new HalfpipeSimulation(profile, {
  initialState: {
    pipeX: profile.rightLip - 0.08,
    tangentVelocity: 0,
  },
});

assert.equal(GAME_CONFIG.passivePhysics.fixedHz, 120, 'authoritative simulation must remain 120 Hz');
assert.ok(Math.abs(simulation.fixedDt - 1 / 120) < 1e-12, 'fixedDt must resolve to 1/120');

// These values describe the current approved gameplay, not historical V9/Phase 4 tuning.
assert.equal(PHASE4_GAMEPLAY_CONFIG.pumping.acceleration, 16.0);
assert.equal(PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention, 0.8);
assert.equal(PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantEligibilityFraction, 0.955);
assert.equal(PHASE4_GAMEPLAY_CONFIG.aerial.maximumDegrees, 720);
assert.equal(simulation.pumpAcceleration, PHASE4_GAMEPLAY_CONFIG.pumping.acceleration);
assert.equal(simulation.handPlantMinFraction, PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantEligibilityFraction);

simulation.setPumpIntent(0);
simulation.setTurnIntent(0);
simulation.setHandPlantHeld(false);
simulation.setBackflipHeld(false);

let bottomCrossings = 0;
let previousCrossings = 0;
let maximumAbsX = 0;
for (let step = 0; step < 720; step += 1) {
  const state = simulation.stepFixed();
  assert.ok(Number.isFinite(state.pipeX), 'pipeX must remain finite');
  assert.ok(Number.isFinite(state.tangentVelocity), 'tangent velocity must remain finite');
  assert.ok(Number.isFinite(state.specificEnergy), 'specific energy must remain finite');
  assert.ok(
    state.pipeX >= profile.leftLip - 1e-6 && state.pipeX <= profile.rightLip + 1e-6,
    `contact position escaped halfpipe bounds: ${state.pipeX}`,
  );
  maximumAbsX = Math.max(maximumAbsX, Math.abs(state.pipeX));
  if (state.bottomCrossings > previousCrossings) {
    bottomCrossings += state.bottomCrossings - previousCrossings;
    previousCrossings = state.bottomCrossings;
  }
}

const final = simulation.snapshot();
assert.ok(final.time > 5.99 && final.time < 6.01, `six-second fixed simulation drifted: ${final.time}`);
assert.ok(maximumAbsX > GAME_CONFIG.halfpipeProfile.flatHalfWidth, 'passive motion must enter a transition');
assert.ok(bottomCrossings >= 1, 'passive motion must cross the halfpipe bottom');
assert.equal(final.pumpAttempts, 0, 'no pump input must not create pump attempts');
assert.equal(final.score, 0, 'passive motion must not award score');

console.log(JSON.stringify({
  fixedHz: GAME_CONFIG.passivePhysics.fixedHz,
  pumpAcceleration: simulation.pumpAcceleration,
  bailMomentumRetention: PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention,
  handPlantEligibilityFraction: simulation.handPlantMinFraction,
  maximumAerialDegrees: PHASE4_GAMEPLAY_CONFIG.aerial.maximumDegrees,
  bottomCrossings,
  maximumAbsX,
  final,
}, null, 2));
