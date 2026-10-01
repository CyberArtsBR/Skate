import * as THREE from 'three';
import { ImpactVFX } from './ImpactVFX.js';
import { SpeedTrailVFX } from './SpeedTrailVFX.js';
import { quality } from '../graphics/RenderQualityManager.js';
import { ARCADE_FEEDBACK } from './ArcadeFeedbackTuning.js';
import { ContactFeedbackGate } from '../presentation/ContactFeedback.js';

const LANDING_IMPACTS = Object.freeze({
  PERFECT: Object.freeze({ strength: 0.005, duration: 0.08 }),
  CLEAN: Object.freeze({ strength: 0.018, duration: 0.11 }),
  SKETCHY: Object.freeze({ strength: 0.055, duration: 0.16 }),
  HEAVY: Object.freeze({ strength: 0.105, duration: 0.22 }),
  BAIL: Object.freeze({ strength: 0.055, duration: 0.14 }),
});
const TRAIL_OBJECT_KEYS = Object.freeze(['velocity', 'boardQuaternion', 'trickType']);
const TRAIL_NUMBER_KEYS = Object.freeze(['speedRatio', 'backflipRotationDegrees', 'aerialRotationDegrees']);

function ratingOf(event, fallback = 'CLEAN') {
  return String(event?.rating || event?.quality || fallback).trim().toUpperCase();
}

function eventPosition(event) {
  return event?.handContactPosition
    || event?.plantHandWorldPosition
    || event?.contactPosition
    || event?.worldPosition
    || event?.position
    || null;
}

function eventVelocity(event) {
  return event?.worldVelocity || event?.velocity || null;
}

function eventNormal(event) {
  return event?.surfaceNormal || event?.normal || null;
}

export class HalfpipeVFX {
  constructor(scene, { reducedMotion = false } = {}) {
    if (!scene?.add) throw new TypeError('HalfpipeVFX requires a THREE.Scene-like parent');
    this.scene = scene;
    this.reducedMotion = Boolean(reducedMotion);
    this.vfxScale = quality.vfxScale;
    this.impact = new ImpactVFX(scene, {
      reducedMotion: this.reducedMotion,
      scale: this.vfxScale,
    });
    this.speedTrail = new SpeedTrailVFX(scene, {
      reducedMotion: this.reducedMotion,
      scale: this.vfxScale,
    });
    this.lastAirState = {
      position: new THREE.Vector3(),
      verticalVelocity: 0,
      height: 0,
      airborne: false,
      velocity: null,
      speedRatio: 0,
      boardQuaternion: null,
      backflipRotationDegrees: 0,
      aerialRotationDegrees: 0,
      trickType: '',
      aerialBackflip: false,
      severeCrash: false,
    };
    this.severeCrashActive = false;
    this.contactGate = new ContactFeedbackGate();
    this._carveAccumulator = 0;
    this._unsubscribeQuality = quality.subscribe(({ vfxScale }) => this.setScale(vfxScale));
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    this.impact.setReducedMotion(this.reducedMotion);
    this.speedTrail.setReducedMotion(this.reducedMotion);
  }

