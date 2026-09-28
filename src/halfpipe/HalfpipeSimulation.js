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

  stepFixed() {
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
    let nextX = previousX + velocity * sample.tangent.x * dt;

    const minX = this.profile.leftLip + this.lipInset;
    const maxX = this.profile.rightLip - this.lipInset;
    if (nextX <= minX && velocity < 0) {
      nextX = minX;
      velocity = 0;
      this.state.lipContacts += 1;
    } else if (nextX >= maxX && velocity > 0) {
      nextX = maxX;
      velocity = 0;
      this.state.lipContacts += 1;
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
