import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ChimpionLoader } from '../character/ChimpionLoader.js';
import { RiderFootIK } from '../character/RiderFootIK.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { HalfpipeProfile } from '../halfpipe/HalfpipeProfile.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

// These are the three actual horizontal standing surfaces in the supplied
// winner_podium.glb, measured in its scene coordinates. The podium's front is
// authored toward -X and its ranks run along Z, so +90 Y presents it toward +Z.
const SOURCE_PLATFORMS = Object.freeze([
  Object.freeze({ rank: 1, z: 0, y: 2.560207661 }),
  Object.freeze({ rank: 2, z: -2.028502189, y: 2.032979103 }),
  Object.freeze({ rank: 3, z: 2.028501785, y: 1.708770135 }),
]);

const ORIGINAL_PODIUM_WIDTH = 4.5;
const PODIUM_HEIGHT_SCALE = 1.15;

const STANDING_POSE = Object.freeze({
  facingSign: 1,
  compression: 0.08,
  hipFlex: 0.025,
  kneeFlex: 0.26,
  ankleFlex: -0.035,
  torsoCounter: 0,
  headLook: 0,
  armBalance: 0.82,
  forearmDrop: 0.06,
});

export class WinnersPodium {
  constructor(scene, {
    floorY = 0,
    width = ORIGINAL_PODIUM_WIDTH * 1.25,
    url = '/models/podium/winner_podium.glb',
  } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'winners-podium-presentation';
    this.root.position.set(0, floorY, 0);
    this.root.visible = false;
    scene.add(this.root);
    this.url = url;
    this.floorY = floorY;
    this.profile = new HalfpipeProfile();
    this.width = Math.max(Number(width) || ORIGINAL_PODIUM_WIDTH * 1.25, 3.5);
    this.podium = null;
    this.platforms = [];
    this.actors = [];
    this._labelAnchors = [];
    this._localBounds = new THREE.Box3();
    this._preloadPromise = null;
    this._revision = 0;
    this._disposed = false;
  }

