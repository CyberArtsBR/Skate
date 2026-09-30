import {
  DEFAULT_GRAPHICS_PRESET,
  getGraphicsPreset,
  normalizeGraphicsPreset,
} from './GraphicsQuality.js';

const TEXTURE_KEYS = Object.freeze([
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
]);

function visitMaterials(root, callback) {
  root?.traverse?.((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material) callback(material, object);
    }
  });
}

export class RenderQualityManager {
  constructor(defaultPreset = DEFAULT_GRAPHICS_PRESET) {
    this.presetName = normalizeGraphicsPreset(defaultPreset);
    this.renderer = null;
    this.scene = null;
    this.environment = null;
    this.shadowLights = new Set();
    this.managedObjects = new Set();
    this.listeners = new Set();
  }

  get preset() {
    return getGraphicsPreset(this.presetName);
  }

  get pixelRatio() {
    return this.preset.pixelRatio;
  }

  get shadowSize() {
    return this.preset.shadowSize;
  }

  get anisotropy() {
    return this._resolveAnisotropy(this.preset.anisotropy);
  }

  get environmentQuality() {
    return this.preset.environmentQuality;
  }

  get vfxScale() {
    return this.preset.vfxScale;
  }

  snapshot() {
    return Object.freeze({
      name: this.presetName,
      pixelRatio: this.pixelRatio,
      shadowSize: this._resolveShadowSize(this.shadowSize),
      anisotropy: this.anisotropy,
      environmentQuality: this.environmentQuality,
      environmentIntensity: this.preset.environmentIntensity,
      frontMetalEnvMapIntensity: this.preset.frontMetalEnvMapIntensity,
      vfxScale: this.vfxScale,
    });
  }

  resolvePixelRatio(devicePixelRatio = 1) {
    const device = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
    return Math.max(0.5, Math.min(device, this.pixelRatio));
  }

  setPreset(name) {
    const nextName = normalizeGraphicsPreset(name);
    if (nextName === this.presetName) return this.snapshot();
    this.presetName = nextName;
    this.apply();
    return this.snapshot();
  }

  attachRenderer(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.apply({ rebuildEnvironment: false });
    return this;
  }

  detachRenderer(renderer = this.renderer) {
    if (renderer && this.renderer !== renderer) return;
    this.renderer = null;
    this.scene = null;
  }

  attachEnvironment(environment) {
    this.environment = environment;
    this._applyEnvironment(true);
    return this;
  }

  detachEnvironment(environment = this.environment) {
    if (environment && this.environment !== environment) return;
    this.environment = null;
  }

  registerShadowLight(light) {
    if (!light?.shadow) return () => {};
    this.shadowLights.add(light);
    this._applyShadowLight(light);
    return () => this.unregisterShadowLight(light);
  }

  unregisterShadowLight(light) {
    this.shadowLights.delete(light);
  }

  registerObject(root) {
    if (!root) return () => {};
    this.managedObjects.add(root);
    this._applyManagedObject(root);
    return () => this.unregisterObject(root);
  }

  unregisterObject(root) {
    this.managedObjects.delete(root);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply({ rebuildEnvironment = true } = {}) {
    const preset = this.preset;
    if (this.renderer) {
      this.renderer.setPixelRatio(this.resolvePixelRatio(globalThis.devicePixelRatio || 1));
      this.renderer.toneMappingExposure = preset.toneMappingExposure;
    }
    if (this.scene) {
      this.scene.environmentIntensity = preset.environmentIntensity;
      if (this.scene.fog && 'density' in this.scene.fog) {
        this.scene.fog.density = preset.fogDensity;
      }
    }
    for (const light of this.shadowLights) this._applyShadowLight(light);
    for (const root of this.managedObjects) this._applyManagedObject(root);
    if (rebuildEnvironment) this._applyEnvironment(true);

    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
    return state;
  }

  _resolveShadowSize(requested) {
    const maxTextureSize = this.renderer?.capabilities?.maxTextureSize || requested;
    return Math.max(512, Math.min(requested, maxTextureSize));
  }

  _resolveAnisotropy(requested) {
    const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || requested;
    return Math.max(1, Math.min(requested, maxAnisotropy));
  }

  _applyShadowLight(light) {
    if (!light?.shadow) return;
    const size = this._resolveShadowSize(this.shadowSize);
    const changed = light.shadow.mapSize.width !== size || light.shadow.mapSize.height !== size;
    if (!changed) return;
    light.shadow.map?.dispose?.();
    light.shadow.map = null;
    light.shadow.mapSize.set(size, size);
    light.shadow.needsUpdate = true;
  }

  _applyManagedObject(root) {
    this._applyAnisotropy(root);
    this._applyMaterialQuality(root);
  }

  _applyAnisotropy(root) {
    const target = this.anisotropy;
    const visited = new Set();
    visitMaterials(root, (material) => {
      for (const key of TEXTURE_KEYS) {
        const texture = material[key];
        if (!texture?.isTexture || visited.has(texture)) continue;
        visited.add(texture);
        if (texture.anisotropy === target) continue;
        texture.anisotropy = target;
        texture.needsUpdate = true;
      }
    });
  }

  _applyMaterialQuality(root) {
    const frontMetalIntensity = Number(this.preset.frontMetalEnvMapIntensity);
    if (!Number.isFinite(frontMetalIntensity)) return;

    visitMaterials(root, (material, object) => {
      if (!object?.userData?.maxReflectiveFront) return;
      if (!('envMapIntensity' in material)) return;
      material.envMapIntensity = frontMetalIntensity;
    });
  }

  _applyEnvironment(rebuild) {
    if (!this.scene || !this.environment || !rebuild) return;
    const preset = this.preset;
    const texture = this.environment.build({
      quality: preset.environmentQuality,
      sigma: preset.environmentSigma,
    });
    this.scene.environment = texture;
    this.scene.environmentIntensity = preset.environmentIntensity;
  }
}

export const quality = new RenderQualityManager();
