import { GAME_CONFIG } from '../config/gameConfig.js';
import {
  LANDING_QUALITY,
  normalizeLandingQuality,
  resolveSkateAnimationState,
} from './SkateAnimationState.js';

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const damp = (current, target, response, dt) => {
  const alpha = 1 - Math.exp(-Math.max(0, response) * Math.max(0, dt));
  return current + (target - current) * alpha;
};

function inferLandingQuality(verticalSpeed) {
  const speed = Math.abs(Number(verticalSpeed) || 0);
  if (speed >= 18) return LANDING_QUALITY.HEAVY;
  if (speed >= 14) return LANDING_QUALITY.SKETCHY;
  if (speed >= 9) return LANDING_QUALITY.CLEAN;
  return LANDING_QUALITY.PERFECT;
}

function landingStrength(verticalSpeed) {
  const maxSpeed = Math.max(1, GAME_CONFIG.air.maximumVerticalVelocity || 20);
  return clamp01((Math.abs(Number(verticalSpeed) || 0) - 4) / (maxSpeed - 4));
}

export class SkateAnimationController {
  constructor() {
    this.lastTime = null;
    this.wasAirborne = false;
    this.lastAirVerticalVelocity = 0;
    this.activeLanding = 0;
    this.activeLandingQuality = LANDING_QUALITY.NONE;
    this.recovery = 0;
    this.animationState = null;
    this.stateTime = 0;
    this.blend = 1;
    this.smoothedPreload = 0.3;
    this.smoothedFootIK = 1;
    this.secondaryLag = 0;
    this.lastFacingYaw = 0;
  }

  reset(state = {}) {
    this.lastTime = Number.isFinite(Number(state.time)) ? Number(state.time) : null;
    this.wasAirborne = Boolean(state.airborne);
    this.lastAirVerticalVelocity = Number(state.verticalVelocity) || 0;
    this.activeLanding = 0;
    this.activeLandingQuality = LANDING_QUALITY.NONE;
    this.recovery = 0;
    this.animationState = null;
    this.stateTime = 0;
    this.blend = 1;
    this.smoothedPreload = clamp01(state.preloadCompression ?? 0.3);
    this.smoothedFootIK = state.airborne ? 0.35 : 1;
    this.secondaryLag = 0;
    this.lastFacingYaw = Number(state.facingYaw) || 0;
  }

  update(rawState = {}) {
    const time = Number(rawState.time);
    if (Number.isFinite(time) && Number.isFinite(this.lastTime) && time < this.lastTime - 1e-6) {
      this.reset(rawState);
    }
    let dt = Number.isFinite(time) && Number.isFinite(this.lastTime)
      ? time - this.lastTime
      : 1 / 60;
    if (!(dt > 0) || dt > 0.12) dt = 1 / 60;
    this.lastTime = Number.isFinite(time) ? time : this.lastTime;

    if (rawState.airborne) {
      this.lastAirVerticalVelocity = Number(rawState.verticalVelocity) || 0;
    }

    const explicitQuality = normalizeLandingQuality(rawState.landingQuality);
    const explicitLanding = clamp01(rawState.landing);
    const justLanded = this.wasAirborne && !rawState.airborne;

    if (justLanded) {
      this.activeLanding = Math.max(
        explicitLanding,
        0.34 + landingStrength(this.lastAirVerticalVelocity) * 0.66,
      );
      this.activeLandingQuality = explicitQuality !== LANDING_QUALITY.NONE
        ? explicitQuality
        : inferLandingQuality(this.lastAirVerticalVelocity);
      this.recovery = Math.max(this.recovery, this.activeLanding);
    } else if (explicitLanding > 0) {
      this.activeLanding = Math.max(this.activeLanding, explicitLanding);
      if (explicitQuality !== LANDING_QUALITY.NONE) {
        this.activeLandingQuality = explicitQuality;
      }
      this.recovery = Math.max(this.recovery, explicitLanding * 0.85);
    }

    if (!rawState.airborne) {
      this.activeLanding = Math.max(0, this.activeLanding - dt * 2.8);
      this.recovery = Math.max(0, this.recovery - dt * 1.55);
    }

    const landing = Math.max(explicitLanding, this.activeLanding);
    const landingQuality = explicitQuality !== LANDING_QUALITY.NONE
      ? explicitQuality
      : this.activeLandingQuality;

    const airHeight = Math.max(0, Number(rawState.airHeight) || 0);
    const descendingAir = rawState.airborne && Number(rawState.verticalVelocity) < 0;
    const landingAnticipation = descendingAir
      ? clamp01(1 - airHeight / 2.2)
      : clamp01(rawState.landingAnticipation);
    const airTuck = rawState.airborne
      ? clamp01(
        (Number(rawState.airTuck) || 0)
        + clamp01(airHeight / 3.4) * (landingAnticipation * -0.45 + 0.55),
      )
      : 0;

    const bailFootLock = !rawState.airborne
      && (
        landingQuality === LANDING_QUALITY.BAIL
        || this.activeLandingQuality === LANDING_QUALITY.BAIL
      );
    const targetFootIK = bailFootLock
      ? 1
      : rawState.airborne
        ? 0.2 + landingAnticipation * 0.68
        : 1;

    // Release the board lock aggressively on takeoff, but snap both feet back
    // to the deck on a bail. A failed landing should look unstable through
    // knees/torso/arms, never because one foot is visually left behind.
    const footIKResponse = bailFootLock
      ? 54
      : rawState.airborne && !this.wasAirborne
        ? 48
        : 10;
    this.smoothedFootIK = damp(
      this.smoothedFootIK,
      targetFootIK,
      footIKResponse,
      dt,
    );
    if (bailFootLock && this.smoothedFootIK > 0.985) {
      this.smoothedFootIK = 1;
    }
    this.smoothedPreload = damp(
      this.smoothedPreload,
      clamp01(rawState.preloadCompression),
      rawState.rampAscending ? 9 : 12,
      dt,
    );

    const facingYaw = Number(rawState.facingYaw) || 0;
    const yawDelta = facingYaw - this.lastFacingYaw;
    this.lastFacingYaw = facingYaw;
    this.secondaryLag = damp(
      this.secondaryLag,
      Math.max(-0.22, Math.min(0.22, -yawDelta * 0.42)),
      7.5,
      dt,
    );
    if (!rawState.trickVisualActive && !rawState.airborne) {
      this.secondaryLag = damp(this.secondaryLag, 0, 11, dt);
    }

    const next = {
      ...rawState,
      landing,
      landingQuality,
      recovery: this.recovery,
      landingAnticipation,
      airTuck,
      footIKWeight: clamp01(this.smoothedFootIK),
      preloadCompression: clamp01(this.smoothedPreload),
      secondaryLag: this.secondaryLag,
    };
    const nextAnimationState = resolveSkateAnimationState(next);

    if (nextAnimationState !== this.animationState) {
      this.animationState = nextAnimationState;
      this.stateTime = 0;
      this.blend = 0;
    } else {
      this.stateTime += dt;
    }
    this.blend = damp(this.blend, 1, 12, dt);

    next.animationState = this.animationState;
    next.animationBlend = clamp01(this.blend);
    next.stateTime = this.stateTime;

    this.wasAirborne = Boolean(rawState.airborne);
    if (this.activeLanding <= 0.001 && !rawState.airborne) {
      this.activeLandingQuality = LANDING_QUALITY.NONE;
    }
    return next;
  }
}
