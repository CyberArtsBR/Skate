import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';
import { SkateboardAssetAdapter } from './SkateboardAssetAdapter.js';
import { SkateboardRig } from './SkateboardRig.js';

export const SKATEBOARD_COORDINATE_SYSTEM = Object.freeze({
  forwardAxis: '+X',
  lateralAxis: '+Z',
  upAxis: '+Y',
  axleAxis: '+Z',
  noseDirection: '+X',
  tailDirection: '-X',
  leftSide: '+Z',
  rightSide: '-Z',
  regularFrontFoot: 'left',
  regularRearFoot: 'right',
});

function averagePosition(wheels, fallback) {
  if (!wheels.length) return fallback.clone();
  return wheels.reduce((sum, wheel) => sum.add(wheel.bottom), new THREE.Vector3())
    .multiplyScalar(1 / wheels.length);
}

function serializableTruckMetadata(metadata) {
  if (!metadata) return null;
  return {
    axle: metadata.axle,
    sourceCandidateName: metadata.sourceCandidateName,
    sourceCandidatePath: metadata.sourceCandidatePath,
    independentlyTransformable: metadata.independentlyTransformable,
    containsOtherAxle: metadata.containsOtherAxle,
    wheelSemantics: [...metadata.wheelSemantics],
    centerX: metadata.centerX,
    centerZ: metadata.centerZ,
  };
}

export class SkateboardVisual {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'skateboard-visual-root';
    this.model = null;
    this.deck = null;
    this.wheels = [];
    this.frontLeft = null;
    this.frontRight = null;
    this.rearLeft = null;
    this.rearRight = null;
    this.frontTruck = null;
    this.rearTruck = null;
    this.truckMetadata = { front: null, rear: null };
    this.wheelRig = null;
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
    this.proportionAudit = null;
    this.presentationHooks = {
      impactCompression: 0,
      kickTurnPivot: { amount: 0, side: 'rear' },
      airStyle: 0,
    };
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'skateboard-source-visual';
    this.model.scale.setScalar(GAME_CONFIG.skateboard.scale);
    this.root.add(this.model);

