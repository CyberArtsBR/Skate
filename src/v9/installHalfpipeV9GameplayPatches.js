import { HalfpipeSimulation } from '../halfpipe/HalfpipeSimulation.js';
import { PHASE4_GAMEPLAY_CONFIG } from '../gameplay/phase4GameplayConfig.js';
import { applyPumpRecovery, resetPumpRecovery } from '../gameplay/HalfpipePumpRecovery.js';

const INSTALLED = Symbol.for('chimpions.halfpipe.v9.gameplay-patches');

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rejectionText(reason) {
  return String(reason || 'MISSED')
    .replaceAll('_', ' ')
    .trim();
}

function emitRejected(simulation, trick, reason, payload = {}) {
  const event = {
    trick,
    reason,
    message: rejectionText(reason),
    ...payload,
  };
  simulation._emit('TRICK_REJECTED', event);
  simulation._emit('TRICK_FAILED', {
    ...event,
    rejected: true,
    preserveCombo: true,
  });
}

function applyV9AirRateDelta(simulation, dt) {
  if (simulation.state.mode !== 'airborne') return;

  const aerial = PHASE4_GAMEPLAY_CONFIG.aerial;
  const aerialExtra = Math.max(
    0,
    Number(aerial.v9RotationDegreesPerSecond || aerial.rotationDegreesPerSecond)
      - Number(aerial.rotationDegreesPerSecond || 0),
  );
  if (
    aerialExtra > 0
    && simulation.state.airTurnAttempted
    && !simulation.state.airTurnFailedReason
    && simulation.turnIntent !== 0
  ) {
    const direction = simulation._visualTurnDirectionForInput(simulation.turnIntent);
    simulation.state.airRotationSignedDegrees += direction * aerialExtra * dt;
    simulation.state.airRotationDegrees = Math.abs(simulation.state.airRotationSignedDegrees);
    simulation.state.airTurnDirection = Math.sign(simulation.state.airRotationSignedDegrees)
      || direction
      || simulation.state.airTurnDirection
      || 1;
    simulation.state.trickProgress = (
      (simulation.state.airRotationDegrees % aerial.targetStepDegrees)
      / aerial.targetStepDegrees
    );
  }

  const backflip = PHASE4_GAMEPLAY_CONFIG.backflip;
  const backflipExtra = Math.max(
    0,
    Number(backflip.v9RotationDegreesPerSecond || backflip.rotationDegreesPerSecond)
      - Number(backflip.rotationDegreesPerSecond || 0),
  );
  if (
    backflipExtra > 0
    && simulation.state.backflipAttempted
    && !simulation.state.backflipFailedReason
    && simulation.backflipHeld
  ) {
    simulation.state.backflipRotationDegrees += backflipExtra * dt;
    simulation.state.trickProgress = (
      (simulation.state.backflipRotationDegrees % backflip.singleDegrees)
      / backflip.singleDegrees
    );

    const maximum = simulation._backflipMaximumDegrees();
    if (simulation.state.backflipRotationDegrees > maximum + backflip.hardOverrunDegrees) {
      simulation.state.backflipActive = false;
      simulation.state.backflipFailedReason = 'OVER_FLIPPED';
      simulation._failTrick('backflip', 'OVER_FLIPPED');
    }
  }
}

