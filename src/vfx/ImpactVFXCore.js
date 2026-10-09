import * as THREE from 'three';
import { ParticlePool } from './ParticlePool.js';
import { createSoftParticleMaterial } from './ParticleMaterials.js';

const ZERO = Object.freeze([0, 0, 0]);
const UP = Object.freeze([0, 1, 0]);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function setVector(target, value, fallback = ZERO) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.set(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  if (value && typeof value === 'object') return target.set(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
  return target.fromArray(fallback);
}

export class ImpactVFX {
  constructor(scene, { reducedMotion = false, scale = 1 } = {}) {
    this.reducedMotion = Boolean(reducedMotion);
    this.scale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 1.25);
    this._position = new THREE.Vector3();
    this._normal = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._emitVelocity = new THREE.Vector3();
    this._surfaceTangent = new THREE.Vector3();
    this._surfaceRotation = new THREE.Quaternion();
    this.dust = new ParticlePool(scene, { capacity: 42, name: 'halfpipe-vfx-contact-dust',
      geometry: new THREE.PlaneGeometry(1, 1),
      material: createSoftParticleMaterial({ kind: 'dust', color: 0xcfc6b2, opacity: 0.24 }) });
    this.sparks = new ParticlePool(scene, { capacity: 16, name: 'halfpipe-vfx-metal-sparks',
      geometry: new THREE.PlaneGeometry(1, 0.14), orientToVelocity: true,
      material: createSoftParticleMaterial({ kind: 'stroke', color: 0xffd28a, opacity: 0.6 }) });
    this.flash = new ParticlePool(scene, { capacity: 8, name: 'halfpipe-vfx-contact-flash',
      geometry: new THREE.PlaneGeometry(1, 1),
      material: createSoftParticleMaterial({ kind: 'flash', color: 0xfff1cb, opacity: 0.42 }) });
    for (const pool of [this.dust, this.sparks, this.flash]) {
      pool.ownsGeometry = true;
      pool.ownsMaterial = true;
    }
  }

  setReducedMotion(enabled) { this.reducedMotion = Boolean(enabled); }
  setScale(scale) { this.scale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 1.25); }

  _contact({ position, velocity, normal } = {}) {
    setVector(this._position, position);
    setVector(this._normal, normal, UP).normalize();
    if (this._normal.lengthSq() < 0.5) this._normal.set(0, 1, 0);
    setVector(this._velocity, velocity);
    this._position.addScaledVector(this._normal, 0.02);
    this._surfaceTangent.set(-this._normal.y, this._normal.x, 0).normalize();
    this._surfaceRotation.setFromUnitVectors(Z_AXIS, this._normal);
  }

  _dustPuffs(count, intensity = 0.5) {
    const motionScale = this.reducedMotion ? 0.35 : this.scale;
    const amount = Math.max(1, Math.round(count * motionScale));
    for (let i = 0; i < amount; i++) {
      const spread = i - (amount - 1) * 0.5;
      this._emitVelocity.copy(this._velocity).multiplyScalar(0.025)
        .addScaledVector(this._normal, 0.2 + intensity * 0.22 + (i % 2) * 0.08)
        .addScaledVector(this._surfaceTangent, spread * 0.18);
      this._emitVelocity.z += (i % 2 ? -1 : 1) * 0.055;
      this.dust.emit({ position: this._position, velocity: this._emitVelocity,
        lifetime: this.reducedMotion ? 0.12 : 0.19 + (i % 3) * 0.025,
        startSize: 0.04 + intensity * 0.04, endSize: 0.13 + intensity * 0.06,
        drag: 5, gravity: -0.75, color: 0xd0c4ab });
    }
  }

  pump(payload = {}) {
    this._contact(payload);
    this._dustPuffs(1, 0.12);
  }

  copingContact(payload = {}) {
    this._contact(payload);
    const hand = payload.contactKind === 'hand';
    this.flash.emit({ position: this._position, quaternion: this._surfaceRotation,
      lifetime: hand ? 0.055 : 0.07, startSize: hand ? 0.055 : 0.10, endSize: 0.02,
      color: hand ? 0xe8debd : 0xffe5b3 });
    // Hands, deck wood and urethane never throw metal sparks.
    if (payload.contactKind !== 'metal' || this.reducedMotion) return;
    for (let i = 0; i < Math.max(1, Math.round(2 * this.scale)); i++) {
      this._emitVelocity.copy(this._normal).multiplyScalar(0.7 + i * 0.12)
        .addScaledVector(this._surfaceTangent, (i ? -1 : 1) * 0.8)
        .addScaledVector(this._velocity, 0.04);
      this.sparks.emit({ position: this._position, velocity: this._emitVelocity,
        lifetime: 0.095 + i * 0.01, startSize: 0.09, endSize: 0.02,
        drag: 4, gravity: -3, color: 0xffc878 });
    }
  }

  takeoff(payload = {}) {
    this._contact(payload);
    this._dustPuffs(2, 0.25);
  }

  landing(payload = {}) {
    this._contact(payload);
    const rating = String(payload.rating || 'CLEAN').toUpperCase();
    const count = { PERFECT: 2, CLEAN: 3, SKETCHY: 4, HEAVY: 5, BAIL: 4 }[rating] || 3;
    const impact = THREE.MathUtils.clamp(Number(payload.impactIntensity
      ?? (Number(payload.impact ?? 8) / 20)), 0.15, 1);
    this._dustPuffs(count, impact);
    this.flash.emit({ position: this._position, quaternion: this._surfaceRotation,
      lifetime: 0.065, startSize: 0.04 + impact * 0.055, endSize: 0.02, color: 0xf0e2c5 });
  }

  crash(payload = {}) { this.landing({ ...payload, rating: 'BAIL' }); }

  carve(payload = {}) {
    this._contact(payload);
    this._dustPuffs(1, THREE.MathUtils.clamp(Number(payload.intensity) || 0.4, 0, 1) * 0.2);
  }

  reset() { for (const pool of [this.dust, this.sparks, this.flash]) pool.clear(); }
  update(dt) { for (const pool of [this.dust, this.sparks, this.flash]) pool.update(dt); }
  dispose() { for (const pool of [this.dust, this.sparks, this.flash]) pool.dispose(); }
}
