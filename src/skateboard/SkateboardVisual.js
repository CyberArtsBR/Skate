import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

const WHEEL_PATTERN = /pPipe(?:9|13)(?:_|$)/i;

export const SKATEBOARD_COORDINATE_SYSTEM = Object.freeze({
  forwardAxis: '+X',
  lateralAxis: '+Z',
  upAxis: '+Y',
  noseDirection: '+X',
  tailDirection: '-X',
  regularFrontFoot: 'left',
  regularRearFoot: 'right',
});

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
    this.frontContact = new THREE.Object3D();
    this.frontContact.name = 'skateboard-front-contact';
    this.rearContact = new THREE.Object3D();
    this.rearContact.name = 'skateboard-rear-contact';
    this.deckSurfaceY = 0;
    this.wheelContactY = 0;
    this.dimensions = new THREE.Vector3();
    this.coordinateSystem = SKATEBOARD_COORDINATE_SYSTEM;
    this.stanceHalfLength = GAME_CONFIG.rider.stanceHalfLength;
    this.footLateralOffset = GAME_CONFIG.rider.footLateralOffset;
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
    box.getSize(this.dimensions);

    if (this.deck) {
      const deckBox = new THREE.Box3().setFromObject(this.deck);
      this.deckSurfaceY = deckBox.max.y;
    } else {
      this.deckSurfaceY = box.max.y;
    }

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

    this.wheelContactY = this.contactPoints.length
      ? Math.min(...this.contactPoints.map((point) => point.y))
      : box.min.y;

    const positiveX = this.contactPoints.filter((point) => point.x >= 0);
    const negativeX = this.contactPoints.filter((point) => point.x < 0);
    const averageContact = (points, fallbackX) => {
      if (!points.length) return new THREE.Vector3(fallbackX, this.wheelContactY, 0);
      return points.reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / points.length);
    };
    this.frontContact.position.copy(averageContact(positiveX, this.dimensions.x * 0.3));
    this.rearContact.position.copy(averageContact(negativeX, -this.dimensions.x * 0.3));
    this.root.add(this.frontContact, this.rearContact);

    // The source hierarchy nests one axle under the other's parent. Exposing
    // that parent as a mutable truck transform would move both axles, so the
    // safe foundation contract keeps truck transforms null and exposes wheels.
    this.root.userData.wheelCount = this.wheels.length;
    this.root.userData.trucksIndependentlyTransformable = false;
    this.root.userData.coordinateSystem = this.coordinateSystem;
    this.root.userData.deckTopHeight = this.deckSurfaceY;
    this.root.userData.wheelContactHeight = this.wheelContactY;
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
