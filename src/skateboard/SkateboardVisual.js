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
    this.wheelSpinDistance = 0;
    this.wheelSpinSafe = false;
    this.measuredWheelDiameter = GAME_CONFIG.skateboard.wheelRadius * 2;
    this.surfaceSupportPoints = [];
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'skateboard-source-visual';
    this.model.scale.setScalar(GAME_CONFIG.skateboard.scale);
    this.root.add(this.model);

    const wheelCandidates = [];
    const wheelMeshes = [];
    this.model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (/Board1/i.test(object.name)) this.deck = object;
      if (WHEEL_PATTERN.test(object.name)) {
        wheelCandidates.push(object.parent || object);
        wheelMeshes.push(object);
      }
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

    let deckBox = null;
    if (this.deck) {
      deckBox = new THREE.Box3().setFromObject(this.deck);
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

    const wheelDiameters = [];
    const uniqueWheelMeshes = [...new Set(wheelMeshes)];
    for (const wheelMesh of uniqueWheelMeshes) {
      const wheelBox = new THREE.Box3().setFromObject(wheelMesh);
      const point = wheelBox.getCenter(new THREE.Vector3());
      point.y = wheelBox.min.y;
      this.root.worldToLocal(point);
      this.contactPoints.push(point);

      const wheelSize = wheelBox.getSize(new THREE.Vector3());
      const diameter = Math.max(Math.abs(wheelSize.x), Math.abs(wheelSize.y));
      if (Number.isFinite(diameter) && diameter > 1e-4) wheelDiameters.push(diameter);
    }

    if (wheelDiameters.length) {
      wheelDiameters.sort((a, b) => a - b);
      this.measuredWheelDiameter = wheelDiameters[Math.floor(wheelDiameters.length / 2)];
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

    this.surfaceSupportPoints = this.contactPoints.map((point, index) => ({
      name: `wheel-bottom-${index + 1}`,
      position: point.clone(),
    }));

    if (deckBox) {
      const deckCenterZ = (deckBox.min.z + deckBox.max.z) * 0.5;
      for (const [name, x] of [
        ['deck-tail-underside', deckBox.min.x],
        ['deck-nose-underside', deckBox.max.x],
      ]) {
        const point = new THREE.Vector3(x, deckBox.min.y, deckCenterZ);
        this.root.worldToLocal(point);
        this.surfaceSupportPoints.push({ name, position: point });
      }
    }

    // The source hierarchy nests one axle under the other's parent. Exposing
    // that parent as a mutable truck transform would move both axles, so the
    // safe foundation contract keeps truck transforms null and exposes wheels.
    this.root.userData.wheelCount = this.wheels.length;
    this.root.userData.trucksIndependentlyTransformable = false;
    this.root.userData.coordinateSystem = this.coordinateSystem;
    this.root.userData.deckTopHeight = this.deckSurfaceY;
    this.root.userData.wheelContactHeight = this.wheelContactY;
    this.root.userData.wheelSpinSafe = this.wheelSpinSafe;
    this.root.userData.measuredWheelDiameter = this.measuredWheelDiameter;
    this.root.userData.surfaceSupportPointCount = this.surfaceSupportPoints.length;
    this.root.userData.sourceScale = GAME_CONFIG.skateboard.scale;
    return this;
  }

  rotateWheels(distance) {
    // The source GLB uses wheel/axle nodes whose local pivots are not guaranteed
    // to sit at the visual wheel centers. Rotating those parents made wheel/truck
    // pieces orbit away from the board on the live Phase 3A preview.
    //
    // Keep the authoritative travelled-distance hook, but do not mutate the
    // unsafe hierarchy until centered wheel pivots are authored or rebuilt.
    this.wheelSpinDistance += Number(distance) || 0;
  }

  dispose() {
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
