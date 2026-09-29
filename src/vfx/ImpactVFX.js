import * as THREE from 'three';
import { ParticlePool } from './ParticlePool.js';

const DEFAULT_POSITION = Object.freeze([0, 0, 0]);
const DEFAULT_NORMAL = Object.freeze([0, 1, 0]);

function normalizedRating(value) {
  return String(value || 'CLEAN').trim().toUpperCase();
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function setVector(target, value, fallback) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.set(
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  );
  if (value && typeof value === 'object') return target.set(
    finite(value.x, fallback[0]),
    finite(value.y, fallback[1]),
    finite(value.z, fallback[2]),
  );
  return target.set(fallback[0], fallback[1], fallback[2]);
}

export class ImpactVFX {
  constructor(scene, { reducedMotion = false } = {}) {
    this.reducedMotion = Boolean(reducedMotion);
    this._position = new THREE.Vector3();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._velocity = new THREE.Vector3();
    this._emitVelocity = new THREE.Vector3();

    this.dust = new ParticlePool(scene, {
      capacity: 42,
      name: 'halfpipe-vfx-dust',
      geometry: new THREE.CircleGeometry(1, 6),
      material: new THREE.MeshBasicMaterial({
        color: 0xcfc6b2,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        toneMapped: true,
      }),
    });
    this.dust.ownsGeometry = true;
    this.dust.ownsMaterial = true;

    this.sparks = new ParticlePool(scene, {
      capacity: 20,
      name: 'halfpipe-vfx-sparks',
      geometry: new THREE.PlaneGeometry(1, 0.16),
      material: new THREE.MeshBasicMaterial({
        color: 0xffd28a,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        toneMapped: false,
      }),
      orientToVelocity: true,
    });
    this.sparks.ownsGeometry = true;
    this.sparks.ownsMaterial = true;

    this.debris = new ParticlePool(scene, {
      capacity: 20,
      name: 'halfpipe-vfx-debris',
      geometry: new THREE.BoxGeometry(0.12, 0.05, 0.04),
      material: new THREE.MeshBasicMaterial({
        color: 0x8c7560,
        transparent: true,
        opacity: 0.7,
        depthWrite: true,
        toneMapped: true,
      }),
    });
    this.debris.ownsGeometry = true;
    this.debris.ownsMaterial = true;

    this.flash = new ParticlePool(scene, {
      capacity: 8,
      name: 'halfpipe-vfx-contact-flash',
      geometry: new THREE.CircleGeometry(1, 8),
      material: new THREE.MeshBasicMaterial({
        color: 0xfff1cb,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    });
    this.flash.ownsGeometry = true;
    this.flash.ownsMaterial = true;
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
  }

  pump({ position, velocity, rating = 'GOOD' } = {}) {
    const pos = setVector(this._position, position, DEFAULT_POSITION);
    const vel = setVector(this._velocity, velocity, DEFAULT_POSITION);
    const perfect = normalizedRating(rating) === 'PERFECT';
    const count = this.reducedMotion ? 1 : perfect ? 3 : 2;
    const baseSpeed = perfect ? 1.4 : 0.9;

    for (let index = 0; index < count; index += 1) {
      const sign = index % 2 === 0 ? 1 : -1;
      this._emitVelocity.set(
        vel.x * 0.04 + sign * (0.22 + index * 0.05),
        0.34 + baseSpeed * 0.12 + index * 0.08,
        sign * 0.05,
      );
      this.dust.emit({
        position: pos,
        velocity: this._emitVelocity,
        lifetime: perfect ? 0.18 : 0.14,
        startSize: perfect ? 0.085 : 0.06,
        endSize: 0.12,
        drag: 5,
        gravity: -1.4,
        color: perfect ? 0xe6dcc7 : 0xcfc6b2,
      });
    }
  }

  copingContact({ position, normal, velocity } = {}) {
    const pos = setVector(this._position, position, DEFAULT_POSITION);
    const n = setVector(this._normal, normal, DEFAULT_NORMAL).normalize();
    const vel = setVector(this._velocity, velocity, DEFAULT_POSITION);
    const sparkCount = this.reducedMotion ? 1 : 3;

    this.flash.emit({
      position: pos,
      velocity: DEFAULT_POSITION,
      lifetime: 0.075,
      startSize: 0.11,
      endSize: 0.02,
      color: 0xffefc2,
    });

    for (let index = 0; index < sparkCount; index += 1) {
      const spread = index - (sparkCount - 1) * 0.5;
      this._emitVelocity.copy(n).multiplyScalar(1.8 + index * 0.25);
      this._emitVelocity.x += vel.x * 0.08 + spread * 0.55;
      this._emitVelocity.y += Math.abs(vel.y) * 0.04 + 0.2;
      this._emitVelocity.z += spread * 0.18;
      this.sparks.emit({
        position: pos,
        velocity: this._emitVelocity,
        lifetime: 0.10 + index * 0.015,
        startSize: 0.08,
        endSize: 0.015,
        drag: 3.5,
        gravity: -6,
        color: 0xffc568,
      });
    }
  }

  takeoff({ position, velocity } = {}) {
    const pos = setVector(this._position, position, DEFAULT_POSITION);
    const vel = setVector(this._velocity, velocity, DEFAULT_POSITION);
    const count = this.reducedMotion ? 2 : 5;

    for (let index = 0; index < count; index += 1) {
      const spread = index - (count - 1) * 0.5;
      this._emitVelocity.set(
        vel.x * 0.05 + spread * 0.18,
        0.55 + index * 0.07,
        spread * 0.07,
      );
      this.dust.emit({
        position: pos,
        velocity: this._emitVelocity,
        lifetime: 0.18 + index * 0.012,
        startSize: 0.07,
        endSize: 0.16,
        drag: 4.5,
        gravity: -2.8,
        color: 0xd8cfbb,
      });
    }
  }

  landing({ position, velocity, rating = 'CLEAN' } = {}) {
    const type = normalizedRating(rating);
    const pos = setVector(this._position, position, DEFAULT_POSITION);
    const vel = setVector(this._velocity, velocity, DEFAULT_POSITION);
    const profiles = {
      PERFECT: { dust: 2, debris: 0, burst: 0.06, asymmetry: 0 },
      CLEAN: { dust: 4, debris: 0, burst: 0.08, asymmetry: 0 },
      SKETCHY: { dust: 6, debris: 1, burst: 0.10, asymmetry: 0.75 },
      HEAVY: { dust: 8, debris: 2, burst: 0.13, asymmetry: 0.35 },
      BAIL: { dust: 10, debris: 4, burst: 0.16, asymmetry: 0.6 },
    };
    const profile = profiles[type] || profiles.CLEAN;
    const motionScale = this.reducedMotion ? 0.45 : 1;
    const dustCount = Math.max(1, Math.round(profile.dust * motionScale));
    const debrisCount = Math.round(profile.debris * motionScale);

    this.flash.emit({
      position: pos,
      velocity: DEFAULT_POSITION,
      lifetime: type === 'PERFECT' ? 0.065 : 0.09,
      startSize: profile.burst,
      endSize: 0.025,
      color: type === 'PERFECT' ? 0xf7f0de : 0xe9dfc8,
    });

    for (let index = 0; index < dustCount; index += 1) {
      const centered = index - (dustCount - 1) * 0.5;
      const sideBias = profile.asymmetry && index % 2 === 0 ? profile.asymmetry : 0;
      this._emitVelocity.set(
        centered * 0.22 + sideBias + vel.x * 0.025,
        0.38 + (index % 3) * 0.14,
        ((index % 2) * 2 - 1) * 0.10,
      );
      this.dust.emit({
        position: pos,
        velocity: this._emitVelocity,
        lifetime: 0.22 + (index % 3) * 0.025,
        startSize: type === 'HEAVY' || type === 'BAIL' ? 0.09 : 0.065,
        endSize: type === 'HEAVY' || type === 'BAIL' ? 0.19 : 0.14,
        drag: 4,
        gravity: -3.2,
        color: 0xcabfa9,
      });
    }

    for (let index = 0; index < debrisCount; index += 1) {
      const sign = index % 2 === 0 ? 1 : -1;
      this._emitVelocity.set(
        sign * (0.7 + index * 0.14) + vel.x * 0.04,
        0.8 + index * 0.16,
        sign * 0.25,
      );
      this.debris.emit({
        position: pos,
        velocity: this._emitVelocity,
        lifetime: 0.28 + index * 0.035,
        startSize: 0.11,
        endSize: 0.055,
        drag: 1.5,
        gravity: -7.5,
        angularVelocity: sign * 8,
        color: 0x8d7863,
      });
    }
  }

  crash(payload = {}) {
    this.landing({ ...payload, rating: 'BAIL' });
  }

  update(dt) {
    this.dust.update(dt);
    this.sparks.update(dt);
    this.debris.update(dt);
    this.flash.update(dt);
  }

  dispose() {
    this.dust.dispose();
    this.sparks.dispose();
    this.debris.dispose();
    this.flash.dispose();
  }
}
