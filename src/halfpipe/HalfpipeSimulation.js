import { GAME_CONFIG } from '../config/gameConfig.js';
import { PHASE4_GAMEPLAY_CONFIG } from '../gameplay/phase4GameplayConfig.js';
import { HalfpipeGameplayEvents } from '../gameplay/HalfpipeGameplayEvents.js';
import {
  PUMP_RATINGS,
  evaluatePumpRating,
  pumpAccuracyWeight,
} from '../gameplay/HalfpipePumpRating.js';
import {
  LANDING_QUALITIES,
  evaluateLanding,
} from '../gameplay/HalfpipeLandingSystem.js';
import {
  comboMultiplierForCount,
  repetitionMultiplier,
  scoreRangeForTrick,
} from '../scoring/HalfpipeScoreSystem.js';

function signWithEpsilon(value, epsilon) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function nearestRotationTarget(rotationDegrees, stepDegrees, maximumDegrees) {
  const rotation = Math.max(0, Math.abs(Number(rotationDegrees) || 0));
  const step = Math.max(1, Math.abs(Number(stepDegrees) || 180));
  const maximum = Math.max(step, Math.abs(Number(maximumDegrees) || step));
  const target = Math.max(step, Math.min(maximum, Math.round(rotation / step) * step));
  return {
    rotation,
    target,
    error: Math.abs(rotation - target),
  };
}

