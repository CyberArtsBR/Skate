import * as THREE from 'three';
import { ImpactVFX as ImpactVFXCore } from './ImpactVFXCore.js';
import { ParticlePool } from './ParticlePool.js';
import { createSoftParticleMaterial } from './ParticleMaterials.js';

function setVector(target, value) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.set(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
  if (value && typeof value === 'object') return target.set(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
  return target.set(0, 0, 0);
}

/** Phase 6 adds a separate accent pool; physical-contact sparks remain metal-only. */
export class ImpactVFX extends ImpactVFXCore {
  constructor(scene, options = {}) {
    super(scene, options);
    this._accentPosition = new THREE.Vector3();
    this._accentVelocity = new THREE.Vector3();
    this.accent = new ParticlePool(scene, {
      capacity: 28,
      name: 'halfpipe-vfx-trick-accent',
      geometry: new THREE.PlaneGeometry(1, 0.12),
      orientToVelocity: true,
      material: createSoftParticleMaterial({ kind: 'stroke', color: 0x7ee8ff, opacity: 0.5 }),
    });
    this.accent.ownsGeometry = true;
    this.accent.ownsMaterial = true;
  }

  celebration({ position, velocity, intensity = 0.5, color = 0x7ee8ff } = {}) {
    if (this.reducedMotion && Number(intensity) < 0.7) return;
    setVector(this._accentPosition, position);
    const strength = THREE.MathUtils.clamp(Number(intensity) || 0.5, 0.15, 1);
    const motionScale = this.reducedMotion ? 0.25 : this.scale;
    const count = Math.max(2, Math.round((3 + strength * 7) * motionScale));
    const baseVelocity = setVector(this._accentVelocity, velocity).multiplyScalar(0.025);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + strength * 0.7;
      const radial = 0.45 + strength * 0.9 + (i % 3) * 0.08;
      const emitted = baseVelocity.clone().add(new THREE.Vector3(
        Math.cos(angle) * radial,
        0.38 + strength * 0.72 + (i % 2) * 0.16,
        Math.sin(angle) * radial * 0.45,
      ));
      this.accent.emit({
        position: this._accentPosition,
        velocity: emitted,
        lifetime: this.reducedMotion ? 0.10 : 0.16 + (i % 4) * 0.025,
        startSize: 0.055 + strength * 0.045,
        endSize: 0.012,
        drag: 4.2,
        gravity: -2.1,
        color,
      });
    }
  }

  reset() {
    super.reset();
    this.accent.clear();
  }

  update(dt) {
    super.update(dt);
    this.accent.update(dt);
  }

  dispose() {
    super.dispose();
    this.accent.dispose();
  }
}
