import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

function isVisibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}
function visibleBounds(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const transformed = new THREE.Box3();
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry || !isVisibleInHierarchy(object)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    transformed.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
    box.union(transformed);
  });
  return box;
}

export class HalfpipeVisual {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-visual-root';
    this.model = null;
    this.hiddenGroundNodes = [];
    this.bounds = new THREE.Box3();
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
    let box = visibleBounds(this.root);
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.x -= center.x;
    this.model.position.z -= center.z;
    this.model.position.y -= box.min.y;
    box = visibleBounds(this.root);
    this.bounds.copy(box);

    this.root.userData.visualOnly = true;
    this.root.userData.hiddenSourceGround = [...this.hiddenGroundNodes];
    return this;
  }

  dispose() {
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