  setScale(scale) {
    this.vfxScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 1.25);
    this.impact.setScale(this.vfxScale);
    this.speedTrail.setScale(this.vfxScale);
    return this.vfxScale;
  }

  handleEvent(event = {}) {
    const type = String(event.type || '').trim().toUpperCase();
    const position = eventPosition(event);
    const velocity = eventVelocity(event);
    const normal = eventNormal(event);
    let cameraImpact = null;
    let handled = true;

    switch (type) {
      case 'PUMP_RATING': {
        if (position) {
          this.impact.pump({
            position,
            velocity,
            normal,
          });
        }
        break;
      }

      case 'COPING_HIT': {
        const maneuver = String(event.maneuver || event.trick || '').toLowerCase().replaceAll('_', '-');
        if (maneuver === 'hand-plant' || maneuver === 'takeoff') break;
        if (!this.contactGate.claim(event, 'coping')) break;
        if (position) {
          this.impact.copingContact({
            position,
            normal,
            velocity,
            contactKind: event.contactKind || 'metal',
          });
        }
        break;
      }

      case 'TAKEOFF': {
        if (!this.contactGate.claim(event, 'takeoff')) break;
        if (position) {
          this.impact.takeoff({ position, velocity, normal });
        }
        break;
      }

      case 'HAND_PLANT_CONTACT': {
        if (!this.contactGate.claim(event, 'hand')) break;
        if (position) {
          this.impact.copingContact({
            position,
            normal,
            velocity,
            contactKind: 'hand',
          });
        }
        break;
      }

      case 'LANDING': {
        if (!this.contactGate.claim(event, 'landing')) break;
        const rating = ratingOf(event);
        if (position) {
          this.impact.landing({
            position,
            velocity,
            rating,
            normal,
            impact: event.impact,
            impactIntensity: event.impactIntensity,
          });
        }
        cameraImpact = LANDING_IMPACTS[rating] || LANDING_IMPACTS.CLEAN;
        break;
      }

      case 'BAIL': {
        if (!this.contactGate.claim(event, 'landing')) break;
        if (position) {
          this.impact.crash({ position, velocity, normal, impact: event.impact });
        }
        cameraImpact = LANDING_IMPACTS.BAIL;
        break;
      }

      case 'TRICK_STARTED': {
        if (String(event.trick || '').toLowerCase() !== 'kick-turn') break;
        if (!this.contactGate.claim(event, 'coping')) break;
        if (position) this.impact.copingContact({ position, velocity, normal,
          contactKind: event.contactKind || 'metal' });
        break;
      }

      case 'TRICK_COMPLETED': {
        // Completion belongs to HUD/score feedback; physical contact already
        // emitted at the measured wheel or hand position.
        break;
      }

      case 'COMBO_CHANGED': {
        this.speedTrail.setCombo(event.combo ?? event.count ?? event.multiplier ?? 0);
        break;
      }

      default:
        handled = false;
        break;
    }

    if (this.reducedMotion && cameraImpact) {
      cameraImpact = {
        strength: cameraImpact.strength * 0.15,
        duration: Math.min(cameraImpact.duration, 0.12),
      };
    }

    return {
      handled,
      cameraImpact,
    };
  }

  update(dt, riderState = null) {
    const step = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    this.impact.update(step);

    if (riderState) {
      const position = riderState.position || riderState.worldPosition;
      if (position?.isVector3) this.lastAirState.position.copy(position);
      else if (Array.isArray(position)) this.lastAirState.position.fromArray(position);
      else if (position && typeof position === 'object') this.lastAirState.position.set(
        Number(position.x) || 0,
        Number(position.y) || 0,
        Number(position.z) || 0,
      );

      this.lastAirState.verticalVelocity = Number(riderState.verticalVelocity) || 0;
      this.lastAirState.height = Number(riderState.height ?? riderState.y) || 0;
      this.lastAirState.airborne = Boolean(riderState.airborne);
      for (const key of TRAIL_OBJECT_KEYS) {
        this.lastAirState[key] = riderState[key] ?? null;
      }
      for (const key of TRAIL_NUMBER_KEYS) {
        this.lastAirState[key] = Number(riderState[key]) || 0;
      }
      this.lastAirState.aerialBackflip = Boolean(riderState.aerialBackflip);
      this.lastAirState.severeCrash = Boolean(riderState.severeCrash || this.severeCrashActive);

      const turn = Math.abs(Number(riderState.turnAmount) || 0);
      const speedRatio = this.lastAirState.speedRatio;
      if (
        !this.lastAirState.airborne && !this.lastAirState.severeCrash
        && speedRatio > ARCADE_FEEDBACK.carveMinSpeedRatio
        && turn > ARCADE_FEEDBACK.carveMinTurn
      ) {
        this._carveAccumulator += step;
        const interval = 1 / (ARCADE_FEEDBACK.carveEmissionRate * this.vfxScale);
        if (this._carveAccumulator >= interval) {
          this._carveAccumulator %= interval;
          this.impact.carve({
            position: riderState.contactPosition || this.lastAirState.position,
            velocity: riderState.velocity,
            normal: riderState.normal || riderState.surfaceNormal,
            intensity: THREE.MathUtils.clamp(
              speedRatio * turn * Math.min(1.25, Number(riderState.contactForce) || 1), 0, 1,
            ),
          });
        }
      } else this._carveAccumulator = 0;
    }

    this.speedTrail.update(step, this.lastAirState);
  }

  onEvent(event) {
    return this.handleEvent(event);
  }

  reset() {
    this.contactGate.clear();
    this.impact.reset();
    this.speedTrail.reset();
    this.severeCrashActive = false;
    this._carveAccumulator = 0;
    this.lastAirState.airborne = false;
    this.lastAirState.severeCrash = false;
    this.lastAirState.speedRatio = 0;
  }

  dispose() {
    this._unsubscribeQuality?.();
    this._unsubscribeQuality = null;
    this.impact.dispose();
    this.speedTrail.dispose();
  }
}