    this.model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (/Board1/i.test(object.name)) {
        this.deck = object;
        // Preserve all authored material properties. Only extend the deck along
        // the board's forward axis; trucks and wheels keep uniform source scale.
        object.scale.x *= GAME_CONFIG.skateboard.deckLengthScale;
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

    const adapter = new SkateboardAssetAdapter({
      root: this.root,
      model: this.model,
      deck: this.deck,
    });
    const audit = adapter.inspect();
    const deckBox = audit.deckBox;

    this.deckSurfaceY = deckBox?.max.y ?? box.max.y;
    this.contactPoints = audit.wheels.map((wheel) => wheel.bottom.clone());
    this.measuredWheelDiameter = audit.measurements.wheelDiameter
      || GAME_CONFIG.skateboard.wheelRadius * 2;
    this.wheelContactY = this.contactPoints.length
      ? Math.min(...this.contactPoints.map((point) => point.y))
      : box.min.y;

    const frontWheels = audit.wheels.filter((wheel) => wheel.semantic?.startsWith('front'));
    const rearWheels = audit.wheels.filter((wheel) => wheel.semantic?.startsWith('rear'));
    this.frontContact.position.copy(averagePosition(
      frontWheels,
      new THREE.Vector3(this.dimensions.x * 0.3, this.wheelContactY, 0),
    ));
    this.rearContact.position.copy(averagePosition(
      rearWheels,
      new THREE.Vector3(-this.dimensions.x * 0.3, this.wheelContactY, 0),
    ));
    this.root.add(this.frontContact, this.rearContact);

    this.surfaceSupportPoints = audit.wheels.map((wheel, index) => ({
      name: wheel.semantic ? 'wheel-bottom-' + wheel.semantic : 'wheel-bottom-' + (index + 1),
      position: wheel.bottom.clone(),
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

    this.truckMetadata = {
      front: serializableTruckMetadata(audit.trucks.front),
      rear: serializableTruckMetadata(audit.trucks.rear),
    };
    // The source rear-truck candidate also owns the nested front assembly.
    // Keep both mutable truck transforms null rather than expose an asymmetric,
    // dangerous API. Metadata remains available for future asset re-authoring.
    this.frontTruck = null;
    this.rearTruck = null;

    this.wheelRig = new SkateboardRig({
      root: this.root,
      wheelDescriptors: audit.wheels,
    }).build();
    const wheelRefs = this.wheelRig.semanticRefs();
    this.frontLeft = wheelRefs.frontLeft;
    this.frontRight = wheelRefs.frontRight;
    this.rearLeft = wheelRefs.rearLeft;
    this.rearRight = wheelRefs.rearRight;
    this.wheels = this.wheelRig.list().map((wheel) => wheel.mesh);
    this.wheelSpinSafe = (
      audit.semanticWheelCount === 4
      && audit.wheelAxisVerified
      && this.wheelRig.isComplete
    );

    const riderHeight = GAME_CONFIG.rider.targetHeight;
    const deckLength = audit.measurements.deckLength;
    const wheelbase = audit.measurements.wheelbase;
    const wheelDiameter = this.measuredWheelDiameter;
    this.proportionAudit = {
      visualDimensions: this.dimensions.toArray(),
      deckLength,
      deckWidth: audit.measurements.deckWidth,
      deckThickness: audit.measurements.deckThickness,
      wheelDiameter,
      wheelbase,
      riderHeight,
      totalDeckOverhang: audit.measurements.totalDeckOverhang,
      ratios: {
        deckToWheelbase: wheelbase > 1e-6 ? deckLength / wheelbase : null,
        deckToRiderHeight: riderHeight > 1e-6 ? deckLength / riderHeight : null,
        wheelbaseToRiderHeight: riderHeight > 1e-6 ? wheelbase / riderHeight : null,
        wheelDiameterToDeckLength: deckLength > 1e-6 ? wheelDiameter / deckLength : null,
      },
    };

    this.root.userData.wheelCount = this.wheels.length;
    this.root.userData.wheelSemantics = {
      frontLeft: this.frontLeft?.pivot.name || null,
      frontRight: this.frontRight?.pivot.name || null,
      rearLeft: this.rearLeft?.pivot.name || null,
      rearRight: this.rearRight?.pivot.name || null,
    };
    this.root.userData.truckMetadata = this.truckMetadata;
    this.root.userData.trucksIndependentlyTransformable = false;
    this.root.userData.coordinateSystem = this.coordinateSystem;
    this.root.userData.deckTopHeight = this.deckSurfaceY;
    this.root.userData.wheelContactHeight = this.wheelContactY;
    this.root.userData.wheelSpinSafe = this.wheelSpinSafe;
    this.root.userData.wheelRigBuildReport = this.wheelRig.buildReport;
    this.root.userData.measuredWheelDiameter = this.measuredWheelDiameter;
    this.root.userData.surfaceSupportPointCount = this.surfaceSupportPoints.length;
    this.root.userData.sourceScale = GAME_CONFIG.skateboard.scale;
    this.root.userData.deckLengthScale = GAME_CONFIG.skateboard.deckLengthScale;
    this.root.userData.visualDimensions = this.dimensions.toArray();
    this.root.userData.proportionAudit = this.proportionAudit;
    this.root.userData.presentationHooks = this.presentationHooks;
    return this;
  }

  rotateWheels(distance) {
    const delta = Number(distance);
    if (!Number.isFinite(delta) || delta === 0) return;
    this.wheelSpinDistance += delta;
    if (this.wheelSpinSafe) this.wheelRig.setTravelDistance(this.wheelSpinDistance);
    this.root.userData.wheelSpinDistance = this.wheelSpinDistance;
  }

  setImpactCompression(amount) {
    this.presentationHooks.impactCompression = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    return this.presentationHooks.impactCompression;
  }

  setKickTurnPivot(amount, side = 'rear') {
    this.presentationHooks.kickTurnPivot = {
      amount: THREE.MathUtils.clamp(Number(amount) || 0, -1, 1),
      side: side === 'front' ? 'front' : 'rear',
    };
    return { ...this.presentationHooks.kickTurnPivot };
  }

  setAirStyle(amount) {
    this.presentationHooks.airStyle = THREE.MathUtils.clamp(Number(amount) || 0, -1, 1);
    return this.presentationHooks.airStyle;
  }

  getRuntimeAudit() {
    return {
      wheelSpinSafe: this.wheelSpinSafe,
      wheelSpinDistance: this.wheelSpinDistance,
      wheels: this.wheelRig?.stabilityReport() || [],
      trucks: this.truckMetadata,
      proportions: this.proportionAudit,
      supportPoints: this.surfaceSupportPoints.map((support) => ({
        name: support.name,
        position: support.position.toArray(),
      })),
    };
  }

  dispose() {
    // Runtime wheel meshes are reparented under dedicated pivots on root, so
    // disposing only the original GLB scene would leak their geometry/materials.
    disposeObject3D(this.root);
    this.root.removeFromParent();
  }
}