function rotationQualityFromDegrees(rotationDegrees, targetDegrees = 180) {
  const error = Math.abs(
    Math.abs(Number(rotationDegrees) || 0)
    - Math.abs(Number(targetDegrees) || 180),
  );
  return clamp01(1 - error / 70);
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
    this.downhillGravityScale = options.downhillGravityScale
      ?? PHASE4_GAMEPLAY_CONFIG.gravity.downhillScale
      ?? arcadeDefaults.downhillGravityScale;
    this.uphillGravityScale = options.uphillGravityScale
      ?? PHASE4_GAMEPLAY_CONFIG.gravity.uphillScale
      ?? arcadeDefaults.uphillGravityScale;

    const pumpDefaults = GAME_CONFIG.pumping;
    this.pumpAcceleration = options.pumpAcceleration
      ?? PHASE4_GAMEPLAY_CONFIG.pumping.acceleration
      ?? pumpDefaults.acceleration;
    this.pumpUpperWallRetention =
      options.pumpUpperWallRetention ?? pumpDefaults.upperWallRetention;
    this.pumpMinimumSpeed = options.pumpMinimumSpeed ?? pumpDefaults.minimumSpeed;
    this.wrongPumpPenaltyAcceleration = options.wrongPumpPenaltyAcceleration
      ?? PHASE4_GAMEPLAY_CONFIG.pumping.wrongPenaltyAcceleration;

    const turningDefaults = GAME_CONFIG.turning;
    this.kickTurnMinFraction =
      options.kickTurnMinFraction ?? turningDefaults.kickTurnMinFraction;
    this.kickTurnRetention =
      options.kickTurnRetention ?? turningDefaults.kickTurnRetention;
    this.handPlantMinFraction =
      options.handPlantMinFraction
      ?? PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantEligibilityFraction
      ?? turningDefaults.handPlantMinFraction;
    this.handPlantRetention =
      options.handPlantRetention ?? turningDefaults.handPlantRetention;
    this.handPlantBufferSeconds =
      options.handPlantBufferSeconds
      ?? PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantInputBufferSeconds
      ?? turningDefaults.handPlantBufferSeconds;
    this.aerialIdealHoldSeconds =
      options.aerialIdealHoldSeconds ?? turningDefaults.aerialIdealHoldSeconds;

    this.scoring = GAME_CONFIG.scoring;
    this.trickPresentation = GAME_CONFIG.trickPresentation;

    const airDefaults = GAME_CONFIG.air;
    this.airTakeoffInset = options.airTakeoffInset ?? airDefaults.takeoffInset;
    this.airLaunchMinimumSpeed = options.airLaunchMinimumSpeed
      ?? PHASE4_GAMEPLAY_CONFIG.launch.thresholdSpeed
      ?? airDefaults.launchMinimumSpeed;
    this.airMaximumVerticalVelocity = options.airMaximumVerticalVelocity
      ?? PHASE4_GAMEPLAY_CONFIG.launch.maximumVerticalVelocity
      ?? airDefaults.maximumVerticalVelocity;
    this.airGravity = options.airGravity ?? airDefaults.gravity;
    this.airLandingVelocityRetention =
      options.airLandingVelocityRetention ?? airDefaults.landingVelocityRetention;

    this.pumpIntent = 0;
    this.turnIntent = 0;
    this.handPlantHeld = false;
    this.backflipHeld = false;
    this.handPlantBufferRemaining = 0;

    this.accumulator = 0;
    this._lastDirection = 0;
    this._lastPumpInput = 0;
    this._lastPumpDesiredIntent = 0;
    this.events = new HalfpipeGameplayEvents();
    this.reset(options.initialState);
  }

  reset(initialState = {}) {
    const defaultStartX = (
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
      pumpRating: null,
      lastPumpWork: 0,
      pumpWorkTotal: 0,
      pumpAttempts: 0,
      perfectPumps: 0,
      goodPumps: 0,
      weakPumps: 0,
      earlyPumps: 0,
      latePumps: 0,
      wrongPumps: 0,
      pumpAccuracy: 0,
      pumpAccuracyScore: 0,
      pumpBufferRemaining: 0,
      pumpRecoveryWork: 0,

      turnIntent: 0,
      handPlantHeld: false,
      backflipHeld: false,
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
      lastCompletedTrickSide: 0,
      bestTrick: null,
      bestTrickPoints: 0,
      tricksAttempted: 0,
      tricksLanded: 0,

      surfaceTrickActive: false,
      surfaceTrickType: null,
      surfaceTrickPhase: null,
      surfaceTrickElapsed: 0,
      surfaceTrickDuration: 0,
      surfaceTrickExitVelocity: 0,
      surfaceTrickEntrySpeed: 0,
      surfaceTrickQuality: 0,
      surfaceTrickHold: 0,
      surfaceTrickReleased: false,
      surfaceTrickFacingCommitted: false,
      surfaceTrickApproachX: null,
      surfaceTrickAnchorX: null,

      airSide: 0,
      airTakeoffFakie: false,
      airAnchorX: null,
      airBaseY: null,
      currentAirBaseY: null,
      airY: null,
      airVerticalVelocity: 0,
      airLaunches: 0,
      currentAirPeakY: null,
      runMaxAirY: null,
      maxAirY: null,
      highestAir: 0,
      lastAirPeakY: null,
      airTurnHold: 0,
      airTurnDirection: 0,
      airTurnElapsed: 0,
      airTurnActive: false,
      airTurnAttempted: false,
      airTurnCompleted: false,
      airTurnOverturned: false,
      airTurnFailedReason: null,
      airRotationDegrees: 0,
      airRotationSignedDegrees: 0,
      airRotationTargetDegrees: 0,
      airLaunchVelocity: 0,

      backflipHold: 0,
      backflipActive: false,
      backflipAttempted: false,
      backflipCompleted: false,
      backflipFailedReason: null,
      backflipRotationDegrees: 0,
      backflipTargetDegrees: 0,
      backflipInputArmed: true,

      landingActive: false,
      landingQuality: null,
      landingImpact: 0,
      landingScoreMultiplier: 1,
      landingMomentumRetention: 1,
      landingTime: null,
      landingRemaining: 0,
      lastLandingQuality: null,
      perfectLandings: 0,
      cleanLandings: 0,

      crashActive: false,
      crashReason: null,
      crashCount: 0,
      crashes: 0,
      recoveryRemaining: 0,

      comboMultiplier: 1,
      comboCount: 0,
      bestCombo: 1,
      comboScoreContribution: 0,
      comboPumpBoost: 0,
      lastComboTrick: null,
      repeatedTrickCount: 0,
    };

    this.accumulator = 0;
    this.handPlantBufferRemaining = 0;
    this.pumpIntent = 0;
    this.turnIntent = 0;
    this.handPlantHeld = false;
    this.backflipHeld = false;
    this._lastPumpInput = 0;
    this._lastPumpDesiredIntent = 0;
    this._pumpBufferedIntent = 0;
    this._pumpBufferRemaining = 0;
    this._lastDirection = signWithEpsilon(this.state.tangentVelocity, this.velocityEpsilon);
    this.events.clear();
    this._refreshDerivedState();
    return this.snapshot();
  }

  drainEvents() {
    return this.events.drain();
  }

  getRunStats() {
    return {
      score: this.state.score,
      bestTrick: this.state.bestTrick,
      bestTrickPoints: this.state.bestTrickPoints,
      runMaxAirY: this.state.runMaxAirY,
      highestAir: this.state.highestAir,
      bestCombo: this.state.bestCombo,
      tricksAttempted: this.state.tricksAttempted,
      tricksLanded: this.state.tricksLanded,
      perfectLandings: this.state.perfectLandings,
      cleanLandings: this.state.cleanLandings,
      crashes: this.state.crashes,
      pumpAccuracy: this.state.pumpAccuracy,
    };
  }

  computeLaunchVelocity(incomingSpeed) {
    const speed = Math.max(0, Math.abs(Number(incomingSpeed) || 0));
    const cfg = PHASE4_GAMEPLAY_CONFIG.launch;
    if (speed < this.airLaunchMinimumSpeed) return 0;

    const normalized = clamp01(
      (speed - this.airLaunchMinimumSpeed)
      / Math.max(1e-4, cfg.speedForMaximumVelocity - this.airLaunchMinimumSpeed),
    );
    const curved = smoothstep01(normalized);
    return Math.min(
      this.airMaximumVerticalVelocity,
      cfg.visiblePopVelocity
        + (this.airMaximumVerticalVelocity - cfg.visiblePopVelocity) * curved,
    );
  }

  _emit(type, payload = {}) {
    this.events.emit(type, this.state.time, payload);
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
    const previous = this.pumpIntent;
    this.pumpIntent = intent > 0 ? 1 : intent < 0 ? -1 : 0;
    if (this.pumpIntent && this.pumpIntent !== previous) {
      this._pumpBufferedIntent = this.pumpIntent;
      this._pumpBufferRemaining = PHASE4_GAMEPLAY_CONFIG.pumping.inputBufferSeconds;
    }
    return this.pumpIntent;
  }

  setTurnIntent(intent) {
    this.turnIntent = intent > 0 ? 1 : intent < 0 ? -1 : 0;
    return this.turnIntent;
  }

  setHandPlantHeld(held) {
    this.handPlantHeld = Boolean(held);
    if (this.handPlantHeld && this.state?.mode !== 'airborne') {
      this.handPlantBufferRemaining = Math.max(
        this.handPlantBufferRemaining,
        this.handPlantBufferSeconds,
      );
    }
    return this.handPlantHeld;
  }

  setBackflipHeld(held) {
    this.backflipHeld = Boolean(held);
    return this.backflipHeld;
  }

  _pumpPhase(previousX, previousVelocity) {
    // At rest the compression input starts a deliberate recovery stroke.
    // Gravity still chooses the downhill tangent; a flat start keeps the
    // previous direction rather than applying a world-X acceleration.
    if (Math.abs(previousVelocity) < PHASE4_GAMEPLAY_CONFIG.pumping.lowEnergyRecovery.minRecoverableSpeed) {
      return -1;
    }
    const phaseSignal = previousX * previousVelocity;
    if (phaseSignal > this.velocityEpsilon) return 1;
    if (phaseSignal < -this.velocityEpsilon) return -1;
    return this.state.pumpDesiredIntent || 0;
  }

  _isFacingBack() {
    return Math.abs(Math.trunc(this.state.facingTurns)) % 2 === 1;
  }

  _visualTurnDirectionForInput(input) {
    const rawDirection = Math.sign(Number(input) || 0);
    if (!rawDirection) return 0;

    // FRONT facing: LEFT => counter-clockwise (+), RIGHT => clockwise (-).
    // BACK facing: invert that relationship, exactly as requested.
    const facingSign = this._isFacingBack() ? -1 : 1;
    return -rawDirection * facingSign;
  }

  _allowedTrickSide() {
    // Front-facing rider may only trick on LEFT. After a completed 180° turn
    // the rider is back-facing and may only trick on RIGHT.
    return this._isFacingBack() ? 1 : -1;
  }

  _expectedTurnIntentForAllowedSide() {
    // Front + left wall => RIGHT input. Back + right wall => LEFT input.
    return this._isFacingBack() ? -1 : 1;
  }

  _updatePumpStats(rating) {
    if (!rating) return;

    this.state.pumpAttempts += 1;
    const weight = pumpAccuracyWeight(rating);
    this.state.pumpAccuracyScore += weight;
    this.state.pumpAccuracy = this.state.pumpAttempts > 0
      ? this.state.pumpAccuracyScore / this.state.pumpAttempts
      : 0;

    if (rating === PUMP_RATINGS.PERFECT) this.state.perfectPumps += 1;
    else if (rating === PUMP_RATINGS.GOOD) this.state.goodPumps += 1;
    else if (rating === PUMP_RATINGS.WEAK) this.state.weakPumps += 1;
    else if (rating === PUMP_RATINGS.EARLY) this.state.earlyPumps += 1;
    else if (rating === PUMP_RATINGS.LATE) this.state.latePumps += 1;
    else if (rating === PUMP_RATINGS.WRONG) this.state.wrongPumps += 1;

    const pumpCfg = PHASE4_GAMEPLAY_CONFIG.pumping;
    if (rating === PUMP_RATINGS.PERFECT) {
      this.state.comboPumpBoost += pumpCfg.rhythmBoostPerfect;
    } else if (rating === PUMP_RATINGS.GOOD) {
      this.state.comboPumpBoost += pumpCfg.rhythmBoostGood;
    } else if (rating === PUMP_RATINGS.WEAK) {
      this.state.comboPumpBoost += pumpCfg.rhythmBoostWeak;
    } else if (
      rating === PUMP_RATINGS.WRONG
      || rating === PUMP_RATINGS.EARLY
      || rating === PUMP_RATINGS.LATE
    ) {
      this.state.comboPumpBoost -= pumpCfg.rhythmBoostPenalty;
    }
    this.state.comboPumpBoost = Math.max(
      0,
      Math.min(pumpCfg.rhythmBoostMax, this.state.comboPumpBoost),
    );

    this._emit('PUMP_RATING', {
      rating,
      attempts: this.state.pumpAttempts,
      accuracy: this.state.pumpAccuracy,
    });
  }

  _breakCombo(reason) {
    const hadCombo = this.state.comboCount > 0 || this.state.comboMultiplier > 1;
    this.state.comboCount = 0;
    this.state.comboMultiplier = 1;
    this.state.comboPumpBoost = 0;
    this.state.lastComboTrick = null;
    this.state.repeatedTrickCount = 0;
    if (hadCombo) {
      this._emit('COMBO_CHANGED', {
        multiplier: 1,
        count: 0,
        reason,
      });
    }
  }

  _awardValidatedTrick(
    type,
    quality,
    landingScoreMultiplier = 1,
    side = 0,
    turnDirection = 0,
  ) {
    const clampedQuality = clamp01(quality);
    const range = scoreRangeForTrick(this.scoring, type);
    const basePoints = Math.round(
      range.min + (range.max - range.min) * clampedQuality,
    );

    if (this.state.lastComboTrick === type) {
      this.state.repeatedTrickCount += 1;
    } else {
      this.state.lastComboTrick = type;
      this.state.repeatedTrickCount = 1;
    }

    const varietyMultiplier = repetitionMultiplier(this.state.repeatedTrickCount);
    const previousSide = this.state.lastCompletedTrickSide;
    const alternateWallBonus = previousSide && side && previousSide !== side ? 0.08 : 0;
    this.state.comboCount += 1;
    this.state.comboMultiplier = comboMultiplierForCount(this.state.comboCount);
    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.comboMultiplier);

    const rhythmMultiplier = 1 + this.state.comboPumpBoost;
    const flowMultiplier = 1 + alternateWallBonus;
    const rawWithoutCombo = basePoints
      * varietyMultiplier
      * landingScoreMultiplier
      * rhythmMultiplier
      * flowMultiplier;
    const points = Math.max(
      0,
      Math.round(rawWithoutCombo * this.state.comboMultiplier),
    );
    const comboContribution = Math.max(0, points - Math.round(rawWithoutCombo));

    this.state.trickType = type;
    this.state.trickProgress = clampedQuality;
    this.state.trickCount += 1;
    this.state.score += points;
    this.state.comboScoreContribution += comboContribution;
    this.state.lastTrick = type;
    this.state.lastTrickTime = this.state.time;
    this.state.lastTrickPoints = points;
    this.state.lastTrickTurnDirection = Math.sign(turnDirection)
      || this.state.lastTrickTurnDirection
      || (this.state.lastTrickSide < 0 ? 1 : -1);
    if (side) {
      this.state.lastTrickSide = side;
      this.state.lastCompletedTrickSide = side;
    }
    if (points > this.state.bestTrickPoints) {
      this.state.bestTrick = type;
      this.state.bestTrickPoints = points;
    }

    this._emit('TRICK_COMPLETED', {
      trick: type,
      points,
      quality: clampedQuality,
      comboMultiplier: this.state.comboMultiplier,
      varietyMultiplier,
      landingScoreMultiplier,
    });
    this._emit('COMBO_CHANGED', {
      multiplier: this.state.comboMultiplier,
      count: this.state.comboCount,
      reason: 'TRICK_LANDED',
    });
    return points;
  }

  _failTrick(type, reason) {
    this.state.lastTrick = type + '-failed';
    this.state.lastTrickTime = this.state.time;
    this.state.lastTrickPoints = 0;
    this._breakCombo(reason);
    this._emit('TRICK_FAILED', {
      trick: type,
      reason,
    });
  }

  _startCrash(reason) {
    const cfg = PHASE4_GAMEPLAY_CONFIG.crash;
    this.state.crashActive = true;
    this.state.lastTrickPoints = 0;
    this.state.crashReason = reason;
    this.state.crashCount += 1;
    this.state.crashes = this.state.crashCount;
    this.state.recoveryRemaining = cfg.recoverySeconds;
    this._breakCombo(reason);
    this._emit('BAIL', { reason });
    this._emit('RECOVERY_STARTED', {
      reason,
      recoverySeconds: cfg.recoverySeconds,
    });
  }

  _advanceRecovery() {
    if (!this.state.crashActive) return;
    this.state.recoveryRemaining = Math.max(
      0,
      this.state.recoveryRemaining - this.fixedDt,
    );
    if (this.state.recoveryRemaining <= 0) {
      const reason = this.state.crashReason;
      this.state.crashActive = false;
      this.state.crashReason = null;
      this._emit('RECOVERY_FINISHED', { reason });
    }
  }

  _startSurfaceTrick(
    type,
    quality,
    velocity,
    duration,
    retention,
    anchorX = null,
    turnDirection = 1,
  ) {
    const approachX = this.state.pipeX;
    if (Number.isFinite(anchorX)) this.state.pipeX = anchorX;
    this.state.tricksAttempted += 1;
    this.state.lastTrick = type;
    this.state.lastTrickTime = this.state.time;
    this.state.lastTrickPoints = 0;
    this.state.surfaceTrickActive = true;
    this.state.surfaceTrickType = type;
    this.state.surfaceTrickPhase = 'EXECUTION';
    this.state.surfaceTrickElapsed = 0;
    this.state.surfaceTrickDuration = Math.max(this.fixedDt, duration);
    this.state.surfaceTrickExitVelocity = -velocity * retention;
    this.state.surfaceTrickEntrySpeed = Math.abs(velocity);
    this.state.surfaceTrickQuality = clamp01(quality);
    this.state.surfaceTrickHold = type === 'hand-plant'
      ? Math.max(this.fixedDt, PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantMinimumHoldSeconds)
      : (this.handPlantHeld ? this.fixedDt : 0);
    this.state.surfaceTrickReleased = false;
    this.state.surfaceTrickFacingCommitted = true;
    this.state.surfaceTrickApproachX = type === 'hand-plant' ? approachX : null;
    this.state.surfaceTrickAnchorX = type === 'hand-plant' ? anchorX : null;
    if (type === 'hand-plant') this.state.pipeX = approachX;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = 0;
    this.state.trickType = type;
    this.state.trickProgress = 0;
    this.state.turningPoints += 1;
    this.state.lastTurningPointX = this.state.pipeX;
    const committedTurnDirection = Math.sign(Number(turnDirection) || 0) || 1;
    this.state.lastTrickTurnDirection = committedTurnDirection;
    this.state.lastTrickSide = signWithEpsilon(
      this.state.pipeX,
      this.velocityEpsilon,
    );
    this.state.facingTurns += committedTurnDirection;
    this._emit('TRICK_STARTED', {
      trick: type,
      side: this.state.lastTrickSide,
      entrySpeed: this.state.surfaceTrickEntrySpeed,
    });
    return { velocity: 0, turned: true, frozen: true };
  }

  _completeSurfaceTrick() {
    const type = this.state.surfaceTrickType;
    const duration = Math.max(this.fixedDt, this.state.surfaceTrickDuration);
    let success = true;
    let finalQuality = this.state.surfaceTrickQuality;
    let failReason = null;

    if (type === 'hand-plant') {
      const cfg = PHASE4_GAMEPLAY_CONFIG.surfaceTricks;
      const hold = this.state.surfaceTrickHold;
      if (hold < cfg.handPlantMinimumHoldSeconds) {
        success = false;
        failReason = 'HAND_PLANT_TIMING';
      } else {
        const holdQuality = hold <= cfg.handPlantIdealHoldSeconds
          ? clamp01(hold / cfg.handPlantIdealHoldSeconds)
          : clamp01(
            1 - (hold - cfg.handPlantIdealHoldSeconds)
              / Math.max(
                1e-4,
                cfg.handPlantMaximumQualityHoldSeconds - cfg.handPlantIdealHoldSeconds,
              ),
          );
        const entryQuality = clamp01(this.state.surfaceTrickEntrySpeed / 12);
        const releaseQuality = this.state.surfaceTrickReleased ? 1 : 0.78;
        finalQuality = clamp01(
          finalQuality * 0.35
          + entryQuality * 0.2
          + holdQuality * 0.3
          + releaseQuality * 0.15,
        );
      }
    }

    const exitVelocity = success
      ? this.state.surfaceTrickExitVelocity
      : Math.sign(this.state.surfaceTrickExitVelocity || -this.state.pipeX)
        * this.state.surfaceTrickEntrySpeed * PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention;

    if (success) {
      this.state.surfaceTrickPhase = 'COMPLETE';
      this.state.tricksLanded += 1;
      this._awardValidatedTrick(
        type,
        finalQuality,
        1,
        this.state.lastTrickSide,
        this.state.lastTrickTurnDirection,
      );
    } else {
      this.state.surfaceTrickPhase = 'FAIL';
      if (this.state.surfaceTrickFacingCommitted) {
        this.state.facingTurns -= this.state.lastTrickTurnDirection || 1;
      }
      this._failTrick(type, failReason);
      this._startCrash(failReason || 'TRICK_MISSED');
    }

    this.state.surfaceTrickActive = false;
    this.state.surfaceTrickType = null;
    this.state.surfaceTrickElapsed = duration;
    this.state.surfaceTrickDuration = 0;
    this.state.surfaceTrickExitVelocity = 0;
    this.state.surfaceTrickEntrySpeed = 0;
    this.state.surfaceTrickQuality = 0;
    this.state.surfaceTrickHold = 0;
    this.state.surfaceTrickReleased = false;
    this.state.surfaceTrickFacingCommitted = false;
    this.state.surfaceTrickApproachX = null;
    this.state.surfaceTrickAnchorX = null;
    this.state.trickType = null;
    this.state.trickProgress = 0;
    this.state.tangentVelocity = exitVelocity;
    this._lastDirection = signWithEpsilon(
      exitVelocity,
      this.velocityEpsilon,
    );
  }

  _stepSurfaceTrick() {
    const dt = this.fixedDt;
    const duration = Math.max(this.fixedDt, this.state.surfaceTrickDuration);
    this.state.surfaceTrickElapsed += dt;
    this.state.time += dt;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = 0;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;
    this.state.trickType = this.state.surfaceTrickType;
    this.state.trickProgress = Math.min(
      1,
      this.state.surfaceTrickElapsed / duration,
    );

    if (this.state.surfaceTrickType === 'hand-plant') {
      if (Number.isFinite(this.state.surfaceTrickApproachX) && Number.isFinite(this.state.surfaceTrickAnchorX)) {
        const approach = smoothstep01(this.state.surfaceTrickElapsed / Math.max(this.fixedDt, duration * 0.2));
        this.state.pipeX = this.state.surfaceTrickApproachX
          + (this.state.surfaceTrickAnchorX - this.state.surfaceTrickApproachX) * approach;
      }
      if (this.handPlantHeld) {
        this.state.surfaceTrickHold += dt;
      } else if (this.state.surfaceTrickHold > 0) {
        this.state.surfaceTrickReleased = true;
      }
    }

    if (this.state.surfaceTrickElapsed >= duration) {
      this.state.surfaceTrickPhase = 'VALIDATION';
      this._completeSurfaceTrick();
    }

    this._refreshDerivedState();
    return this.snapshot();
  }

  _trySurfaceTurn(previousX, velocity, desiredIntent) {
    if (
      desiredIntent !== 1
      || Math.abs(velocity) < this.velocityEpsilon
      || this.state.crashActive
    ) {
      return { velocity, turned: false, frozen: false };
    }

    const side = previousX < 0 ? -1 : previousX > 0 ? 1 : 0;
    if (side === 0) return { velocity, turned: false, frozen: false };

    const sample = this._sampleIncreasingX(previousX);
    const predictedX = previousX
      + velocity * sample.tangent.x * this.fixedDt;
    const wallFraction = this._wallFraction(previousX);
    const predictedWallFraction = this._wallFraction(predictedX);

    const handPlantRequested = (
      this.handPlantHeld || this.handPlantBufferRemaining > 0
    );

    if (
      handPlantRequested
      && Math.max(wallFraction, predictedWallFraction) >= this.handPlantMinFraction
      && Math.abs(velocity) >= PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantMinimumEntrySpeed
      && Math.abs((side < 0 ? this.profile.leftLip : this.profile.rightLip) - predictedX)
        <= PHASE4_GAMEPLAY_CONFIG.surfaceTricks.handPlantMaxCopingDistance
    ) {
      const handPlantAnchor = side < 0
        ? this.profile.leftLip + this.lipInset
        : this.profile.rightLip - this.lipInset;
      const copingQuality = (
        Math.max(wallFraction, predictedWallFraction) - this.handPlantMinFraction
      ) / Math.max(1e-4, 1 - this.handPlantMinFraction);
      this.handPlantBufferRemaining = 0;
      this._emit('COPING_HIT', {
        side,
        speed: Math.abs(velocity),
        maneuver: 'hand-plant',
      });
      return this._startSurfaceTrick(
        'hand-plant',
        copingQuality,
        velocity,
        this.trickPresentation.handPlantDuration,
        this.handPlantRetention,
        handPlantAnchor,
      );
    }

    // Turns are intentionally symmetric: either horizontal direction can
    // initiate a 180 on either wall, regardless of the rider's current facing.
    if (
      this.turnIntent !== 0
      && wallFraction >= this.kickTurnMinFraction
    ) {
      const quality = (wallFraction - this.kickTurnMinFraction)
        / Math.max(1e-4, 1 - this.kickTurnMinFraction);
      const turnDirection = this._visualTurnDirectionForInput(this.turnIntent);
      return this._startSurfaceTrick(
        'kick-turn',
        quality,
        velocity,
        this.trickPresentation.kickTurnDuration,
        this.kickTurnRetention,
        null,
        turnDirection,
      );
    }

    return { velocity, turned: false, frozen: false };
  }

  _enterAir(side, launchSpeed, takeoffX) {
    const anchorX = Math.max(
      this.profile.leftLip + this.lipInset,
      Math.min(this.profile.rightLip - this.lipInset, takeoffX),
    );
    const takeoff = this._sampleIncreasingX(anchorX);
    const verticalVelocity = this.computeLaunchVelocity(launchSpeed);

    this.state.mode = 'airborne';
    this.state.pipeX = anchorX;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = -this.airGravity;
    this.state.airSide = side;
    // Snapshot stance before any aerial half-turns change facingTurns. Trick
    // identity and scoring therefore describe the actual takeoff orientation.
    this.state.airTakeoffFakie = this._isFacingBack();
    this.state.airAnchorX = anchorX;
    this.state.airBaseY = takeoff.y;
    this.state.currentAirBaseY = takeoff.y;
    this.state.airY = takeoff.y;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.airLaunches += 1;
    this.state.currentAirPeakY = takeoff.y;
    this.state.runMaxAirY = this.state.runMaxAirY === null
      ? takeoff.y
      : Math.max(this.state.runMaxAirY, takeoff.y);
    this.state.maxAirY = this.state.runMaxAirY;
    this.state.lastAirPeakY = takeoff.y;
    this.state.airTurnHold = 0;
    this.state.airTurnDirection = 0;
    this.state.airTurnElapsed = 0;
    this.state.airTurnActive = false;
    this.state.airTurnAttempted = false;
    this.state.airTurnCompleted = false;
    this.state.airTurnOverturned = false;
    this.state.airTurnFailedReason = null;
    this.state.airRotationDegrees = 0;
    this.state.airRotationSignedDegrees = 0;
    this.state.airRotationTargetDegrees = 0;
    this.state.airLaunchVelocity = verticalVelocity;
    this.state.backflipHold = 0;
    this.state.backflipActive = false;
    this.state.backflipAttempted = false;
    this.state.backflipCompleted = false;
    this.state.backflipFailedReason = null;
    this.state.backflipRotationDegrees = 0;
    this.state.backflipTargetDegrees = 0;
    this.state.backflipInputArmed = !this.backflipHeld;
    this.state.trickType = null;
    this.state.trickProgress = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;
    this._emit('COPING_HIT', {
      side,
      speed: Math.abs(launchSpeed),
      maneuver: 'takeoff',
    });
    this._emit('TAKEOFF', {
      side,
      fakie: this.state.airTakeoffFakie,
      incomingSpeed: Math.abs(launchSpeed),
      verticalVelocity,
      baseY: takeoff.y,
    });
    return takeoff;
  }

  _startAirTurn(turnInput) {
    const direction = this._visualTurnDirectionForInput(turnInput) || 1;
    this.state.airTurnActive = true;
    this.state.airTurnAttempted = true;
    this.state.airTurnDirection = direction;
    this.state.airTurnElapsed = 0;
    this.state.airTurnHold = 0;
    this.state.airTurnCompleted = false;
    this.state.airTurnOverturned = false;
    this.state.airTurnFailedReason = null;
    this.state.airRotationDegrees = 0;
    this.state.airRotationSignedDegrees = 0;
    this.state.airRotationTargetDegrees = 0;
    this.state.trickType = 'aerial-turn';
    this.state.trickProgress = 0;
    if (!this.state.backflipAttempted) this.state.tricksAttempted += 1;
    this._emit('TRICK_STARTED', {
      trick: 'aerial-turn',
      side: this.state.airSide,
      input: direction,
    });
  }

  _finishAirTurnFromInput() {
    if (!this.state.airTurnAttempted || this.state.airTurnFailedReason) return;

    const cfg = PHASE4_GAMEPLAY_CONFIG.aerial;
    const resolved = nearestRotationTarget(
      this.state.airRotationSignedDegrees,
      cfg.targetStepDegrees,
      cfg.maximumDegrees,
    );
    this.state.airTurnActive = false;
    this.state.airRotationDegrees = resolved.rotation;
    this.state.airRotationTargetDegrees = resolved.target;
    this.state.airTurnDirection = Math.sign(this.state.airRotationSignedDegrees)
      || this.state.airTurnDirection
      || 1;

    if (resolved.rotation < cfg.targetStepDegrees - cfg.validErrorDegrees) {
      this.state.airTurnFailedReason = 'UNDER_ROTATED';
      this._failTrick('aerial-turn', 'UNDER_ROTATED');
    } else if (resolved.error > cfg.validErrorDegrees) {
      const reason = resolved.rotation < resolved.target
        ? 'UNDER_ROTATED'
        : 'OVER_ROTATED';
      this.state.airTurnOverturned = reason === 'OVER_ROTATED';
      this.state.airTurnFailedReason = reason;
      this._failTrick('aerial-turn', reason);
    } else {
      this.state.airTurnCompleted = true;
    }
  }

  _updateAirTurn() {
    const dt = this.fixedDt;
    const cfg = PHASE4_GAMEPLAY_CONFIG.aerial;

    if (
      !this.state.airTurnAttempted
      && this.turnIntent !== 0
    ) {
      this._startAirTurn(this.turnIntent);
    }

    if (!this.state.airTurnAttempted || this.state.airTurnFailedReason) return;

    this.state.airTurnElapsed += dt;
    const inputDirection = this._visualTurnDirectionForInput(this.turnIntent);

    // Rotation is now continuously reversible in-air. Releasing the stick/key
    // merely pauses rotation; pressing the opposite direction subtracts angle,
    // so an under/over-turn can be corrected right up until landing.
    if (inputDirection !== 0) {
      this.state.airTurnActive = true;
      this.state.airTurnHold += dt;
      this.state.airRotationSignedDegrees += (
        inputDirection * cfg.rotationDegreesPerSecond * dt
      );
      this.state.airRotationDegrees = Math.abs(this.state.airRotationSignedDegrees);
      this.state.airTurnDirection = Math.sign(this.state.airRotationSignedDegrees)
        || inputDirection;
      this.state.trickType = this.state.backflipAttempted ? 'backflip' : 'aerial-turn';
      this.state.trickProgress = (
        (this.state.airRotationDegrees % cfg.targetStepDegrees)
        / cfg.targetStepDegrees
      );
    } else {
      this.state.airTurnActive = false;
    }
  }

  _startBackflip() {
    this.state.backflipActive = true;
    this.state.backflipAttempted = true;
    this.state.backflipHold = 0;
    this.state.backflipCompleted = false;
    this.state.backflipFailedReason = null;
    this.state.backflipRotationDegrees = 0;
    this.state.backflipTargetDegrees = 0;
    this.state.trickType = 'backflip';
    this.state.trickProgress = 0;
    if (!this.state.airTurnAttempted) this.state.tricksAttempted += 1;
    this._emit('TRICK_STARTED', {
      trick: 'backflip',
      side: this.state.airSide,
      input: 'hold',
    });
  }

  _backflipMaximumDegrees() {
    const cfg = PHASE4_GAMEPLAY_CONFIG.backflip;
    return this.state.airLaunchVelocity >= cfg.doubleMinimumLaunchVelocity
      ? cfg.doubleDegrees
      : cfg.singleDegrees;
  }

  _finishBackflipFromInput() {
    if (!this.state.backflipAttempted || this.state.backflipFailedReason) return;

    const cfg = PHASE4_GAMEPLAY_CONFIG.backflip;
    const maximum = this._backflipMaximumDegrees();
    const resolved = nearestRotationTarget(
      this.state.backflipRotationDegrees,
      cfg.singleDegrees,
      maximum,
    );
    this.state.backflipActive = false;
    this.state.backflipTargetDegrees = resolved.target;

    if (resolved.rotation < cfg.singleDegrees - cfg.validErrorDegrees) {
      this.state.backflipFailedReason = 'UNDER_FLIPPED';
      this._failTrick('backflip', 'UNDER_FLIPPED');
    } else if (resolved.error > cfg.validErrorDegrees) {
      const reason = resolved.rotation < resolved.target
        ? 'UNDER_FLIPPED'
        : 'OVER_FLIPPED';
      this.state.backflipFailedReason = reason;
      this._failTrick('backflip', reason);
    } else {
      this.state.backflipCompleted = true;
    }
  }

  _updateBackflip() {
    const dt = this.fixedDt;
    const cfg = PHASE4_GAMEPLAY_CONFIG.backflip;

    // A button held before takeoff must be released once before it can start a
    // flip. This prevents hand-plant/confirm holds from becoming accidental
    // backflips while still allowing a press immediately after leaving coping.
    if (!this.state.backflipInputArmed) {
      if (!this.backflipHeld) this.state.backflipInputArmed = true;
      return;
    }

    if (
      !this.state.backflipAttempted
      && this.backflipHeld
    ) {
      this._startBackflip();
    }

    if (!this.state.backflipAttempted || this.state.backflipFailedReason) return;

    const maximum = this._backflipMaximumDegrees();
    if (this.backflipHeld) {
      this.state.backflipActive = true;
      this.state.backflipHold += dt;
      this.state.backflipRotationDegrees += cfg.rotationDegreesPerSecond * dt;
      this.state.trickType = 'backflip';
      this.state.trickProgress = (
        (this.state.backflipRotationDegrees % cfg.singleDegrees)
        / cfg.singleDegrees
      );

      if (
        this.state.backflipRotationDegrees
        > maximum + cfg.hardOverrunDegrees
      ) {
        this.state.backflipActive = false;
        this.state.backflipFailedReason = 'OVER_FLIPPED';
        this._failTrick('backflip', 'OVER_FLIPPED');
      }
      return;
    }

    if (this.state.backflipActive) this._finishBackflipFromInput();
  }

  _resolveLanding(side, baseY, impactVelocity) {
    if (this.state.backflipActive && !this.state.backflipFailedReason) {
      this._finishBackflipFromInput();
    }
    if (this.state.airTurnAttempted && !this.state.airTurnFailedReason) {
      this._finishAirTurnFromInput();
    }

    const isBackflip = this.state.backflipAttempted;
    const isAerial = this.state.airTurnAttempted;
    const combinedTrick = isBackflip && isAerial;
    const attemptedTrick = isBackflip || isAerial;
    const failedReason = this.state.backflipFailedReason || this.state.airTurnFailedReason;
    const trickSucceeded = (!isBackflip || this.state.backflipCompleted)
      && (!isAerial || this.state.airTurnCompleted);
    const rotationDegrees = isBackflip
      ? this.state.backflipRotationDegrees
      : this.state.airRotationDegrees;
    const rotationTargetDegrees = isBackflip
      ? (this.state.backflipTargetDegrees || PHASE4_GAMEPLAY_CONFIG.backflip.singleDegrees)
      : (this.state.airRotationTargetDegrees || PHASE4_GAMEPLAY_CONFIG.aerial.targetStepDegrees);

    // Both independent rotation channels must align. Use the worse error for
    // the shared landing rating instead of hiding an incomplete yaw in a flip.
    const combinedRotationError = Math.max(
      isBackflip ? Math.abs(this.state.backflipRotationDegrees - this.state.backflipTargetDegrees) : 0,
      isAerial ? Math.abs(this.state.airRotationDegrees - this.state.airRotationTargetDegrees) : 0,
    );

    const landing = evaluateLanding({
      attemptedTrick,
      trickSucceeded,
      rotationDegrees: combinedTrick ? rotationTargetDegrees + combinedRotationError : rotationDegrees,
      rotationTargetDegrees,
      impactSpeed: Math.abs(impactVelocity),
      returnDirectionValid: true,
      failedManeuver: Boolean(failedReason),
    });

    this.state.landingActive = true;
    this.state.landingQuality = landing.quality;
    this.state.landingImpact = landing.impact;
    this.state.landingScoreMultiplier = landing.scoreMultiplier;
    this.state.landingMomentumRetention = landing.momentumRetention;
    this.state.landingTime = this.state.time;
    this.state.landingRemaining = PHASE4_GAMEPLAY_CONFIG.landing.activeSeconds;
    this.state.lastLandingQuality = landing.quality;

    if (landing.quality === LANDING_QUALITIES.PERFECT) {
      this.state.perfectLandings += 1;
    } else if (landing.quality === LANDING_QUALITIES.CLEAN) {
      this.state.cleanLandings += 1;
    }

    const currentAirHeight = Math.max(
      0,
      (this.state.currentAirPeakY ?? baseY)
        - (this.state.currentAirBaseY ?? baseY),
    );

    let landedTrick = null;
    if (attemptedTrick && trickSucceeded && landing.quality !== LANDING_QUALITIES.BAIL) {
      const heightQuality = clamp01((currentAirHeight - 0.2) / 6.5);
      const channelQuality = (rotation, target, hold, config) => {
        const rotationRate = config.v9RotationDegreesPerSecond || config.rotationDegreesPerSecond;
        const idealHold = target / Math.max(1, rotationRate);
        return {
          rotation: rotationQualityFromDegrees(rotation, target),
          hold: clamp01(1 - Math.abs(hold - idealHold) / Math.max(0.24, idealHold * 0.38)),
        };
      };
      const flipQuality = isBackflip ? channelQuality(
        this.state.backflipRotationDegrees, this.state.backflipTargetDegrees,
        this.state.backflipHold, PHASE4_GAMEPLAY_CONFIG.backflip,
      ) : null;
      const aerialQuality = isAerial ? channelQuality(
        this.state.airRotationDegrees, this.state.airRotationTargetDegrees,
        this.state.airTurnHold, PHASE4_GAMEPLAY_CONFIG.aerial,
      ) : null;
      const rotationQuality = combinedTrick
        ? Math.min(flipQuality.rotation, aerialQuality.rotation)
        : (flipQuality || aerialQuality).rotation;
      const holdQuality = combinedTrick
        ? (flipQuality.hold + aerialQuality.hold) * 0.5
        : (flipQuality || aerialQuality).hold;
      const landingQuality = clamp01(landing.scoreMultiplier / 1.2);
      const totalQuality = clamp01(
        heightQuality * 0.3
        + rotationQuality * 0.4
        + holdQuality * 0.15
        + landingQuality * 0.15,
      );

      if (isBackflip) {
        landedTrick = rotationTargetDegrees >= PHASE4_GAMEPLAY_CONFIG.backflip.doubleDegrees
          ? 'double-backflip'
          : 'backflip';
      }
      if (isAerial) {
        const halfTurns = Math.max(
          1,
          Math.round(this.state.airRotationTargetDegrees / PHASE4_GAMEPLAY_CONFIG.aerial.targetStepDegrees),
        );
        this.state.facingTurns += halfTurns * (this.state.airTurnDirection || 1);
        const aerialTrick = (this.state.airTakeoffFakie ? 'fakie-' : '')
          + 'aerial-' + this.state.airRotationTargetDegrees;
        landedTrick = combinedTrick ? aerialTrick + '-' + landedTrick : aerialTrick;
      }

      this.state.tricksLanded += 1;
      this._awardValidatedTrick(
        landedTrick,
        totalQuality,
        landing.scoreMultiplier,
        side,
        isAerial ? this.state.airTurnDirection : 0,
      );
    }

    this._emit('LANDING', {
      quality: landing.quality,
      impact: landing.impact,
      scoreMultiplier: landing.scoreMultiplier,
      momentumRetention: landing.momentumRetention,
      currentAirHeight,
      rotationDegrees,
      rotationTargetDegrees,
      aerialRotationDegrees: this.state.airRotationDegrees,
      backflipRotationDegrees: this.state.backflipRotationDegrees,
      combinedTrick,
      trick: landedTrick,
      fakieTakeoff: this.state.airTakeoffFakie,
    });

    if (landing.quality === LANDING_QUALITIES.BAIL) {
      const reason = failedReason || 'BAD_LANDING';
      this._startCrash(reason);
    }

    const baseLandingSpeed = landing.quality === LANDING_QUALITIES.BAIL
      ? (this.state.airEntrySurfaceSpeed || Math.abs(impactVelocity) * this.airLandingVelocityRetention)
      : Math.abs(impactVelocity) * this.airLandingVelocityRetention;
    const retention = landing.quality === LANDING_QUALITIES.BAIL
      ? PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention
      : landing.momentumRetention;
    const landingSpeed = baseLandingSpeed * retention;

    this.state.mode = 'contact';
    this.state.pipeX = this.state.airAnchorX ?? this.state.pipeX;
    // On a bail this naturally sends the rider from either wall toward the
    // middle of the pipe, matching the requested slide-down recovery.
    this.state.tangentVelocity = side < 0 ? landingSpeed : -landingSpeed;
    this.state.airSide = 0;
    this.state.airTakeoffFakie = false;
    this.state.airAnchorX = null;
    this.state.airBaseY = null;
    this.state.currentAirBaseY = null;
    this.state.airY = null;
    this.state.airVerticalVelocity = 0;
    this.state.airLaunchVelocity = 0;
    this.state.airTurnHold = 0;
    this.state.airTurnDirection = 0;
    this.state.airTurnElapsed = 0;
    this.state.airTurnActive = false;
    this.state.airTurnAttempted = false;
    this.state.airTurnCompleted = false;
    this.state.airTurnOverturned = false;
    this.state.airTurnFailedReason = null;
    this.state.airRotationDegrees = 0;
    this.state.airRotationSignedDegrees = 0;
    this.state.airRotationTargetDegrees = 0;
    this.state.backflipHold = 0;
    this.state.backflipActive = false;
    this.state.backflipAttempted = false;
    this.state.backflipCompleted = false;
    this.state.backflipFailedReason = null;
    this.state.backflipRotationDegrees = 0;
    this.state.backflipTargetDegrees = 0;
    this.state.backflipInputArmed = true;
    this.state.trickType = null;
    this.state.trickProgress = 0;
    this._lastDirection = signWithEpsilon(
      this.state.tangentVelocity,
      this.velocityEpsilon,
    );
  }

  _stepAirborne() {
    const dt = this.fixedDt;
    this.handPlantBufferRemaining = 0;
    const side = this.state.airSide || (this.state.pipeX < 0 ? -1 : 1);
    const anchorX = this.state.airAnchorX ?? this.state.pipeX;
    const baseY = this.state.airBaseY ?? this._sampleIncreasingX(anchorX).y;
    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;
    this.state.backflipHeld = this.backflipHeld;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;

    this._updateBackflip();
    this._updateAirTurn();

    const previousVerticalVelocity = this.state.airVerticalVelocity;
    const verticalVelocity = previousVerticalVelocity - this.airGravity * dt;
    let nextY = (this.state.airY ?? baseY) + verticalVelocity * dt;

    this.state.time += dt;
    this.state.pipeX = anchorX;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.tangentialAcceleration = -this.airGravity;

    this.state.currentAirPeakY = this.state.currentAirPeakY === null
      ? nextY
      : Math.max(this.state.currentAirPeakY, nextY);
    this.state.runMaxAirY = this.state.runMaxAirY === null
      ? nextY
      : Math.max(this.state.runMaxAirY, nextY);
    this.state.maxAirY = this.state.runMaxAirY;
    this.state.highestAir = Math.max(
      this.state.highestAir,
      (this.state.currentAirPeakY ?? baseY) - (this.state.currentAirBaseY ?? baseY),
    );

    if (previousVerticalVelocity > 0 && verticalVelocity <= 0) {
      this.state.lastAirPeakY = this.state.currentAirPeakY;
      this._emit('AIR_APEX', {
        peakY: this.state.currentAirPeakY,
        height: Math.max(
          0,
          (this.state.currentAirPeakY ?? baseY)
            - (this.state.currentAirBaseY ?? baseY),
        ),
      });
    }

    if (nextY <= baseY && verticalVelocity < 0) {
      nextY = baseY;
      this.state.airY = nextY;
      this._resolveLanding(side, baseY, verticalVelocity);
    } else {
      this.state.airY = nextY;
    }

    this._refreshDerivedState();
    return this.snapshot();
  }

  stepFixed() {
    // Buffer lifetime follows simulation time even in air or during a trick;
    // an early released pump must not survive an entire flight or hand plant.
    this._pumpBufferRemaining = Math.max(0, this._pumpBufferRemaining - this.fixedDt);
    this.state.pumpBufferRemaining = this._pumpBufferRemaining;
    if (this.state.surfaceTrickActive) return this._stepSurfaceTrick();
    if (this.state.mode === 'airborne') return this._stepAirborne();

    const dt = this.fixedDt;
    this._advanceRecovery();

    if (this.state.landingActive) {
      this.state.landingRemaining = Math.max(
        0,
        this.state.landingRemaining - dt,
      );
      if (this.state.landingRemaining <= 0) {
        this.state.landingActive = false;
        this.state.landingQuality = null;
      }
    }

    if (!this.handPlantHeld && this.handPlantBufferRemaining > 0) {
      this.handPlantBufferRemaining = Math.max(
        0,
        this.handPlantBufferRemaining - dt,
      );
    }

    const previousX = this.state.pipeX;
    const previousVelocity = this.state.tangentVelocity;
    const sample = this._sampleIncreasingX(previousX);
    const desiredIntent = this._pumpPhase(previousX, previousVelocity);
    const bufferedPumpIntent = this._pumpBufferRemaining > 0
      && this._pumpBufferedIntent === desiredIntent ? this._pumpBufferedIntent : 0;

    const crashCfg = PHASE4_GAMEPLAY_CONFIG.crash;
    const recoveryElapsed = this.state.crashActive
      ? Math.max(0, crashCfg.recoverySeconds - this.state.recoveryRemaining)
      : crashCfg.recoverySeconds;
    const recoveryPumpUnlocked = (
      !this.state.crashActive
      || recoveryElapsed >= crashCfg.pumpLockSeconds
    );

    // Keep the immediate impact readable, then return pump authority while the
    // bail animation is still resolving. Turning/tricks stay locked until the
    // normal crash recovery completes.
    const effectivePumpIntent = recoveryPumpUnlocked ? (this.pumpIntent || bufferedPumpIntent) : 0;
    const effectiveTurnIntent = this.state.crashActive ? 0 : this.turnIntent;

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
    const recoveryMinimumSpeed = this.state.crashActive && recoveryPumpUnlocked
      ? crashCfg.recoveryPumpMinimumSpeed
      : this.pumpMinimumSpeed;
    const speedEligible = Math.abs(previousVelocity) >= recoveryMinimumSpeed
      || (effectivePumpIntent === desiredIntent
        && Math.abs(previousVelocity) < PHASE4_GAMEPLAY_CONFIG.pumping.lowEnergyRecovery.referenceSpeed);

    const pumpRating = evaluatePumpRating({
      intent: effectivePumpIntent,
      desiredIntent,
      wallFraction,
      speedEligible,
    });
    const shouldRecordPumpAttempt = (
      effectivePumpIntent !== 0
      && (
        effectivePumpIntent !== this._lastPumpInput
        || desiredIntent !== this._lastPumpDesiredIntent
      )
    );
    if (shouldRecordPumpAttempt) this._updatePumpStats(pumpRating);

    let ratingMultiplier = pumpRating
      ? PHASE4_GAMEPLAY_CONFIG.pumping.ratingMultipliers[pumpRating]
      : 0;

    const recoveryPumpActive = this.state.crashActive && recoveryPumpUnlocked;
    if (
      recoveryPumpActive
      && pumpRating
      && pumpRating !== PUMP_RATINGS.WRONG
      && ratingMultiplier > 0
    ) {
      // During bail recovery even an early/late but correctly directed pump
      // should help the rider rebuild speed instead of feeling trapped.
      ratingMultiplier = Math.max(
        ratingMultiplier,
        crashCfg.recoveryMinimumPumpMultiplier,
      );
    }

    const velocityDirection = signWithEpsilon(previousVelocity, this.velocityEpsilon)
      || signWithEpsilon(gravityAlongTangent, this.velocityEpsilon)
      || this._lastDirection || 1;
    let pumpAcceleration = 0;
    if (
      pumpRating
      && pumpRating !== PUMP_RATINGS.WRONG
      && ratingMultiplier > 0
    ) {
      const recoveryAccelerationMultiplier = recoveryPumpActive
        ? crashCfg.recoveryPumpAccelerationMultiplier
        : 1;
      pumpAcceleration = this.pumpAcceleration
        * recoveryAccelerationMultiplier
        * pumpInfluence
        * ratingMultiplier
        * velocityDirection;
    } else if (pumpRating === PUMP_RATINGS.WRONG) {
      const wrongPenaltyMultiplier = recoveryPumpActive
        ? crashCfg.recoveryWrongPumpPenaltyMultiplier
        : 1;
      pumpAcceleration = -this.wrongPumpPenaltyAcceleration
        * wrongPenaltyMultiplier
        * velocityDirection;
    }

    const acceleration = scaledGravity + dragAcceleration + pumpAcceleration;
    let velocity = previousVelocity + acceleration * dt;

    const pumpWork = pumpAcceleration * previousVelocity * dt;
    if (pumpWork > 0) this.state.pumpWorkTotal += pumpWork;

    this.state.pumpIntent = effectivePumpIntent;
    this.state.pumpDesiredIntent = desiredIntent;
    this.state.pumpWindowInfluence = pumpInfluence;
    this.state.pumpTimingQuality = pumpRating === PUMP_RATINGS.PERFECT
      ? 1
      : pumpRating === PUMP_RATINGS.GOOD
        ? 0.8
        : pumpRating === PUMP_RATINGS.WEAK
          ? 0.55
          : pumpRating === PUMP_RATINGS.EARLY || pumpRating === PUMP_RATINGS.LATE
            ? 0.25
            : 0;
    this.state.pumpActive = pumpAcceleration * velocityDirection > 0;
    this.state.pumpRating = pumpRating;
    this.state.lastPumpWork = pumpWork;
    this.state.turnIntent = effectiveTurnIntent;
    this.state.handPlantHeld = this.state.crashActive ? false : this.handPlantHeld;
    this.state.trickType = null;
    this.state.trickProgress = 0;

    const originalTurnIntent = this.turnIntent;
    if (this.state.crashActive) this.turnIntent = 0;
    const surfaceTurn = this._trySurfaceTurn(previousX, velocity, desiredIntent);
    this.turnIntent = originalTurnIntent;
    velocity = surfaceTurn.velocity;

    this._lastPumpInput = effectivePumpIntent;
    this._lastPumpDesiredIntent = desiredIntent;

    if (surfaceTurn.frozen) {
      this.state.time += dt;
      this.state.tangentVelocity = 0;
      this.state.tangentialAcceleration = 0;
      this._refreshDerivedState();
      return this.snapshot();
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
        const rebound = Math.abs(velocity) * PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention;
        velocity = rebound;
        this._startCrash('TECHNICAL_CRASH');
      } else if (nextX >= maxX && velocity > 0) {
        this.state.lipContacts += 1;
        nextX = maxX;
        const rebound = Math.abs(velocity) * PHASE4_GAMEPLAY_CONFIG.crash.bailMomentumRetention;
        velocity = -rebound;
        this._startCrash('TECHNICAL_CRASH');
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
      this._emit('BOTTOM_CROSSING', {
        speed: this.state.lastCrossingSpeed,
        interval: this.state.bottomCrossingInterval,
        crossings: this.state.bottomCrossings,
      });
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
