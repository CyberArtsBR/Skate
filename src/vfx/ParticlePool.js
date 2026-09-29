import * as THREE from 'three';

const HIDDEN_SCALE = 0.00001;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function setVector(target, value, fallbackX = 0, fallbackY = 0, fallbackZ = 0) {
  if (value?.isVector3) {
    target.copy(value);
    return target;
  }
  if (Array.isArray(value)) {
    target.set(
      finite(value[0], fallbackX),
      finite(value[1], fallbackY),
      finite(value[2], fallbackZ),
    );
    return target;
  }
  if (value && typeof value === 'object') {
    target.set(
      finite(value.x, fallbackX),
      finite(value.y, fallbackY),
      finite(value.z, fallbackZ),
    );
    return target;
  }
  target.set(fallbackX, fallbackY, fallbackZ);
  return target;
}

export class ParticlePool {
  constructor(scene, {
    capacity = 32,
    geometry = null,
    material = null,
    name = 'particle-pool',
    orientToVelocity = false,
  } = {}) {
    if (!scene?.add) throw new TypeError('ParticlePool requires a THREE.Scene-like parent');

    this.capacity = Math.max(1, Math.floor(capacity));
    this.geometry = geometry || new THREE.PlaneGeometry(1, 1);
    this.material = material || new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      toneMapped: false,
    });
    this.ownsGeometry = !geometry;
    this.ownsMaterial = !material;
    this.orientToVelocity = Boolean(orientToVelocity);
    this.cursor = 0;
    this.activeCount = 0;
    this.disposed = false;

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._scratch = new THREE.Object3D();
    this._scratchScale = new THREE.Vector3();
    this._states = Array.from({ length: this.capacity }, () => ({
      active: false,
      age: 0,
      lifetime: 0,
      startSize: 0,
      endSize: 0,
      aspect: 1,
      drag: 0,
      gravity: 0,
      rotation: 0,
      angularVelocity: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: new THREE.Color(0xffffff),
    }));

    for (let index = 0; index < this.capacity; index += 1) {
      this._hideInstance(index);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this.parent = scene;
  }

  emit({
    position,
    velocity,
    lifetime = 0.25,
    startSize = 0.08,
    endSize = 0,
    aspect = 1,
    drag = 0,
    gravity = 0,
    rotation = 0,
    angularVelocity = 0,
    color = 0xffffff,
  } = {}) {
    if (this.disposed) return false;

    const index = this._claimIndex();
    const state = this._states[index];
    state.active = true;
    state.age = 0;
    state.lifetime = Math.max(0.016, Number(lifetime) || 0.25);
    state.startSize = Math.max(0, Number(startSize) || 0);
    state.endSize = Math.max(0, Number(endSize) || 0);
    state.aspect = Math.max(0.02, Number(aspect) || 1);
    state.drag = Math.max(0, Number(drag) || 0);
    state.gravity = Number(gravity) || 0;
    state.rotation = Number(rotation) || 0;
    state.angularVelocity = Number(angularVelocity) || 0;
    setVector(state.position, position);
    setVector(state.velocity, velocity);
    state.color.set(color);

    this._writeInstance(index, state, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  update(dt) {
    if (this.disposed || this.activeCount === 0) return;
    const step = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    if (step <= 0) return;

    for (let index = 0; index < this.capacity; index += 1) {
      const state = this._states[index];
      if (!state.active) continue;

      state.age += step;
      if (state.age >= state.lifetime) {
        state.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this._hideInstance(index);
        continue;
      }

      const dragFactor = 1 / (1 + state.drag * step);
      state.velocity.multiplyScalar(dragFactor);
      state.velocity.y += state.gravity * step;
      state.position.addScaledVector(state.velocity, step);
      state.rotation += state.angularVelocity * step;
      this._writeInstance(index, state, state.age / state.lifetime);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    if (this.disposed) return;
    for (let index = 0; index < this.capacity; index += 1) {
      this._states[index].active = false;
      this._hideInstance(index);
    }
    this.activeCount = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.parent?.remove?.(this.mesh);
    if (this.ownsGeometry) this.geometry.dispose();
    if (this.ownsMaterial) this.material.dispose();
    this.disposed = true;
  }

  _claimIndex() {
    for (let offset = 0; offset < this.capacity; offset += 1) {
      const index = (this.cursor + offset) % this.capacity;
      if (!this._states[index].active) {
        this.cursor = (index + 1) % this.capacity;
        this.activeCount += 1;
        return index;
      }
    }

    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    return index;
  }

  _writeInstance(index, state, progress) {
    const fade = Math.pow(Math.max(0, 1 - progress), 0.7);
    const size = THREE.MathUtils.lerp(state.startSize, state.endSize, progress) * fade;

    this._scratch.position.copy(state.position);
    if (this.orientToVelocity && state.velocity.lengthSq() > 1e-6) {
      this._scratch.rotation.set(
        0,
        0,
        Math.atan2(state.velocity.y, state.velocity.x) - Math.PI * 0.5,
      );
    } else {
      this._scratch.rotation.set(0, 0, state.rotation);
    }
    this._scratchScale.set(
      Math.max(HIDDEN_SCALE, size * state.aspect),
      Math.max(HIDDEN_SCALE, size),
      Math.max(HIDDEN_SCALE, size),
    );
    this._scratch.scale.copy(this._scratchScale);
    this._scratch.updateMatrix();
    this.mesh.setMatrixAt(index, this._scratch.matrix);
    this.mesh.setColorAt(index, state.color);
  }

  _hideInstance(index) {
    this._scratch.position.set(0, -9999, 0);
    this._scratch.rotation.set(0, 0, 0);
    this._scratch.scale.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
    this._scratch.updateMatrix();
    this.mesh.setMatrixAt(index, this._scratch.matrix);
  }
}
