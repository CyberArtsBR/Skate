import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

const RIDING_SURFACE_NAMES = Object.freeze([
  'Object_4',
  'halfpipe-riding-surface',
  'halfpipe-surface',
  'riding-surface',
]);

function isVisibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function worldBounds(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const transformed = new THREE.Box3();

  object.traverse((child) => {
    if (!child.isMesh || !child.geometry || !isVisibleInHierarchy(child)) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    transformed.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    box.union(transformed);
  });

  return box;
}

function visibleBounds(root) {
  return worldBounds(root);
}

function findRidingSurface(root) {
  for (const name of RIDING_SURFACE_NAMES) {
    const exact = root.getObjectByName(name);
    if (exact?.isMesh && exact.geometry && isVisibleInHierarchy(exact)) return exact;
  }

  const namedCandidates = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry || !isVisibleInHierarchy(object)) return;
    if (/ground/i.test(object.name)) return;
    if (/(half.?pipe|riding|ride|ramp|surface)/i.test(object.name)) namedCandidates.push(object);
  });
  if (namedCandidates.length) {
    namedCandidates.sort((a, b) => {
      const aSize = worldBounds(a).getSize(new THREE.Vector3());
      const bSize = worldBounds(b).getSize(new THREE.Vector3());
      return (bSize.x * bSize.y) - (aSize.x * aSize.y);
    });
    return namedCandidates[0];
  }

  // Asset-fallback only: the riding skin spans both walls and therefore has
  // a large X/Y footprint. Gameplay never depends on this heuristic; it only
  // establishes visual alignment for replacement art assets.
  const candidates = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry || !isVisibleInHierarchy(object)) return;
    if (/ground/i.test(object.name)) return;
    const box = worldBounds(object);
    const size = box.getSize(new THREE.Vector3());
    candidates.push({
      object,
      score: Math.max(0, size.x) * Math.max(0, size.y),
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.object || null;
}

export class HalfpipeVisual {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-visual-root';
    this.model = null;
    this.hiddenGroundNodes = [];
    this.bounds = new THREE.Box3();
    this.ridingSurface = null;
    this.ridingSurfaceBounds = new THREE.Box3();
    this.alignment = null;
    this._surfaceRaycaster = new THREE.Raycaster();
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'halfpipe-source-visual';

    this.model.traverse((object) => {
      if (/ground/i.test(object.name)) {
        object.visible = false;
        this.hiddenGroundNodes.push(object.name);
      }
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    this.root.add(this.model);
    this.root.updateWorldMatrix(true, true);

    const fullBoxBeforeAlignment = visibleBounds(this.root);
    const fullCenter = fullBoxBeforeAlignment.getCenter(new THREE.Vector3());

    this.ridingSurface = findRidingSurface(this.model);
    if (!this.ridingSurface) {
      throw new Error('Halfpipe riding surface could not be identified for visual alignment.');
    }

    const ridingBoxBeforeAlignment = worldBounds(this.ridingSurface);
    const ridingCenter = ridingBoxBeforeAlignment.getCenter(new THREE.Vector3());

    // IMPORTANT VISUAL CONTRACT:
    // HalfpipeProfile uses world X=0 as the center of the riding channel.
    // Do not center X from the complete GLB bounds: decorative/support meshes
    // are asymmetric and previously shifted the visible channel ~1 world unit
    // left, while gameplay remained centered at X=0.
    this.model.position.x -= ridingCenter.x;

    // Preserve the established presentation framing on the other axes.
    this.model.position.z -= fullCenter.z;
    this.model.position.y -= fullBoxBeforeAlignment.min.y;

    this.root.updateWorldMatrix(true, true);
    const box = visibleBounds(this.root);
    this.bounds.copy(box);
    this.ridingSurfaceBounds.copy(worldBounds(this.ridingSurface));

    const alignedRidingCenter = this.ridingSurfaceBounds.getCenter(new THREE.Vector3());
    this.alignment = Object.freeze({
      source: 'riding-surface',
      ridingSurfaceName: this.ridingSurface.name,
      originalRidingCenterX: ridingCenter.x,
      alignedRidingCenterX: alignedRidingCenter.x,
      fullModelCenterX: fullCenter.x,
      appliedX: this.model.position.x,
    });

    this.root.userData.visualOnly = true;
    this.root.userData.hiddenSourceGround = [...this.hiddenGroundNodes];
    this.root.userData.ridingSurfaceName = this.ridingSurface.name;
    this.root.userData.ridingSurfaceCenterX = alignedRidingCenter.x;
    this.root.userData.alignmentSource = this.alignment.source;
    return this;
  }

  measureRidingSurfaceSeparation(worldPoint, worldNormal, options = {}) {
    if (!this.ridingSurface) return null;

    const padding = Math.max(0.01, Number(options.padding) || 3);
    const far = Math.max(padding + 0.01, Number(options.far) || 8);
    const normal = worldNormal.clone().normalize();
    const origin = worldPoint.clone().addScaledVector(normal, padding);

    this.root.updateWorldMatrix(true, true);
    this._surfaceRaycaster.set(origin, normal.clone().negate());
    this._surfaceRaycaster.far = far;

    const hit = this._surfaceRaycaster.intersectObject(this.ridingSurface, true)[0];
    if (!hit) return null;

    return {
      separation: hit.distance - padding,
      point: hit.point.clone(),
      distance: hit.distance,
    };
  }

  dispose() {
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
