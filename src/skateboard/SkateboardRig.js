import * as THREE from 'three';

const REQUIRED_WHEEL_SEMANTICS = Object.freeze([
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
]);
const AXLE_AXIS = new THREE.Vector3(0, 0, 1);
const TWO_PI = Math.PI * 2;
const MATRIX_EPSILON = 1e-5;

function wrapAngle(angle) {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, TWO_PI) - Math.PI;
}

function matrixMaxDelta(a, b) {
  let maxDelta = 0;
  for (let index = 0; index < 16; index += 1) {
    maxDelta = Math.max(maxDelta, Math.abs(a.elements[index] - b.elements[index]));
  }
  return maxDelta;
}

export class SkateboardRig {
  constructor({ root, wheelDescriptors = [] }) {
    this.root = root;
    this.wheelDescriptors = wheelDescriptors;
    this.wheels = Object.fromEntries(REQUIRED_WHEEL_SEMANTICS.map((name) => [name, null]));
    this.travelDistance = 0;
    this.isComplete = false;
    this.buildReport = [];
  }

  build() {
    this.root.updateWorldMatrix(true, true);

    for (const descriptor of this.wheelDescriptors) {
      if (
        !descriptor.semantic
        || !descriptor.mesh
        || !descriptor.axleAxisVerified
        || !Number.isFinite(descriptor.radius)
        || descriptor.radius <= 1e-6
      ) continue;

      const mesh = descriptor.mesh;
      const originalParent = mesh.parent;
      if (!originalParent) continue;

      mesh.updateWorldMatrix(true, false);
      const beforeWorld = mesh.matrixWorld.clone();

      const pivot = new THREE.Group();
      pivot.name = 'skateboard-' + descriptor.semantic + '-spin-pivot';
      pivot.position.copy(descriptor.center);
      pivot.userData.semantic = descriptor.semantic;
      pivot.userData.presentationOnly = true;
      pivot.userData.axleAxis = '+Z';
      pivot.userData.radius = descriptor.radius;
      this.root.add(pivot);
      pivot.updateWorldMatrix(true, false);
      pivot.attach(mesh);
      this.root.updateWorldMatrix(true, true);

      const afterWorld = mesh.matrixWorld.clone();
      const worldTransformDelta = matrixMaxDelta(beforeWorld, afterWorld);
      const transformPreserved = worldTransformDelta <= MATRIX_EPSILON;

      if (!transformPreserved) {
        originalParent.attach(mesh);
        pivot.removeFromParent();
        this.buildReport.push({
          semantic: descriptor.semantic,
          safe: false,
          reason: 'world-transform-preservation-failed',
          worldTransformDelta,
        });
        continue;
      }

      const wheel = {
        semantic: descriptor.semantic,
        mesh,
        pivot,
        radius: descriptor.radius,
        diameter: descriptor.diameter,
        center: descriptor.center.clone(),
        restPivotPosition: pivot.position.clone(),
        spinAngle: 0,
        worldTransformDelta,
      };
      this.wheels[descriptor.semantic] = wheel;
      this.buildReport.push({
        semantic: descriptor.semantic,
        safe: true,
        radius: descriptor.radius,
        worldTransformDelta,
      });
    }

    this.isComplete = REQUIRED_WHEEL_SEMANTICS.every((name) => Boolean(this.wheels[name]));
    return this;
  }

  setTravelDistance(distance) {
    const numericDistance = Number(distance);
    if (!this.isComplete || !Number.isFinite(numericDistance)) return false;
    this.travelDistance = numericDistance;

    for (const wheel of Object.values(this.wheels)) {
      // +X travel with a +Z axle rolls in the negative-Z angular direction.
      // Recompute from total signed distance every time instead of multiplying
      // incremental quaternions, preventing accumulated transform drift.
      wheel.spinAngle = wrapAngle(-numericDistance / wheel.radius);
      wheel.pivot.position.copy(wheel.restPivotPosition);
      wheel.pivot.quaternion.setFromAxisAngle(AXLE_AXIS, wheel.spinAngle);
      wheel.pivot.scale.set(1, 1, 1);
    }
    return true;
  }

  list() {
    return REQUIRED_WHEEL_SEMANTICS
      .map((name) => this.wheels[name])
      .filter(Boolean);
  }

  semanticRefs() {
    return { ...this.wheels };
  }

  stabilityReport() {
    return REQUIRED_WHEEL_SEMANTICS.map((semantic) => {
      const wheel = this.wheels[semantic];
      if (!wheel) return { semantic, present: false, pivotStable: false };
      return {
        semantic,
        present: true,
        pivotStable: wheel.pivot.position.distanceTo(wheel.restPivotPosition) <= 1e-8,
        parentIsRuntimeRoot: wheel.pivot.parent === this.root,
        meshParentIsPivot: wheel.mesh.parent === wheel.pivot,
        radius: wheel.radius,
        spinAngle: wheel.spinAngle,
      };
    });
  }
}
