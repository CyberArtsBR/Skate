import * as THREE from 'three';
import { ParticlePool } from './ParticlePool.js';
import { ARCADE_FEEDBACK } from './ArcadeFeedbackTuning.js';
import { createSoftParticleMaterial, createTaperedArcGeometry } from './ParticleMaterials.js';

const ZERO = Object.freeze([0, 0, 0]);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

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
    this._position = new THREE.Vector3();
    this._velocity = new THREE.Vector3();
    this._emitVelocity = new THREE.Vector3();
    this._previousPosition = new THREE.Vector3();
    this._rotationPosition = new THREE.Vector3();
    this._rotationTangent = new THREE.Vector3();
    this._boardQuaternion = new THREE.Quaternion();
    this._hasPreviousPosition = false;
    this._previousFlipDegrees = 0;
    this._previousAerialDegrees = 0;
    this.rotationAccumulator = 0;

    this.pool = new ParticlePool(scene, {
      capacity: ARCADE_FEEDBACK.trajectoryCapacity,
      name: 'halfpipe-vfx-speed-trails',
      geometry: new THREE.PlaneGeometry(1, 0.14),
      material: createSoftParticleMaterial({ kind: 'stroke', opacity: 0.42 }),
      orientToVelocity: true,
    });
    this.pool.ownsGeometry = true;
    this.pool.ownsMaterial = true;
    this.pool.mesh.renderOrder = 4;
    this.arcPool = new ParticlePool(scene, {
      capacity: 16, name: 'halfpipe-vfx-air-wind-arcs',
      geometry: createTaperedArcGeometry(),
      material: createSoftParticleMaterial({ kind: 'stroke', opacity: 0.36 }),
    });
    this.arcPool.ownsGeometry = true;
    this.arcPool.ownsMaterial = true;
    this.arcPool.mesh.renderOrder = 4;
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
    this._emitVelocity.copy(vel).multiplyScalar(-0.8);
    this.pool.emit({
      position: pos,
      velocity: this._emitVelocity,
      lifetime: 0.11,
      startSize: (0.35 + THREE.MathUtils.clamp(Number(intensity) || 0, 0, 1) * 0.18)
        * THREE.MathUtils.lerp(0.85, 1.06, this.scale / 1.25),
      endSize: 0.05,
      aspect: 3.2,
      drag: 6,
      color: 0xdce5e8,
    });
  }

  update(dt, {
    position = ZERO,
    verticalVelocity = 0,
    height = 0,
    airborne = false,
    velocity = null,
    speedRatio = 0,
    boardQuaternion = null,
    backflipRotationDegrees = 0,
    aerialRotationDegrees = 0,
    trickType = '',
    aerialBackflip = false,
    severeCrash = false,
  } = {}) {
    const step = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    this.pool.update(step);
    this.arcPool.update(step);
    const pos = setVector(this._position, position);
    if (velocity) setVector(this._velocity, velocity);
    else if (this._hasPreviousPosition && step > 0) {
      this._velocity.copy(pos).sub(this._previousPosition).divideScalar(step);
    } else this._velocity.set(0, Number(verticalVelocity) || 0, 0);
    this._previousPosition.copy(pos);
    this._hasPreviousPosition = true;

    const flipDegrees = Number(backflipRotationDegrees) || 0;
    const aerialDegrees = Number(aerialRotationDegrees) || 0;
    const flipDelta = flipDegrees - this._previousFlipDegrees;
    const aerialDelta = aerialDegrees - this._previousAerialDegrees;
    this._previousFlipDegrees = flipDegrees;
    this._previousAerialDegrees = aerialDegrees;
    if (this.reducedMotion || !airborne || severeCrash || step <= 0) {
      this.rotationAccumulator = 0;
      return;
    }

    // Straight airtime has no wind streaks. Only actual trick rotation emits
    // the existing rotation traces and crescents below.
    const flipping = String(trickType).toLowerCase().includes('backflip') || aerialBackflip;
    const rotationDelta = flipping ? flipDelta : aerialDelta;
    // A reset/completed revolution must not emit a spurious full-circle arc.
    if (Math.abs(rotationDelta) < 1 || Math.abs(rotationDelta) > 150) return;
    this.rotationAccumulator += Math.abs(rotationDelta);
    if (this.rotationAccumulator < 24 / this.scale) return;
    this.rotationAccumulator %= 24 / this.scale;
    if (boardQuaternion?.isQuaternion) this._boardQuaternion.copy(boardQuaternion);
    else if (Array.isArray(boardQuaternion)) this._boardQuaternion.fromArray(boardQuaternion);
    else this._boardQuaternion.setFromAxisAngle(
      Z_AXIS, THREE.MathUtils.degToRad(flipDegrees),
    );
    this._rotationPosition.set(flipping ? 0 : 0.48, 0.85, -0.28)
      .applyQuaternion(this._boardQuaternion).add(pos);
    this._rotationTangent.set(0.85, flipping ? 0 : 0.12, flipping ? 0 : 0.48)
      .applyQuaternion(this._boardQuaternion).multiplyScalar(Math.sign(rotationDelta));
    this._emitVelocity.copy(this._rotationTangent).multiplyScalar(-0.18);
    this.pool.emit({
      position: this._rotationPosition, velocity: this._emitVelocity,
      rotation: Math.atan2(this._rotationTangent.y, this._rotationTangent.x),
      lifetime: aerialBackflip ? 0.42 : 0.36,
      startSize: 0.85, endSize: 0.04, drag: 4,
      color: aerialBackflip ? 0xffe5a8 : 0xc6f4ff,
    });
    // Camera-facing crescent follows real rotation progress, with an airborne
    // lifetime and real world position rather than a persistent HUD sticker.
    this._rotationPosition.copy(pos);
    this._rotationPosition.y += 0.55;
    this._rotationPosition.z += 0.26;
    this.arcPool.emit({ position: this._rotationPosition,
      rotation: THREE.MathUtils.degToRad(flipping ? flipDegrees : aerialDegrees),
      lifetime: 0.3, startSize: flipping ? 0.95 : 1.12, endSize: 0.35,
      color: aerialBackflip ? 0xffdf9b : flipping ? 0xd5f9ff : 0x90e8f5 });
  }

  reset() {
    this.pool.clear();
    this.arcPool.clear();
    this.rotationAccumulator = 0;
    this.comboBoost = 0;
    this._hasPreviousPosition = false;
    this._previousFlipDegrees = 0;
    this._previousAerialDegrees = 0;
  }

  dispose() {
    this.pool.dispose();
    this.arcPool.dispose();
  }
}