  preload() {
    if (this._disposed) return Promise.reject(new Error('Podium has been disposed.'));
    if (this.podium) return Promise.resolve(this);
    if (this._preloadPromise) return this._preloadPromise;
    this._preloadPromise = new GLTFLoader().loadAsync(this.url).then((gltf) => {
      const podium = gltf.scene;
      if (this._disposed) {
        disposeObject3D(podium);
        throw new Error('Podium was disposed while loading.');
      }
      podium.name = 'supplied-winner-podium';
      podium.rotation.y = Math.PI / 2;
      podium.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(podium, true);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.x) || size.x <= 0.001) {
        disposeObject3D(podium);
        throw new Error('Supplied podium has no usable standing geometry.');
      }
      const scale = ORIGINAL_PODIUM_WIDTH / size.x;
      const widthScale = this.width / size.x;
      const heightScale = scale * PODIUM_HEIGHT_SCALE;
      // The model's local Z becomes world X after its quarter turn. Scale the
      // podium alone so the competitors retain their existing body size.
      podium.scale.set(heightScale, heightScale, widthScale);
      podium.updateMatrixWorld(true);
      bounds.setFromObject(podium, true);
      const center = bounds.getCenter(new THREE.Vector3());
      podium.position.set(-center.x, -bounds.min.y, -center.z);
      // The wider base extends slightly into each curved transition. Raise it
      // to the ramp at its outer edge instead of clipping or shrinking it.
      const baseHalfWidth = Math.max(
        Math.abs(bounds.min.x - center.x), Math.abs(bounds.max.x - center.x),
      );
      this.root.position.y = this.floorY + this.profile.sample(baseHalfWidth).y + 0.01;
      podium.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      this.platforms = SOURCE_PLATFORMS.map((surface) => ({
        rank: surface.rank,
        position: new THREE.Vector3(
          surface.z * widthScale - center.x,
          surface.y * heightScale - bounds.min.y,
          -center.z,
        ),
      }));
      this.podium = podium;
      this.root.add(podium);
      this.root.updateMatrixWorld(true);
      this._localBounds.setFromObject(podium, true);
      // Store a root-local box, independent of ramp floor elevation.
      this._localBounds.applyMatrix4(this.root.matrixWorld.clone().invert());
      return this;
    }).catch((error) => {
      this._preloadPromise = null;
      throw error;
    });
    return this._preloadPromise;
  }

  async show(entries) {
    if (this._disposed) throw new Error('Podium has been disposed.');
    const revision = ++this._revision;
    this.root.visible = false;
    this._clearActors();
    const ranked = [...entries].sort((a, b) => b.score - a.score).slice(0, 3);
    if (ranked.length !== 3) throw new Error('Podium needs exactly three competitors.');
    await this.preload();
    if (revision !== this._revision || this._disposed) return false;

    const loaded = await Promise.allSettled(ranked.map(async (entry) => {
      const asset = new ChimpionLoader(entry.modelUrl);
      try {
        await asset.load();
        return { asset, entry };
      } catch (error) {
        asset.dispose();
        throw error;
      }
    }));
    const assets = loaded.filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const failed = loaded.find((result) => result.status === 'rejected');
    if (revision !== this._revision || this._disposed || failed) {
      for (const actor of assets) actor.asset.dispose();
      if (failed && revision === this._revision && !this._disposed) throw failed.reason;
      return false;
    }

    try {
      for (let index = 0; index < assets.length; index++) {
        const { asset, entry } = assets[index];
        const platform = this.platforms[index];
        const standing = new THREE.Group();
        standing.name = `podium-rank-${platform.rank}-${entry.id || index}`;
        standing.position.copy(platform.position);
        standing.add(asset.root);
        this.root.add(standing);
        const actor = { asset, entry, rank: platform.rank, standing };
        this.actors.push(actor);

        // Use the existing sole-calibrated leg solver once against the platform
        // plane. No skateboard or gameplay transform participates in this pose.
        const floorTargets = new THREE.Group();
        floorTargets.name = 'podium-standing-foot-targets';
        standing.add(floorTargets);
        asset.root.position.set(0, 0.025, 0);
        const footIK = new RiderFootIK({
          rigAdapter: asset.rigAdapter,
          riderRoot: standing,
          chimpionRoot: asset.root,
          skateboard: {
            root: floorTargets,
            deckSurfaceY: 0,
            stanceHalfLength: GAME_CONFIG.rider.targetHeight * 0.12,
            footLateralOffset: 0.025,
          },
        });
        asset.updatePose(STANDING_POSE);
        footIK.update(STANDING_POSE);
        standing.updateMatrixWorld(true);
        const actorBounds = new THREE.Box3().setFromObject(asset.root, true);
        const label = actorBounds.getCenter(new THREE.Vector3());
        label.y = actorBounds.max.y + 0.35;
        this.root.worldToLocal(label);
        this._labelAnchors.push({ entry, rank: platform.rank, position: label });
      }
      this.root.updateMatrixWorld(true);
      this._localBounds.setFromObject(this.root, true)
        .applyMatrix4(this.root.matrixWorld.clone().invert());
      for (const anchor of this._labelAnchors) this._localBounds.expandByPoint(anchor.position);
      this.root.visible = true;
      return true;
    } catch (error) {
      // Also release any fulfilled avatar not yet attached when posing fails.
      const attached = new Set(this.actors.map((actor) => actor.asset));
      this._clearActors();
      for (const { asset } of assets) if (!attached.has(asset)) asset.dispose();
      throw error;
    }
  }

  getLabelAnchors() {
    this.root.updateWorldMatrix(true, false);
    return this._labelAnchors.map((anchor) => ({
      entry: anchor.entry,
      rank: anchor.rank,
      position: anchor.position.clone().applyMatrix4(this.root.matrixWorld),
    }));
  }

  getWorldBounds() {
    this.root.updateWorldMatrix(true, false);
    return this._localBounds.clone().applyMatrix4(this.root.matrixWorld);
  }

  getCameraFraming(aspect = 16 / 9, fov = GAME_CONFIG.camera.fov) {
    const vertical = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const target = new THREE.Vector3().fromArray(GAME_CONFIG.camera.target);
    const position = new THREE.Vector3().fromArray(GAME_CONFIG.camera.position);
    // Preserve the normal centered arena view, without moving in for avatars.
    // On narrow screens, pull back only as much as the ceremony needs rather
    // than squeezing the competitors and their labels to fit the whole ramp.
    const ceremonyWidth = this.getWorldBounds().getSize(new THREE.Vector3()).x;
    const halfWidth = Math.max(this.width / 2 + GAME_CONFIG.rider.targetHeight * 0.15,
      ceremonyWidth / 2);
    const minimumDistance = halfWidth * 1.15 / (vertical * Math.max(0.25, aspect));
    const distanceScale = Math.max(1, minimumDistance / position.z);
    position.sub(target).multiplyScalar(distanceScale).add(target);
    return { target, position };
  }

  update() {
    // Standing poses and their foot constraints are solved once on show().
    // This scene deliberately adds no per-frame skeleton or physics work.
  }

  _clearActors() {
    for (const actor of this.actors) {
      actor.asset.dispose();
      actor.standing.removeFromParent();
    }
    this.actors = [];
    this._labelAnchors = [];
  }

  hide() {
    ++this._revision;
    this.root.visible = false;
    this._clearActors();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.hide();
    disposeObject3D(this.podium);
    this.podium = null;
    this.root.removeFromParent();
  }
}
