import { GAME_CONFIG } from '../config/gameConfig.js';

function signWithEpsilon(value, epsilon) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export class HalfpipeSimulation {
  constructor(profile, options = {}) {
    if (!profile?.sample) throw new TypeError('HalfpipeSimulation requires a HalfpipeProfile-like object');

    const defaults = GAME_CONFIG.passivePhysics;
    this.profile = profile;
    this.fixedDt = 1 / (options.fixedHz ?? defaults.fixedHz);
    this.gravity = options.gravity ?? defaults.gravity;
    this.linearDrag = options.linearDrag ?? defaults.linearDrag;
    this.maxFrameDelta = options.maxFrameDelta ?? defaults.maxFrameDelta;
    this.maxSubSteps = options.maxSubSteps ?? defaults.maxSubSteps;
    this.lipInset = options.lipInset ?? defaults.lipInset;
    this.velocityEpsilon = options.velocityEpsilon ?? defaults.velocityEpsilon;
    this.startTransitionFraction = options.startTransitionFraction ?? defaults.startTransitionFraction;
    this.initialVelocity = options.initialVelocity ?? defaults.initialVelocity;

    const arcadeDefaults = GAME_CONFIG.arcadeMotion;
    this.downhillGravityScale =
      options.downhillGravityScale ?? arcadeDefaults.downhillGravityScale;
    this.uphillGravityScale =
      options.uphillGravityScale ?? arcadeDefaults.uphillGravityScale;

    const pumpDefaults = GAME_CONFIG.pumping;
    this.pumpAcceleration = options.pumpAcceleration ?? pumpDefaults.acceleration;
    this.pumpUpperWallRetention =
      options.pumpUpperWallRetention ?? pumpDefaults.upperWallRetention;
    this.pumpMinimumSpeed = options.pumpMinimumSpeed ?? pumpDefaults.minimumSpeed;

    const turningDefaults = GAME_CONFIG.turning;
    this.kickTurnMinFraction =
      options.kickTurnMinFraction ?? turningDefaults.kickTurnMinFraction;
    this.kickTurnRetention =
      options.kickTurnRetention ?? turningDefaults.kickTurnRetention;
    this.handPlantMinFraction =
      options.handPlantMinFraction ?? turningDefaults.handPlantMinFraction;
    this.handPlantRetention =
      options.handPlantRetention ?? turningDefaults.handPlantRetention;
    this.aerialIdealHoldSeconds =
      options.aerialIdealHoldSeconds ?? turningDefaults.aerialIdealHoldSeconds;
    this.aerialCompleteSeconds =
      options.aerialCompleteSeconds ?? turningDefaults.aerialCompleteSeconds;
    this.aerialOverturnSeconds =
      options.aerialOverturnSeconds ?? turningDefaults.aerialOverturnSeconds;

    this.scoring = GAME_CONFIG.scoring;

    const airDefaults = GAME_CONFIG.air;
    this.airTakeoffInset = options.airTakeoffInset ?? airDefaults.takeoffInset;
    this.airLaunchMinimumSpeed =
      options.airLaunchMinimumSpeed ?? airDefaults.launchMinimumSpeed;
    this.airMinimumVerticalVelocity =
      options.airMinimumVerticalVelocity ?? airDefaults.minimumVerticalVelocity;
    this.airMaximumVerticalVelocity =
      options.airMaximumVerticalVelocity ?? airDefaults.maximumVerticalVelocity;
    this.airGravity = options.airGravity ?? airDefaults.gravity;
    this.airLaunchVelocityScale =
      options.airLaunchVelocityScale ?? airDefaults.launchVelocityScale;
    this.airLandingVelocityRetention =
      options.airLandingVelocityRetention ?? airDefaults.landingVelocityRetention;

    this.pumpIntent = 0;
    this.turnIntent = 0;
    this.handPlantHeld = false;

    this.accumulator = 0;
    this._lastDirection = 0;
    this.reset(options.initialState);
  }

  reset(initialState = {}) {
    const defaultStartX = -(
      this.profile.flatHalfWidth
      + this.profile.transitionWidth * this.startTransitionFraction
    );

    this.state = {
      mode: 'contact',
      time: 0,
      pipeX: initialState.pipeX ?? defaultStartX,
      tangentVelocity: initialState.tangentVelocity ?? this.initialVelocity,
      tangentialAcceleration: 0,
      region: 'unknown',
      direction: 0,
      bottomCrossings: 0,
      lastBottomCrossingTime: null,
      bottomCrossingInterval: 0,
      lastCrossingSpeed: 0,
      turningPoints: 0,
      lastTurningPointX: null,
      lipContacts: 0,
      distanceTravelled: 0,
      signedDistanceTravelled: 0,
      specificEnergy: 0,

      pumpIntent: 0,
      pumpDesiredIntent: 0,
      pumpWindowInfluence: 0,
      pumpTimingQuality: 0,
      pumpActive: false,
      lastPumpWork: 0,
      pumpWorkTotal: 0,

      turnIntent: 0,
      handPlantHeld: false,
      trickType: null,
      trickProgress: 0,
      trickCount: 0,
      score: 0,
      lastTrick: null,
      lastTrickTime: null,
      lastTrickPoints: 0,
      facingTurns: 0,
      lastTrickTurnDirection: 0,
      lastTrickSide: 0,

      airSide: 0,
      airAnchorX: null,
      airBaseY: null,
      airY: null,
      airVerticalVelocity: 0,
      airLaunches: 0,
      maxAirY: null,
      lastAirPeakY: null,
      airTurnHold: 0,
      airTurnDirection: 0,
      airTurnCompleted: false,
      airTurnOverturned: false,
    };

    this.accumulator = 0;
    this._lastDirection = signWithEpsilon(this.state.tangentVelocity, this.velocityEpsilon);
    this._refreshDerivedState();
    return this.snapshot();
  }

  _sampleIncreasingX(x) {
    const sample = this.profile.sample(x);
    const tangent = sample.tangent.clone();
    const normal = sample.normal.clone();

    if (tangent.x < 0) tangent.multiplyScalar(-1);
    if (normal.y < 0) normal.multiplyScalar(-1);

    return { ...sample, tangent, normal };
  }

  _wallFraction(x) {
    const absoluteX = Math.abs(x);
    if (absoluteX <= this.profile.flatHalfWidth) return 0;
    return Math.max(0, Math.min(
      1,
      (absoluteX - this.profile.flatHalfWidth) / this.profile.transitionWidth,
    ));
  }

  _refreshDerivedState() {
    const sample = this._sampleIncreasingX(this.state.pipeX);

    if (this.state.mode === 'airborne') {
      this.state.region = this.state.airSide < 0 ? 'airborne-left' : 'airborne-right';
      this.state.direction = signWithEpsilon(
        this.state.airVerticalVelocity,
        this.velocityEpsilon,
      );
      this.state.specificEnergy =
        0.5 * this.state.airVerticalVelocity * this.state.airVerticalVelocity
        + this.airGravity * (this.state.airY ?? sample.y);
      return sample;
    }

    this.state.region = sample.region;
    this.state.direction = signWithEpsilon(
      this.state.tangentVelocity,
      this.velocityEpsilon,
    );
    this.state.specificEnergy =
      0.5 * this.state.tangentVelocity * this.state.tangentVelocity
      + this.gravity * sample.y;
    return sample;
  }

  setPumpIntent(intent) {
    this.pumpIntent = intent > 0 ? 1 : intent < 0 ? -1 : 0;
    return this.pumpIntent;
  }

  setTurnIntent(intent) {
    this.turnIntent = intent > 0 ? 1 : intent < 0 ? -1 : 0;
    return this.turnIntent;
  }

  setHandPlantHeld(held) {
    this.handPlantHeld = Boolean(held);
    return this.handPlantHeld;
  }

  _pumpPhase(previousX, previousVelocity) {
    const phaseSignal = previousX * previousVelocity;
    if (phaseSignal > this.velocityEpsilon) return 1;
    if (phaseSignal < -this.velocityEpsilon) return -1;
    return this.state.pumpDesiredIntent || 0;
  }

  _recordTrick(type, quality = 1, turnDirection = 0) {
    const clampedQuality = Math.max(0, Math.min(1, quality));
    const range = type === 'kick-turn'
      ? this.scoring.kickTurn
      : type === 'hand-plant'
        ? this.scoring.handPlant
        : this.scoring.aerialTurn;
    const points = Math.round(
      range.min + (range.max - range.min) * clampedQuality,
    );

    this.state.trickType = type;
    this.state.trickProgress = clampedQuality;
    this.state.trickCount += 1;
    this.state.score += points;
    const normalizedTurnDirection = signWithEpsilon(
      turnDirection,
      this.velocityEpsilon,
    );
    if (normalizedTurnDirection !== 0) {
      this.state.facingTurns += normalizedTurnDirection;
    }
    this.state.lastTrick = type;
    this.state.lastTrickTime = this.state.time;
    this.state.lastTrickPoints = points;
    this.state.lastTrickTurnDirection = normalizedTurnDirection;
    this.state.lastTrickSide = signWithEpsilon(
      this.state.pipeX,
      this.velocityEpsilon,
    );
  }

  _trySurfaceTurn(previousX, velocity, desiredIntent) {
    if (desiredIntent !== 1 || Math.abs(velocity) < this.velocityEpsilon) {
      return { velocity, turned: false };
    }

    const wallFraction = this._wallFraction(previousX);
    const expectedTurn = previousX < 0 ? 1 : previousX > 0 ? -1 : 0;

    if (
      this.handPlantHeld
      && wallFraction >= this.handPlantMinFraction
    ) {
      const quality = (wallFraction - this.handPlantMinFraction)
        / Math.max(1e-4, 1 - this.handPlantMinFraction);
      this._recordTrick('hand-plant', quality, expectedTurn);
      return {
        velocity: -velocity * this.handPlantRetention,
        turned: true,
      };
    }

    if (
      this.turnIntent === expectedTurn
      && expectedTurn !== 0
      && wallFraction >= this.kickTurnMinFraction
    ) {
      const quality = (wallFraction - this.kickTurnMinFraction)
        / Math.max(1e-4, 1 - this.kickTurnMinFraction);
      this._recordTrick('kick-turn', quality, expectedTurn);
      return {
        velocity: -velocity * this.kickTurnRetention,
        turned: true,
      };
    }

    return { velocity, turned: false };
  }

  _enterAir(side, launchSpeed, takeoffX) {
    const anchorX = Math.max(
      this.profile.leftLip + this.lipInset,
      Math.min(this.profile.rightLip - this.lipInset, takeoffX),
    );
    const takeoff = this._sampleIncreasingX(anchorX);
    const verticalVelocity = Math.min(
      this.airMaximumVerticalVelocity,
      Math.max(
        this.airMinimumVerticalVelocity,
        Math.abs(launchSpeed) * this.airLaunchVelocityScale,
      ),
    );

    this.state.mode = 'airborne';
    this.state.pipeX = anchorX;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = -this.airGravity;
    this.state.airSide = side;
    this.state.airAnchorX = anchorX;
    this.state.airBaseY = takeoff.y;
    this.state.airY = takeoff.y;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.airLaunches += 1;
    this.state.maxAirY = this.state.maxAirY === null
      ? takeoff.y
      : Math.max(this.state.maxAirY, takeoff.y);
    this.state.lastAirPeakY = takeoff.y;
    this.state.airTurnHold = 0;
    this.state.airTurnDirection = 0;
    this.state.airTurnCompleted = false;
    this.state.airTurnOverturned = false;
    this.state.trickType = null;
    this.state.trickProgress = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    return takeoff;
  }

  _stepAirborne() {
    const dt = this.fixedDt;
    const side = this.state.airSide || (this.state.pipeX < 0 ? -1 : 1);
    const anchorX = this.state.airAnchorX ?? this.state.pipeX;
    const baseY = this.state.airBaseY ?? this._sampleIncreasingX(anchorX).y;
    const previousVerticalVelocity = this.state.airVerticalVelocity;
    const verticalVelocity = previousVerticalVelocity - this.airGravity * dt;
    let nextY = (this.state.airY ?? baseY) + verticalVelocity * dt;

    const expectedTurn = side < 0 ? 1 : -1;
    if (this.turnIntent === expectedTurn) {
      this.state.airTurnDirection = expectedTurn;
      this.state.airTurnHold += dt;
      this.state.trickType = 'aerial-turn';
      this.state.trickProgress = Math.min(
        1,
        this.state.airTurnHold / Math.max(this.aerialIdealHoldSeconds, 1e-4),
      );
      if (this.state.airTurnHold >= this.aerialCompleteSeconds) {
        this.state.airTurnCompleted = true;
      }
      if (this.state.airTurnHold > this.aerialOverturnSeconds) {
        this.state.airTurnOverturned = true;
      }
    } else if (
      this.state.airTurnCompleted
      && this.state.trickType === 'aerial-turn'
      && this.state.trickProgress < 1
    ) {
      // Once a valid aerial turn has been committed, finish the visible 180°
      // rotation even if the player releases the direction before landing.
      this.state.trickProgress = Math.min(
        1,
        this.state.trickProgress + dt / 0.12,
      );
    }

    this.state.time += dt;
    this.state.pipeX = anchorX;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.tangentialAcceleration = -this.airGravity;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;

    if (previousVerticalVelocity > 0 && verticalVelocity <= 0) {
      this.state.lastAirPeakY = nextY;
    }

    this.state.maxAirY = this.state.maxAirY === null
      ? nextY
      : Math.max(this.state.maxAirY, nextY);

    if (nextY <= baseY && verticalVelocity < 0) {
      nextY = baseY;
      const landingSpeed = Math.abs(verticalVelocity) * this.airLandingVelocityRetention;

      if (this.state.airTurnCompleted && !this.state.airTurnOverturned) {
        const airHeight = Math.max(
          0,
          (this.state.maxAirY ?? baseY) - baseY,
        );
        const heightQuality = Math.max(
          0,
          Math.min(1, (airHeight - 0.5) / 3.5),
        );
        const holdQuality = Math.max(
          0,
          Math.min(
            1,
            this.state.airTurnHold / Math.max(this.aerialIdealHoldSeconds, 1e-4),
          ),
        );
        this._recordTrick(
          'aerial-turn',
          heightQuality * 0.6 + holdQuality * 0.4,
          this.state.airTurnDirection || expectedTurn,
        );
      } else if (this.state.airTurnOverturned) {
        this.state.lastTrick = 'aerial-turn-overrotated';
        this.state.lastTrickTime = this.state.time;
      }

      this.state.mode = 'contact';
      this.state.pipeX = anchorX;
      this.state.tangentVelocity = side < 0 ? landingSpeed : -landingSpeed;
      this.state.airSide = 0;
      this.state.airAnchorX = null;
      this.state.airBaseY = null;
      this.state.airY = null;
      this.state.airVerticalVelocity = 0;
      this.state.airTurnHold = 0;
      this.state.airTurnDirection = 0;
      this.state.airTurnCompleted = false;
      this.state.airTurnOverturned = false;
      this._lastDirection = signWithEpsilon(
        this.state.tangentVelocity,
        this.velocityEpsilon,
      );
    } else {
      this.state.airY = nextY;
    }

    this._refreshDerivedState();
    return this.snapshot();
  }

  stepFixed() {
    if (this.state.mode === 'airborne') return this._stepAirborne();

    const dt = this.fixedDt;
    const previousX = this.state.pipeX;
    const previousVelocity = this.state.tangentVelocity;
    const sample = this._sampleIncreasingX(previousX);
    const desiredIntent = this._pumpPhase(previousX, previousVelocity);

    const gravityAlongTangent = -this.gravity * sample.tangent.y;
    const verticalVelocity = previousVelocity * sample.tangent.y;
    const gravityScale = verticalVelocity < -this.velocityEpsilon
      ? this.downhillGravityScale
      : verticalVelocity > this.velocityEpsilon
        ? this.uphillGravityScale
        : 1;
    const scaledGravity = gravityAlongTangent * gravityScale;
    const dragAcceleration = -this.linearDrag * previousVelocity;

    const wallFraction = this._wallFraction(previousX);
    const upperFactor = smoothstep01((wallFraction - 0.62) / 0.38);
    const pumpInfluence = desiredIntent === 1
      ? 1 - upperFactor * (1 - this.pumpUpperWallRetention)
      : 1;
    const speedEligible = Math.abs(previousVelocity) >= this.pumpMinimumSpeed;
    const pumpMatched = (
      speedEligible
      && this.pumpIntent !== 0
      && this.pumpIntent === desiredIntent
    );
    const pumpAcceleration = pumpMatched
      ? this.pumpAcceleration
        * pumpInfluence
        * (signWithEpsilon(previousVelocity, this.velocityEpsilon) || 1)
      : 0;

    const acceleration = scaledGravity + dragAcceleration + pumpAcceleration;
    let velocity = previousVelocity + acceleration * dt;

    const pumpWork = pumpMatched
      ? Math.max(0, Math.abs(pumpAcceleration * previousVelocity) * dt)
      : 0;
    if (pumpWork > 0) this.state.pumpWorkTotal += pumpWork;

    this.state.pumpIntent = this.pumpIntent;
    this.state.pumpDesiredIntent = desiredIntent;
    this.state.pumpWindowInfluence = pumpInfluence;
    this.state.pumpTimingQuality = pumpMatched ? pumpInfluence : 0;
    this.state.pumpActive = pumpMatched;
    this.state.lastPumpWork = pumpWork;
    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;
    this.state.trickType = null;
    this.state.trickProgress = 0;

    const surfaceTurn = this._trySurfaceTurn(previousX, velocity, desiredIntent);
    velocity = surfaceTurn.velocity;

    if (surfaceTurn.turned) {
      this.state.turningPoints += 1;
      this.state.lastTurningPointX = previousX;
      this._lastDirection = signWithEpsilon(velocity, this.velocityEpsilon);
    }

    let nextX = previousX + velocity * sample.tangent.x * dt;

    const minX = this.profile.leftLip + this.lipInset;
    const maxX = this.profile.rightLip - this.lipInset;
    const takeoffMinX = this.profile.leftLip + this.airTakeoffInset;
    const takeoffMaxX = this.profile.rightLip - this.airTakeoffInset;
    let launched = false;

    if (!surfaceTurn.turned) {
      if (
        nextX <= takeoffMinX
        && velocity < 0
        && Math.abs(velocity) >= this.airLaunchMinimumSpeed
      ) {
        this.state.lipContacts += 1;
        this._enterAir(-1, velocity, takeoffMinX);
        launched = true;
      } else if (
        nextX >= takeoffMaxX
        && velocity > 0
        && Math.abs(velocity) >= this.airLaunchMinimumSpeed
      ) {
        this.state.lipContacts += 1;
        this._enterAir(1, velocity, takeoffMaxX);
        launched = true;
      } else if (nextX <= minX && velocity < 0) {
        this.state.lipContacts += 1;
        nextX = minX;
        velocity = 0;
      } else if (nextX >= maxX && velocity > 0) {
        this.state.lipContacts += 1;
        nextX = maxX;
        velocity = 0;
      }
    }

    const surfaceDelta = velocity * dt;
    this.state.distanceTravelled += Math.abs(surfaceDelta);
    this.state.signedDistanceTravelled += surfaceDelta;

    if (launched) {
      this.state.time += dt;
      this._refreshDerivedState();
      return this.snapshot();
    }

    if (
      previousX !== 0
      && nextX !== previousX
      && ((previousX < 0 && nextX >= 0) || (previousX > 0 && nextX <= 0))
    ) {
      const crossingTime = this.state.time + dt;
      if (this.state.lastBottomCrossingTime !== null) {
        this.state.bottomCrossingInterval = crossingTime - this.state.lastBottomCrossingTime;
      }
      this.state.lastBottomCrossingTime = crossingTime;
      this.state.lastCrossingSpeed = Math.abs(velocity);
      this.state.bottomCrossings += 1;
    }

    const nextDirection = signWithEpsilon(velocity, this.velocityEpsilon);
    if (
      !surfaceTurn.turned
      && nextDirection !== 0
      && this._lastDirection !== 0
      && nextDirection !== this._lastDirection
    ) {
      this.state.turningPoints += 1;
      this.state.lastTurningPointX = nextX;
    }
    if (nextDirection !== 0) this._lastDirection = nextDirection;

    this.state.time += dt;
    this.state.pipeX = nextX;
    this.state.tangentVelocity = velocity;
    this.state.tangentialAcceleration = acceleration;
    this._refreshDerivedState();
    return this.snapshot();
  }

  advance(frameDelta) {
    const clampedDelta = Math.max(0, Math.min(
      Number(frameDelta) || 0,
      this.maxFrameDelta,
    ));
    this.accumulator += clampedDelta;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      this.stepFixed();
      this.accumulator -= this.fixedDt;
      steps += 1;
    }

    if (steps === this.maxSubSteps && this.accumulator >= this.fixedDt) {
      this.accumulator %= this.fixedDt;
    }

    return {
      steps,
      alpha: this.accumulator / this.fixedDt,
      state: this.snapshot(),
    };
  }

  snapshot() {
    return { ...this.state };
  }
}
