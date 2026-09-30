import * as THREE from 'three';
import { ImpactVFX } from './ImpactVFX.js';
import { SpeedTrailVFX } from './SpeedTrailVFX.js';
import { quality } from '../graphics/RenderQualityManager.js';

const LANDING_IMPACTS = Object.freeze({
  PERFECT: Object.freeze({ strength: 0.005, duration: 0.08 }),
  CLEAN: Object.freeze({ strength: 0.018, duration: 0.11 }),
  SKETCHY: Object.freeze({ strength: 0.055, duration: 0.16 }),
  HEAVY: Object.freeze({ strength: 0.105, duration: 0.22 }),
  BAIL: Object.freeze({ strength: 0.19, duration: 0.32 }),
});

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
    };
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
            rating: ratingOf(event, 'GOOD'),
          });
          this.speedTrail.pulse({
            position,
            velocity,
            intensity: ratingOf(event, 'GOOD') === 'PERFECT' ? 0.75 : 0.42,
          });
        }
        break;
      }

      case 'COPING_HIT': {
        if (position) {
          this.impact.copingContact({
            position,
            normal,
            velocity,
          });
        }
        break;
      }

      case 'TAKEOFF': {
        if (position) {
          this.impact.takeoff({ position, velocity });
          this.speedTrail.pulse({
            position,
            velocity,
            intensity: 0.48,
          });
        }
        break;
      }

      case 'TRICK_COMPLETED': {
        const trick = String(event.trick || event.trickType || '').toLowerCase();
        if (trick === 'hand-plant' && event.handContactPosition) {
          this.impact.copingContact({
            position: event.handContactPosition,
            normal,
            velocity,
          });
        }
        break;
      }

      case 'LANDING': {
        const rating = ratingOf(event);
        if (position) {
          this.impact.landing({
            position,
            velocity,
            rating,
          });
        }
        cameraImpact = LANDING_IMPACTS[rating] || LANDING_IMPACTS.CLEAN;
        break;
      }

      case 'BAIL': {
        if (position) {
          this.impact.crash({ position, velocity });
        }
        cameraImpact = LANDING_IMPACTS.BAIL;
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
    }

    this.speedTrail.update(step, this.lastAirState);
  }

  dispose() {
    this._unsubscribeQuality?.();
    this._unsubscribeQuality = null;
    this.impact.dispose();
    this.speedTrail.dispose();
  }
}
