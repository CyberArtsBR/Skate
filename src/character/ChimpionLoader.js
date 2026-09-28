import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';
import { RiderRigAdapter } from './RiderRigAdapter.js';

function fitModel(model, targetHeight) {
  model.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(targetHeight / Math.max(0.001, size.y));
  model.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
}
export class ChimpionLoader {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'chimpion-presentation-root';
    this.modelCarrier = new THREE.Group();
    this.modelCarrier.name = 'chimpion-side-stance-carrier';
    this.root.add(this.modelCarrier);
    this.model = null;
    this.rigAdapter = null;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'the-heretic-model';

    this.model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.isMeshStandardMaterial) continue;
        material.metalness = Math.min(material.metalness, 0.08);
        material.roughness = Math.max(material.roughness, 0.58);
      }
    });

    fitModel(this.model, GAME_CONFIG.rider.targetHeight);
    this.modelCarrier.add(this.model);
    this.rigAdapter = new RiderRigAdapter(this.model);
    if (!this.rigAdapter.valid) {
      throw new Error(`Chimpion rig is missing required slots: ${this.rigAdapter.missingRequired.join(', ')}`);
    }

    // The half-pipe travel axis is X and the source avatar faces +Z. Keeping
    // that authored facing makes the rider side-on to travel and front-facing
    // to the fixed presentation camera.
    this.modelCarrier.rotation.y = 0;
    this.rigAdapter.applySkatePose({ stance: GAME_CONFIG.rider.stance });
    this.root.userData.rigCapabilities = this.rigAdapter.capabilities;
    this.root.userData.poseMode = 'skateboard-side-stance';
    this.root.userData.modelForwardAxis = '+Z';
    return this;
  }

  updatePose(presentationState = {}) {
    this.rigAdapter?.applySkatePose(presentationState);
  }

  dispose() {
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