export function installHalfpipeV9GameplayPatches() {
  const proto = HalfpipeSimulation.prototype;
  if (proto[INSTALLED]) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });

  const originalReset = proto.reset;
  const originalSetTurnIntent = proto.setTurnIntent;
  const originalSetHandPlantHeld = proto.setHandPlantHeld;
  const originalSetBackflipHeld = proto.setBackflipHeld;
  const originalTrySurfaceTurn = proto._trySurfaceTurn;
  const originalStartSurfaceTrick = proto._startSurfaceTrick;
  const originalStepSurfaceTrick = proto._stepSurfaceTrick;
  const originalEnterAir = proto._enterAir;
  const originalResolveLanding = proto._resolveLanding;
  const originalStepFixed = proto.stepFixed;

  proto.reset = function resetV9(initialState = {}) {
    originalReset.call(this, initialState);
    this._v9KickTurnBufferRemaining = 0;
    this._v9KickTurnBufferedIntent = 0;
    this._v9KickTurnAttemptSerial = 0;
    this._v9HandPlantAttemptSerial = 0;
    this._v9LastRejectedAttempt = null;
    this.state.kickTurnBufferRemaining = 0;
    this.state.kickTurnBufferedIntent = 0;
    this.state.airEntrySurfaceSpeed = 0;
    this.state.lastPumpImpulse = 0;
    this.state.pumpBoosts = 0;
    resetPumpRecovery(this);
    return this.snapshot();
  };

  proto.setTurnIntent = function setTurnIntentV9(intent) {
    const previous = this.turnIntent;
    const next = originalSetTurnIntent.call(this, intent);
    if (next !== 0 && next !== previous) {
      this._v9KickTurnAttemptSerial += 1;
      this._v9KickTurnBufferedIntent = next;
      this._v9KickTurnBufferRemaining = Math.max(
        this._v9KickTurnBufferRemaining,
        PHASE4_GAMEPLAY_CONFIG.surfaceTricks.kickTurnBufferSeconds,
      );
    }
    return next;
  };

  proto.setHandPlantHeld = function setHandPlantHeldV9(held) {
    const previous = this.handPlantHeld;
    const next = originalSetHandPlantHeld.call(this, held);
    if (next && !previous) this._v9HandPlantAttemptSerial += 1;
    return next;
  };

  proto.setBackflipHeld = function setBackflipHeldV9(held) {
    const previous = this.backflipHeld;
    const next = originalSetBackflipHeld.call(this, held);
    if (next && !previous) {
      if (this.state?.surfaceTrickActive) {
        emitRejected(this, 'backflip', 'TRICK_ALREADY_ACTIVE');
      }
    }
    return next;
  };

  proto._trySurfaceTurn = function trySurfaceTurnV9(previousX, velocity, desiredIntent) {
    const currentIntent = this.turnIntent;
    const bufferedIntent = (
      currentIntent === 0
      && this._v9KickTurnBufferRemaining > 0
      && this._v9KickTurnBufferedIntent !== 0
    )
      ? this._v9KickTurnBufferedIntent
      : 0;

    if (bufferedIntent) this.turnIntent = bufferedIntent;
    const result = originalTrySurfaceTurn.call(this, previousX, velocity, desiredIntent);
    this.turnIntent = currentIntent;

    if (result?.turned && this.state.surfaceTrickType === 'kick-turn') {
      this._v9KickTurnBufferRemaining = 0;
      this._v9KickTurnBufferedIntent = 0;
      this.state.kickTurnBufferRemaining = 0;
      this.state.kickTurnBufferedIntent = 0;
    }
    return result;
  };

  proto._startSurfaceTrick = function startSurfaceTrickV9(
    type,
    quality,
    velocity,
    duration,
    retention,
    anchorX = null,
    turnDirection = 1,
  ) {
    const result = originalStartSurfaceTrick.call(
      this,
      type,
      quality,
      velocity,
      duration,
      retention,
      anchorX,
      turnDirection,
    );

    if (type !== 'kick-turn') return result;

    this.state.surfaceTrickEntryVelocity = velocity;
    this.state.surfaceTrickPivotX = this.state.pipeX;
    this.state.surfaceTrickPhase = 'APPROACH';
    this.state.tangentVelocity = velocity;
    return { velocity, turned: true, frozen: false };
  };

  proto._stepSurfaceTrick = function stepSurfaceTrickV9() {
    if (this.state.surfaceTrickType !== 'kick-turn') {
      return originalStepSurfaceTrick.call(this);
    }

    const dt = this.fixedDt;
    const duration = Math.max(this.fixedDt, this.state.surfaceTrickDuration);
    this.state.surfaceTrickElapsed += dt;
    this.state.time += dt;

    const progress = clamp01(this.state.surfaceTrickElapsed / duration);
    const entryVelocity = Number(this.state.surfaceTrickEntryVelocity) || 0;
    const exitVelocity = Number(this.state.surfaceTrickExitVelocity) || -entryVelocity;
    let velocity = 0;

    if (progress < 0.32) {
      this.state.surfaceTrickPhase = 'APPROACH';
      const phase = smoothstep01(progress / 0.32);
      velocity = entryVelocity * (1 - phase * 0.92);
    } else if (progress < 0.58) {
      const phase = smoothstep01((progress - 0.32) / 0.26);
      this.state.surfaceTrickPhase = phase < 0.5 ? 'DECELERATE' : 'REAR_TRUCK_PIVOT';
      velocity = lerp(entryVelocity * 0.08, exitVelocity * 0.08, phase);
    } else {
      this.state.surfaceTrickPhase = 'RELEASE';
      const phase = smoothstep01((progress - 0.58) / 0.42);
      velocity = exitVelocity * phase;
    }

    const sample = this._sampleIncreasingX(this.state.pipeX);
    const minX = this.profile.leftLip + this.lipInset;
    const maxX = this.profile.rightLip - this.lipInset;
    this.state.pipeX = Math.max(
      minX,
      Math.min(maxX, this.state.pipeX + velocity * sample.tangent.x * dt),
    );
    this.state.tangentVelocity = velocity;
    this.state.tangentialAcceleration = 0;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;
    this.state.trickType = 'kick-turn';
    this.state.trickProgress = progress;

    if (this.state.surfaceTrickElapsed >= duration) {
      this.state.surfaceTrickPhase = 'VALIDATION';
      this._completeSurfaceTrick();
      this.state.surfaceTrickEntryVelocity = 0;
      this.state.surfaceTrickPivotX = null;
    }

    this._refreshDerivedState();
    return this.snapshot();
  };

  proto._enterAir = function enterAirV9(side, incomingVelocity, anchorX) {
    const result = originalEnterAir.call(this, side, incomingVelocity, anchorX);
    this.state.airEntrySurfaceSpeed = Math.abs(Number(incomingVelocity) || 0);
    return result;
  };

  proto._resolveLanding = function resolveLandingV9(side, baseY, impactVelocity) {
    const entrySurfaceSpeed = Math.max(0, Number(this.state.airEntrySurfaceSpeed) || 0);
    const result = originalResolveLanding.call(this, side, baseY, impactVelocity);

    if (!this.state.crashActive && entrySurfaceSpeed > 0) {
      const minimumReturnedSpeed = entrySurfaceSpeed * 0.985;
      const currentSpeed = Math.abs(Number(this.state.tangentVelocity) || 0);
      if (currentSpeed < minimumReturnedSpeed) {
        const returnDirection = side < 0 ? 1 : -1;
        this.state.tangentVelocity = returnDirection * minimumReturnedSpeed;
        this._lastDirection = returnDirection;
        this._refreshDerivedState();
      }
    }
    this.state.airEntrySurfaceSpeed = 0;
    return result;
  };

  proto.stepFixed = function stepFixedV9() {
    if (this.state.severeCrash) return originalStepFixed.call(this);
    const beforeHandPlantBuffer = Number(this.handPlantBufferRemaining) || 0;
    const beforeKickTurnBuffer = Number(this._v9KickTurnBufferRemaining) || 0;
    const wasKickTurnActive = Boolean(
      this.state?.surfaceTrickActive && this.state?.surfaceTrickType === 'kick-turn',
    );

    originalStepFixed.call(this);
    // A first-contact hook can promote this very airborne substep to severe
    // crash. Do not process buffered trick failures or pump rewards afterward.
    if (this.state.severeCrash) return this.snapshot();

    const dt = this.fixedDt;
    applyV9AirRateDelta(this, dt);

    const kickTurnActive = Boolean(
      this.state.surfaceTrickActive && this.state.surfaceTrickType === 'kick-turn',
    );

    if (!kickTurnActive && this._v9KickTurnBufferRemaining > 0) {
      this._v9KickTurnBufferRemaining = Math.max(
        0,
        this._v9KickTurnBufferRemaining - dt,
      );
    }
    if (kickTurnActive && !wasKickTurnActive) {
      this._v9KickTurnBufferRemaining = 0;
      this._v9KickTurnBufferedIntent = 0;
    }
    this.state.kickTurnBufferRemaining = this._v9KickTurnBufferRemaining;
    this.state.kickTurnBufferedIntent = this._v9KickTurnBufferedIntent;

    if (
      beforeKickTurnBuffer > 0
      && this._v9KickTurnBufferRemaining <= 0
      && this.turnIntent === 0
      && !kickTurnActive
      && this.state.mode !== 'airborne'
    ) {
      const key = `kick-${this._v9KickTurnAttemptSerial}`;
      if (this._v9LastRejectedAttempt !== key) {
        this._v9LastRejectedAttempt = key;
        emitRejected(this, 'kick-turn', 'TOO_EARLY', {
          attempt: this._v9KickTurnAttemptSerial,
        });
      }
    }

    if (
      beforeHandPlantBuffer > 0
      && this.handPlantBufferRemaining <= 0
      && !this.handPlantHeld
      && !(this.state.surfaceTrickActive && this.state.surfaceTrickType === 'hand-plant')
      && this.state.mode !== 'airborne'
    ) {
      const key = `plant-${this._v9HandPlantAttemptSerial}`;
      if (this._v9LastRejectedAttempt !== key) {
        this._v9LastRejectedAttempt = key;
        emitRejected(this, 'hand-plant', 'MISSED_COPING', {
          attempt: this._v9HandPlantAttemptSerial,
        });
      }
    }

    applyPumpRecovery(this, dt);

    return this.snapshot();
  };

  return true;
}
