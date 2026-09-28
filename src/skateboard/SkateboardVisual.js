import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

const WHEEL_PATTERN = /pPipe(?:9|13)(?:_|$)/i;

export class SkateboardVisual {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'skateboard-visual-root';
    this.model = null;
    this.deck = null;
    this.wheels = [];
    this.frontTruck = null;
    this.rearTruck = null;
    this.contactPoints = [];
    this.deckSurfaceY = 0;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'skateboard-source-visual';
    this.model.scale.setScalar(GAME_CONFIG.skateboard.scale);
    this.root.add(this.model);

    const wheelCandidates = [];
    this.model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (/Board1/i.test(object.name)) this.deck = object;
      if (WHEEL_PATTERN.test(object.name)) wheelCandidates.push(object.parent || object);
    });

    this.root.updateWorldMatrix(true, true);
    let box = new THREE.Box3().setFromObject(this.root);
    const center = box.getCenter(new THREE.Vector3());
    this.model.position.x -= center.x;
    this.model.position.z -= center.z;
    this.model.position.y -= box.min.y;
    this.root.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(this.root);
    this.deckSurfaceY = box.max.y;

    const uniqueWheels = [...new Set(wheelCandidates)];
    uniqueWheels.sort((a, b) => {
      const aCenter = new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3());
      const bCenter = new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3());
      return aCenter.x - bCenter.x || aCenter.z - bCenter.z;
    });
    this.wheels = uniqueWheels;

    for (const wheel of this.wheels) {
      const wheelBox = new THREE.Box3().setFromObject(wheel);
      const point = wheelBox.getCenter(new THREE.Vector3());
      point.y = wheelBox.min.y;
      this.root.worldToLocal(point);
      this.contactPoints.push(point);
    }

    // The source hierarchy nests one axle under the other's parent. Exposing
    // that parent as a mutable truck transform would move both axles, so the
    // safe foundation contract keeps truck transforms null and exposes wheels.
    this.root.userData.wheelCount = this.wheels.length;
    this.root.userData.trucksIndependentlyTransformable = false;
    return this;
  }

  rotateWheels(distance) {
    const angle = distance / GAME_CONFIG.skateboard.wheelRadius;
    const axle = new THREE.Vector3(0, 0, 1);
    for (const wheel of this.wheels) wheel.rotateOnWorldAxis(axle, -angle);
  }

  dispose() {
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
