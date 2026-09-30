import { PHASE4_GAMEPLAY_CONFIG } from './phase4GameplayConfig.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const RATING_WEIGHT = Object.freeze({ PERFECT: 1, GOOD: 0.86, WEAK: 0.68, EARLY: 0.5, LATE: 0.5 });

export function resetPumpRecovery(simulation) {
  simulation._pumpRecoveryWindow = null;
  simulation._pumpRecoveryWindowWork = 0;
  simulation._pumpRecoveryWindowRewarded = false;
  simulation._pumpRecoveryCooldown = 0;
}

// tangentVelocity is distance along the ramp, so all boosts stay in that
// coordinate. Budget additional kinetic energy once per direction/phase;
// changing or spamming a button never creates a new energy budget.
export function applyPumpRecovery(simulation, dt) {
  const state = simulation.state;
  const config = PHASE4_GAMEPLAY_CONFIG.pumping.lowEnergyRecovery;
  simulation._pumpRecoveryCooldown = Math.max(0, (simulation._pumpRecoveryCooldown || 0) - dt);
  state.lastPumpImpulse = 0;
  if (state.severeCrash || state.mode !== 'contact' || state.surfaceTrickActive) return;
  const speed = Math.abs(Number(state.tangentVelocity) || 0);
  const weight = RATING_WEIGHT[state.pumpRating] || 0;
  if (!state.pumpIntent || state.pumpIntent !== state.pumpDesiredIntent || !weight) return;

  const sample = simulation._sampleIncreasingX(state.pipeX);
  const direction = Math.sign(state.tangentVelocity)
    || -Math.sign(sample.tangent.y) || simulation._lastDirection || 1;
  const window = `${Math.sign(state.pipeX)}:${state.pumpDesiredIntent}:${direction}`;
  if (simulation._pumpRecoveryWindow !== window) {
    simulation._pumpRecoveryWindow = window;
    simulation._pumpRecoveryWindowWork = 0;
    simulation._pumpRecoveryWindowRewarded = false;
  }
  let workAvailable = Math.max(0, config.maxWindowWork - simulation._pumpRecoveryWindowWork);
  let newSpeed = speed;
  let impulse = 0;
  if (!simulation._pumpRecoveryWindowRewarded && simulation._pumpRecoveryCooldown <= 0
    && speed < config.rewardTargetSpeed && workAvailable > 0) {
    const deficit = clamp01(1 - speed / config.rewardTargetSpeed);
    const scale = config.minimumImpulseScale + (1 - config.minimumImpulseScale) * deficit;
    const requested = Math.min(config.attemptImpulseByRating[state.pumpRating] * scale,
      config.rewardTargetSpeed - speed);
    const requestedWork = 0.5 * ((speed + requested) ** 2 - speed ** 2);
    const work = Math.min(workAvailable, Math.max(0, requestedWork));
    newSpeed = Math.sqrt(speed ** 2 + 2 * work);
    impulse = newSpeed - speed;
    workAvailable -= work;
    simulation._pumpRecoveryWindowRewarded = true;
    simulation._pumpRecoveryCooldown = config.pumpCooldownSeconds;
    state.pumpBoosts = (state.pumpBoosts || 0) + 1;
  }

  if (newSpeed < config.referenceSpeed && workAvailable > 0) {
    const deficit = clamp01(1 - newSpeed / config.referenceSpeed);
    const acceleration = Math.min(config.maxPumpBonus,
      config.acceleration * config.lowSpeedPumpMultiplier * weight * deficit);
    const requestedSpeed = Math.min(config.referenceSpeed, newSpeed + acceleration * dt);
    const requestedWork = 0.5 * (requestedSpeed ** 2 - newSpeed ** 2);
    newSpeed = Math.sqrt(newSpeed ** 2 + 2 * Math.min(workAvailable, requestedWork));
  }

  const work = Math.max(0, 0.5 * (newSpeed ** 2 - speed ** 2));
  if (work <= 0) return;
  simulation._pumpRecoveryWindowWork += work;
  state.pumpRecoveryWork = simulation._pumpRecoveryWindowWork;
  state.pumpRecoveryWindow = window;
  state.tangentVelocity = direction * newSpeed;
  state.tangentialAcceleration += direction * (newSpeed - speed) / Math.max(dt, 1e-4);
  state.lastPumpWork += work;
  state.pumpWorkTotal += work;
  state.lastPumpImpulse = impulse;
  state.pumpActive = true;
  if (impulse > 0) simulation._emit('PUMP_BOOST', {
    rating: state.pumpRating, impulse, speedBefore: speed, speedAfter: newSpeed,
    boosts: state.pumpBoosts,
  });
  simulation._refreshDerivedState();
}
