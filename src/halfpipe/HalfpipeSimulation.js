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

function rotationQualityFromDegrees(rotationDegrees) {
  const error = Math.abs((Number(rotationDegrees) || 0) - 180);
  return clamp01(1 - error / 55);
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
      options.handPlantMinFraction ?? turningDefaults.handPlantMinFraction;
    this.handPlantRetention =
      options.handPlantRetention ?? turningDefaults.handPlantRetention;
    this.handPlantBufferSeconds =
      options.handPlantBufferSeconds ?? turningDefaults.handPlantBufferSeconds;
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

      airSide: 0,
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
    this._lastPumpInput = 0;
    this._lastPumpDesiredIntent = 0;
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
    this.pumpIntent = intent > 0 ? 1 : intent < 0 ? -1 : 0;
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

  _pumpPhase(previousX, previousVelocity) {
    const phaseSignal = previousX * previousVelocity;
    if (phaseSignal > this.velocityEpsilon) return 1;
    if (phaseSignal < -this.velocityEpsilon) return -1;
    return this.state.pumpDesiredIntent || 0;
  }

  _isFacingBack() {
    return Math.abs(Math.trunc(this.state.facingTurns)) % 2 === 1;
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

  _awardValidatedTrick(type, quality, landingScoreMultiplier = 1, side = 0) {
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
    this.state.lastTrickTurnDirection = 1;
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
  ) {
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
    this.state.surfaceTrickHold = this.handPlantHeld ? this.fixedDt : 0;
    this.state.surfaceTrickReleased = false;
    this.state.surfaceTrickFacingCommitted = true;
    this.state.tangentVelocity = 0;
    this.state.tangentialAcceleration = 0;
    this.state.trickType = type;
    this.state.trickProgress = 0;
    this.state.turningPoints += 1;
    this.state.lastTurningPointX = this.state.pipeX;
    this.state.lastTrickTurnDirection = 1;
    this.state.lastTrickSide = signWithEpsilon(
      this.state.pipeX,
      this.velocityEpsilon,
    );
    this.state.facingTurns += 1;
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
      : this.state.surfaceTrickExitVelocity * 0.62;

    if (success) {
      this.state.surfaceTrickPhase = 'COMPLETE';
      this.state.tricksLanded += 1;
      this._awardValidatedTrick(
        type,
        finalQuality,
        1,
        this.state.lastTrickSide,
      );
    } else {
      this.state.surfaceTrickPhase = 'FAIL';
      if (this.state.surfaceTrickFacingCommitted) this.state.facingTurns -= 1;
      this._failTrick(type, failReason);
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
    const allowedSide = this._allowedTrickSide();
    if (side === 0 || side !== allowedSide) {
      return { velocity, turned: false, frozen: false };
    }

    const sample = this._sampleIncreasingX(previousX);
    const predictedX = previousX
      + velocity * sample.tangent.x * this.fixedDt;
    const wallFraction = this._wallFraction(previousX);
    const predictedWallFraction = this._wallFraction(predictedX);
    const expectedTurnIntent = this._expectedTurnIntentForAllowedSide();

    const handPlantRequested = (
      this.handPlantHeld || this.handPlantBufferRemaining > 0
    );

    if (
      handPlantRequested
      && Math.max(wallFraction, predictedWallFraction) >= this.handPlantMinFraction
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

    if (
      this.turnIntent === expectedTurnIntent
      && wallFraction >= this.kickTurnMinFraction
    ) {
      const quality = (wallFraction - this.kickTurnMinFraction)
        / Math.max(1e-4, 1 - this.kickTurnMinFraction);
      return this._startSurfaceTrick(
        'kick-turn',
        quality,
        velocity,
        this.trickPresentation.kickTurnDuration,
        this.kickTurnRetention,
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
    this.state.airTurnElapsed = 0;
    this.state.airTurnActive = false;
    this.state.airTurnFrozenY = null;
    this.state.airTurnStoredVerticalVelocity = 0;
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
    this.handPlantBufferRemaining = 0;
    const side = this.state.airSide || (this.state.pipeX < 0 ? -1 : 1);
    const anchorX = this.state.airAnchorX ?? this.state.pipeX;
    const baseY = this.state.airBaseY ?? this._sampleIncreasingX(anchorX).y;
    const allowedSide = this._allowedTrickSide();
    const expectedTurn = this._expectedTurnIntentForAllowedSide();
    const trickSideAllowed = side === allowedSide;

    this.state.turnIntent = this.turnIntent;
    this.state.handPlantHeld = this.handPlantHeld;
    this.state.pumpIntent = 0;
    this.state.pumpDesiredIntent = 0;
    this.state.pumpWindowInfluence = 0;
    this.state.pumpTimingQuality = 0;
    this.state.pumpActive = false;
    this.state.lastPumpWork = 0;

    if (
      !this.state.airTurnActive
      && !this.state.airTurnCompleted
      && trickSideAllowed
      && this.turnIntent === expectedTurn
    ) {
      this.state.airTurnActive = true;
      this.state.airTurnDirection = 1;
      this.state.airTurnElapsed = 0;
      this.state.airTurnHold = 0;
      this.state.airTurnFrozenY = this.state.airY ?? baseY;
      this.state.airTurnStoredVerticalVelocity = this.state.airVerticalVelocity;
      this.state.trickType = 'aerial-turn';
      this.state.trickProgress = 0;
    }

    if (this.state.airTurnActive) {
      this.state.time += dt;
      this.state.airTurnElapsed += dt;
      if (trickSideAllowed && this.turnIntent === expectedTurn) {
        this.state.airTurnHold += dt;
      }

      const duration = Math.max(
        this.fixedDt,
        this.trickPresentation.aerialTurnDuration,
      );
      this.state.trickType = 'aerial-turn';
      this.state.trickProgress = Math.min(
        1,
        this.state.airTurnElapsed / duration,
      );
      this.state.airY = this.state.airTurnFrozenY ?? this.state.airY ?? baseY;
      this.state.airVerticalVelocity = 0;
      this.state.tangentialAcceleration = 0;

      if (this.state.airTurnHold >= this.aerialCompleteSeconds) {
        this.state.airTurnCompleted = true;
      }
      if (this.state.airTurnHold > this.aerialOverturnSeconds) {
        this.state.airTurnOverturned = true;
      }

      if (this.state.airTurnElapsed >= duration) {
        const storedVerticalVelocity =
          this.state.airTurnStoredVerticalVelocity;
        this.state.airTurnActive = false;

        // Bullet-time turn consumes the remaining upward phase. If the trick
        // started before the natural apex, the held trick height becomes the
        // new apex; gravity resumes downward from here instead of restoring
        // positive velocity and creating a second, bugged height gain.
        this.state.airVerticalVelocity = Math.min(
          0,
          storedVerticalVelocity,
        );
        if (storedVerticalVelocity > 0) {
          this.state.lastAirPeakY = this.state.airY;
          this.state.maxAirY = this.state.maxAirY === null
            ? this.state.airY
            : Math.max(this.state.maxAirY, this.state.airY);
        }

        this.state.airTurnFrozenY = null;
        this.state.airTurnStoredVerticalVelocity = 0;
        this.state.trickProgress = 1;
        if (!this.state.airTurnCompleted) {
          this.state.airTurnCompleted = true;
        }
      }

      this._refreshDerivedState();
      return this.snapshot();
    }

    const previousVerticalVelocity = this.state.airVerticalVelocity;
    const verticalVelocity = previousVerticalVelocity - this.airGravity * dt;
    let nextY = (this.state.airY ?? baseY) + verticalVelocity * dt;

    this.state.time += dt;
    this.state.pipeX = anchorX;
    this.state.airVerticalVelocity = verticalVelocity;
    this.state.tangentialAcceleration = -this.airGravity;

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
          1,
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
      this.state.airTurnElapsed = 0;
      this.state.airTurnActive = false;
      this.state.airTurnFrozenY = null;
      this.state.airTurnStoredVerticalVelocity = 0;
      this.state.airTurnCompleted = false;
      this.state.airTurnOverturned = false;
      this.state.trickType = null;
      this.state.trickProgress = 0;
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
    if (this.state.surfaceTrickActive) return this._stepSurfaceTrick();
    if (this.state.mode === 'airborne') return this._stepAirborne();

    const dt = this.fixedDt;
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

    if (surfaceTurn.frozen) {
      this.state.time += dt;
      // _startSurfaceTrick may deliberately move the presentation/contact
      // anchor (Hand Plant pins to the coping). Preserve that resolved anchor
      // instead of snapping back to the pre-trigger wall position.
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
