import * as THREE from 'three';

const WHEEL_PATTERN = /pPipe(?:9|13)(?:_|$)/i;
const REQUIRED_WHEEL_SEMANTICS = Object.freeze([
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
]);

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function objectPath(object, stopAt = null) {
  const parts = [];
  let current = object;
  while (current && current !== stopAt) {
    parts.unshift(current.name || current.type || '(unnamed)');
    current = current.parent;
  }
  return '/' + parts.join('/');
}

function isDescendantOf(object, ancestor) {
  let current = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function lowestCommonAncestor(objects, stopAt = null) {
  if (!objects.length) return null;
  const firstAncestors = [];
  let current = objects[0].parent;
  while (current && current !== stopAt) {
    firstAncestors.push(current);
    current = current.parent;
  }

  return firstAncestors.find((candidate) => (
    objects.slice(1).every((object) => isDescendantOf(object, candidate))
  )) || null;
}

function copyBox(box) {
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    center: box.getCenter(new THREE.Vector3()),
    size: box.getSize(new THREE.Vector3()),
  };
}

function classifyAxleAxis(size) {
  const pairs = [
    ['x', Math.abs(size.x)],
    ['y', Math.abs(size.y)],
    ['z', Math.abs(size.z)],
  ].sort((a, b) => a[1] - b[1]);
  return pairs[0][0];
}

export class SkateboardAssetAdapter {
  constructor({ root, model, deck = null }) {
    this.root = root;
    this.model = model;
    this.deck = deck;
  }

  _discoverWheelMeshes() {
    const meshes = [];
    this.model.traverse((object) => {
      if (object.isMesh && WHEEL_PATTERN.test(object.name)) meshes.push(object);
    });
    return [...new Set(meshes)];
  }

  _measureWheel(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    const measured = copyBox(box);
    const centerRoot = this.root.worldToLocal(measured.center.clone());
    const bottomWorld = measured.center.clone();
    bottomWorld.y = measured.min.y;
    const bottomRoot = this.root.worldToLocal(bottomWorld);
    const axleAxis = classifyAxleAxis(measured.size);
    const diameter = Math.max(Math.abs(measured.size.x), Math.abs(measured.size.y));

    return {
      mesh,
      sourceName: mesh.name || '(unnamed)',
      sourcePath: objectPath(mesh, this.model.parent),
      center: centerRoot,
      bottom: bottomRoot,
      size: measured.size,
      diameter,
      radius: diameter * 0.5,
      axleAxis,
      axleAxisVerified: axleAxis === 'z',
      semantic: null,
    };
  }

  _assignWheelSemantics(wheels) {
    if (wheels.length !== 4) return wheels;

    const byForward = [...wheels].sort((a, b) => (
      b.center.x - a.center.x || b.center.z - a.center.z
    ));
    const front = byForward.slice(0, 2).sort((a, b) => b.center.z - a.center.z);
    const rear = byForward.slice(2).sort((a, b) => b.center.z - a.center.z);

    front[0].semantic = 'frontLeft';
    front[1].semantic = 'frontRight';
    rear[0].semantic = 'rearLeft';
    rear[1].semantic = 'rearRight';
    return wheels;
  }

  _truckMetadata(wheels, axle) {
    const own = wheels.filter((wheel) => wheel.semantic?.startsWith(axle));
    const other = wheels.filter((wheel) => !wheel.semantic?.startsWith(axle));
    const candidate = lowestCommonAncestor(own.map((wheel) => wheel.mesh), this.model.parent);
    const containsOtherAxle = Boolean(candidate) && other.some((wheel) => (
      isDescendantOf(wheel.mesh, candidate)
    ));

    return {
      axle,
      sourceCandidateName: candidate?.name || null,
      sourceCandidatePath: candidate ? objectPath(candidate, this.model.parent) : null,
      independentlyTransformable: Boolean(candidate) && !containsOtherAxle,
      containsOtherAxle,
      wheelSemantics: own.map((wheel) => wheel.semantic),
      centerX: average(own.map((wheel) => wheel.center.x)),
      centerZ: average(own.map((wheel) => wheel.center.z)),
    };
  }

  inspect() {
    this.root.updateWorldMatrix(true, true);

    const visualBox = new THREE.Box3().setFromObject(this.root);
    const deckBox = this.deck ? new THREE.Box3().setFromObject(this.deck) : null;
    const wheels = this._assignWheelSemantics(
      this._discoverWheelMeshes().map((mesh) => this._measureWheel(mesh)),
    );

    const front = wheels.filter((wheel) => wheel.semantic?.startsWith('front'));
    const rear = wheels.filter((wheel) => wheel.semantic?.startsWith('rear'));
    const wheelDiameter = median(
      wheels.map((wheel) => wheel.diameter).filter((value) => Number.isFinite(value) && value > 1e-4),
    );
    const frontAxleX = average(front.map((wheel) => wheel.center.x));
    const rearAxleX = average(rear.map((wheel) => wheel.center.x));
    const wheelbase = front.length && rear.length ? Math.abs(frontAxleX - rearAxleX) : 0;
    const deckSize = deckBox?.getSize(new THREE.Vector3()) || new THREE.Vector3();
    const visualSize = visualBox.getSize(new THREE.Vector3());
    const deckLength = deckSize.x || visualSize.x;
    const deckWidth = deckSize.z || visualSize.z;

    const semanticWheelCount = wheels.filter((wheel) => (
      REQUIRED_WHEEL_SEMANTICS.includes(wheel.semantic)
    )).length;

    return {
      wheels,
      wheelCount: wheels.length,
      semanticWheelCount,
      wheelAxisVerified: wheels.length === 4 && wheels.every((wheel) => wheel.axleAxisVerified),
      deckBox,
      visualBox,
      measurements: {
        visualDimensions: visualSize,
        deckLength,
        deckWidth,
        deckThickness: deckSize.y || 0,
        wheelDiameter,
        wheelRadius: wheelDiameter * 0.5,
        wheelbase,
        frontAxleX,
        rearAxleX,
        deckToWheelbaseRatio: wheelbase > 1e-6 ? deckLength / wheelbase : null,
        totalDeckOverhang: Math.max(0, deckLength - wheelbase),
      },
      trucks: {
        front: this._truckMetadata(wheels, 'front'),
        rear: this._truckMetadata(wheels, 'rear'),
      },
    };
  }
}
