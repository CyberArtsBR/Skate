import { GAME_CONFIG } from '../config/gameConfig.js';

function signWithEpsilon(value, epsilon) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
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
    const pumpDefaults = GAME_CONFIG.pumping;
    this.pumpSpecificEnergyPerSecond =
      options.pumpSpecificEnergyPerSecond ?? pumpDefaults.specificEnergyPerSecond;
    this.pumpWindowHalfWidth = options.pumpWindowHalfWidth ?? pumpDefaults.windowHalfWidth;
    this.pumpMinimumSpeed = options.pumpMinimumSpeed ?? pumpDefaults.minimumSpeed;
    const airDefaults = GAME_CONFIG.air;
    this.airTakeoffInset = options.airTakeoffInset ?? airDefaults.takeoffInset;
    this.airLaunchMinimumSpeed =
      options.airLaunchMinimumSpeed ?? airDefaults.launchMinimumSpeed;
    this.airMinimumVerticalVelocity =
      options.airMinimumVerticalVelocity ?? airDefaults.minimumVerticalVelocity;
    this.airGravity = options.airGravity ?? airDefaults.gravity;
    this.airLaunchVelocityScale =
      options.airLaunchVelocityScale ?? airDefaults.launchVelocityScale;
    this.airLandingVelocityRetention =
      options.airLandingVelocityRetention ?? airDefaults.landingVelocityRetention;
    this.pumpIntent = 0;

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
      airSide: 0,
      airY: null,
      airVerticalVelocity: 0,
      airLaunches: 0,
      maxAirY: null,
      lastAirPeakY: null,
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

    // Physics uses one signed surface coordinate: +tangentVelocity always means
    // travel toward increasing world X. HalfpipeProfile's left-side tangent is
    // authored outward, so normalize it to the +X parameter direction here.
    if (tangent.x < 0) tangent.multiplyScalar(-1);
    if (normal.y < 0) normal.multiplyScalar(-1);

    return { ...sample, tangent, normal };
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

  _pumpPhase(previousX, previousVelocity) {
    const phaseSignal = previousX * previousVelocity;
    if (phaseSignal > this.velocityEpsilon) return 1;
    if (phaseSignal < -this.velocityEpsilon) return -1;
    return this.state.pumpDesiredIntent || 0;
  }

  _pumpInfluence(previousX) {
    const normalized = Math.min(1, Math.abs(previousX) / Math.max(0.001, this.pumpWindowHalfWidth));
    const smooth = normalized * normalized * (3 - 2 * normalized);
    return 1 - smooth;
  }

  _enterAir(side, launchSpeed) {
    const lipX = side < 0 ? this.profile.leftLip : this.profile.rightLip;
    const lip = this._sampleIncreasingX(lipX);
    const verticalVelocity = Math.max(
      this.airMinimumVerticalVelocity,
      Math.abs(launchSpeed) * this.airLaunchVelocityScale,
    );

    this.state.mode = 'airborne';
    this.state.pipeX = lipX;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = -this.airGravity;
    this.state.airSide = side;
    this.state.airY = lip.y;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.airLaunches += 1;
    this.state.maxAirY = this.state.maxAirY === null
      ? lip.y
      : Math.max(this.state.maxAirY, lip.y);
    this.state.lastAirPeakY = lip.y;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    return lip;
  }

  _stepAirborne() {
    const dt = this.fixedDt;
    const side = this.state.airSide || (this.state.pipeX < 0 ? -1 : 1);
    const lipX = side < 0 ? this.profile.leftLip : this.profile.rightLip;
    const lip = this._sampleIncreasingX(lipX);
    const previousVerticalVelocity = this.state.airVerticalVelocity;
    const verticalVelocity = previousVerticalVelocity - this.airGravity * dt;
    let nextY = (this.state.airY ?? lip.y) + verticalVelocity * dt;

    this.state.time += dt;
    this.state.pipeX = lipX;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.tangentialAcceleration = -this.airGravity;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;

    if (previousVerticalVelocity > 0 && verticalVelocity <= 0) {
      this.state.lastAirPeakY = nextY;
    }

    this.state.maxAirY = this.state.maxAirY === null
      ? nextY
      : Math.max(this.state.maxAirY, nextY);

    if (nextY <= lip.y && verticalVelocity < 0) {
      nextY = lip.y;
      const landingSpeed = Math.abs(verticalVelocity) * this.airLandingVelocityRetention;
      this.state.mode = 'contact';
      this.state.pipeX = side < 0
        ? this.profile.leftLip + this.lipInset
        : this.profile.rightLip - this.lipInset;
      this.state.tangentVelocity = side < 0 ? landingSpeed : -landingSpeed;
      this.state.airSide = 0;
      this.state.airY = null;
      this.state.airVerticalVelocity = 0;
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

    // Gravity projected onto the surface tangent. Because the tangent is always
    // oriented toward increasing X, this naturally accelerates down the left
    // wall (+) and down the right wall (-).
    const gravityAlongTangent = -this.gravity * sample.tangent.y;
    const dragAcceleration = -this.linearDrag * previousVelocity;
    const acceleration = gravityAlongTangent + dragAcceleration;

    let velocity = previousVelocity + acceleration * dt;

    const desiredIntent = this._pumpPhase(previousX, previousVelocity);
    const pumpWindowInfluence = this._pumpInfluence(previousX);
    const speedEligible = Math.abs(previousVelocity) >= this.pumpMinimumSpeed;
    const timingQuality = (
      speedEligible
      && this.pumpIntent !== 0
      && this.pumpIntent === desiredIntent
    ) ? pumpWindowInfluence : 0;

    const pumpWork = this.pumpSpecificEnergyPerSecond * timingQuality * dt;
    if (pumpWork > 0) {
      const direction = signWithEpsilon(velocity || previousVelocity, this.velocityEpsilon) || 1;
      const speedSquared = velocity * velocity + 2 * pumpWork;
      velocity = direction * Math.sqrt(Math.max(0, speedSquared));
      this.state.pumpWorkTotal += pumpWork;
    }

    this.state.pumpIntent = this.pumpIntent;
    this.state.pumpDesiredIntent = desiredIntent;
    this.state.pumpWindowInfluence = pumpWindowInfluence;
    this.state.pumpTimingQuality = timingQuality;
    this.state.pumpActive = pumpWork > 0;
    this.state.lastPumpWork = pumpWork;
    let nextX = previousX + velocity * sample.tangent.x * dt;

    const minX = this.profile.leftLip + this.lipInset;
    const maxX = this.profile.rightLip - this.lipInset;
    const takeoffMinX = this.profile.leftLip + this.airTakeoffInset;
    const takeoffMaxX = this.profile.rightLip - this.airTakeoffInset;
    let launched = false;

    // Coping takeoff is intentionally allowed a few centimeters before the
    // mathematical lip. The board has finite wheel/deck support geometry, so
    // requiring its center to reach the exact profile endpoint created a long
    // artificial wait after the rider was already visually at coping height.
    if (
      nextX <= takeoffMinX
      && velocity < 0
      && Math.abs(velocity) >= this.airLaunchMinimumSpeed
    ) {
      this.state.lipContacts += 1;
      this._enterAir(-1, velocity);
      launched = true;
    } else if (
      nextX >= takeoffMaxX
      && velocity > 0
      && Math.abs(velocity) >= this.airLaunchMinimumSpeed
    ) {
      this.state.lipContacts += 1;
      this._enterAir(1, velocity);
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

    if (launched) {
      const surfaceDelta = velocity * dt;
      this.state.distanceTravelled += Math.abs(surfaceDelta);
      this.state.signedDistanceTravelled += surfaceDelta;
      this.state.time += dt;
      this._refreshDerivedState();
      return this.snapshot();
    }

    // tangentVelocity is speed along the ramp surface (ds/dt), so travelled
    // distance is arc distance, not horizontal delta-X. This is the quantity
    // later used for visual wheel rotation and telemetry.
    const surfaceDelta = velocity * dt;
    this.state.distanceTravelled += Math.abs(surfaceDelta);
    this.state.signedDistanceTravelled += surfaceDelta;

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
      nextDirection !== 0
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

    // Avoid a runaway catch-up spiral after a long background-tab pause.
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
