import * as THREE from 'three';
import { ParticlePool } from './ParticlePool.js';

const ZERO = Object.freeze([0, 0, 0]);

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function setVector(target, value) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.set(
    finite(value[0]),
    finite(value[1]),
    finite(value[2]),
  );
  if (value && typeof value === 'object') return target.set(
    finite(value.x),
    finite(value.y),
    finite(value.z),
  );
  return target.set(0, 0, 0);
}

export class SpeedTrailVFX {
  constructor(scene, { reducedMotion = false, scale = 1 } = {}) {
    this.reducedMotion = Boolean(reducedMotion);
    this.scale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 1.25);
    this.comboBoost = 0;
    this.emitAccumulator = 0;
    this._position = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._emitVelocity = new THREE.Vector3();

    this.pool = new ParticlePool(scene, {
      capacity: 20,
      name: 'halfpipe-vfx-speed-trails',
      geometry: new THREE.PlaneGeometry(1, 0.04),
      material: new THREE.MeshBasicMaterial({
        color: 0xdde8ee,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: true,
      }),
      orientToVelocity: true,
    });
    this.pool.ownsGeometry = true;
    this.pool.ownsMaterial = true;
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    if (this.reducedMotion) this.comboBoost *= 0.35;
  }

  setScale(scale) {
    this.scale = THREE.MathUtils.clamp(Number(scale) || 1, 0.35, 1.25);
    return this.scale;
  }

  setCombo(value) {
    const numeric = Math.max(0, Number(value) || 0);
    this.comboBoost = THREE.MathUtils.clamp(numeric / 8, 0, 0.35);
  }

  pulse({ position, velocity, intensity = 0.5 } = {}) {
    if (this.reducedMotion || this.scale < 0.5) return;
    const pos = setVector(this._position, position);
    const vel = setVector(this._velocity, velocity);
    if (vel.lengthSq() < 0.01) vel.set(0, 1, 0);
    vel.normalize();
    this._emitVelocity.copy(vel).multiplyScalar(-0.72);
    this.pool.emit({
      position: pos,
      velocity: this._emitVelocity,
      lifetime: 0.095,
      startSize: (0.30 + THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1) * 0.14)
        * THREE.MathUtils.lerp(0.84, 1.04, this.scale / 1.25),
      endSize: 0.045,
      aspect: 3.0,
      drag: 6.5,
      color: 0xdce5e8,
    });
  }

  update(dt, {
    position = ZERO,
    verticalVelocity = 0,
    height = 0,
    airborne = false,
  } = {}) {
    const step = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    this.pool.update(step);
    if (this.reducedMotion || !airborne || step <= 0) return;

    const speed = Math.abs(Number(verticalVelocity) || 0);
    const verticalGate = THREE.MathUtils.smoothstep(speed, 10.5, 18);
    const heightGate = THREE.MathUtils.smoothstep(Number(height) || 0, 8.8, 12.5);
    const intensity = Math.max(verticalGate, heightGate) + this.comboBoost;

    // V19 art direction: continuous trails are reserved for exceptional air
    // or an active combo. Ordinary launches keep only the very short pulse.
    const exceptionalAir = heightGate > 0.34 || verticalGate > 0.58 || this.comboBoost > 0.11;
    if (!exceptionalAir || intensity < 0.52) return;

    const baseInterval = THREE.MathUtils.lerp(
      0.13,
      0.075,
      THREE.MathUtils.clamp(intensity, 0, 1),
    );
    const interval = baseInterval / THREE.MathUtils.clamp(this.scale, 0.55, 1.15);
    this.emitAccumulator += step;
    if (this.emitAccumulator < interval) return;
    this.emitAccumulator %= interval;

    const pos = setVector(this._position, position);
    const sign = verticalVelocity >= 0 ? -1 : 1;
    this._emitVelocity.set(0, sign * 0.38, 0);
    this.pool.emit({
      position: pos,
      velocity: this._emitVelocity,
      lifetime: 0.11,
      startSize: THREE.MathUtils.lerp(0.28, 0.43, THREE.MathUtils.clamp(intensity, 0, 1)),
      endSize: 0.05,
      aspect: 3.4,
      drag: 7.5,
      color: 0xd8e2e5,
    });
  }

  dispose() {
    this.pool.dispose();
  }
}
