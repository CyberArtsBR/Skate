import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SELECTIVE_BLOOM_LAYER } from './GraphicsLayers.js';

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  bloomStrength: 0.25,
  bloomRadius: 0.30,
  bloomThreshold: 0.90,
  aoEnabled: true,
  aoBlendIntensity: 0.36,
  sharpenAmount: 0.08,
});

const BLOOM_VFX_NAMES = new Set([
  'halfpipe-vfx-sparks',
  'halfpipe-vfx-contact-flash',
]);

function createRenderTarget(name) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.name = name;
  return target;
}

function createCompositeMaterial() {
  return new THREE.ShaderMaterial({
    name: 'halfpipe-cinematic-composite',
    uniforms: {
      tBase: { value: null },
      tBloom: { value: null },
      uTexelSize: { value: new THREE.Vector2(1, 1) },
      uSharpen: { value: 0.08 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>

      uniform sampler2D tBase;
      uniform sampler2D tBloom;
      uniform vec2 uTexelSize;
      uniform float uSharpen;
      varying vec2 vUv;

      void main() {
        vec4 base = texture2D(tBase, vUv);
        vec3 north = texture2D(tBase, vUv + vec2(0.0, uTexelSize.y)).rgb;
        vec3 south = texture2D(tBase, vUv - vec2(0.0, uTexelSize.y)).rgb;
        vec3 east = texture2D(tBase, vUv + vec2(uTexelSize.x, 0.0)).rgb;
        vec3 west = texture2D(tBase, vUv - vec2(uTexelSize.x, 0.0)).rgb;
        vec3 localAverage = (north + south + east + west) * 0.25;
        vec3 sharpened = base.rgb + (base.rgb - localAverage) * uSharpen;
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        gl_FragColor = vec4(max(vec3(0.0), sharpened + bloom), base.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
}

export class CinematicPostProcessing {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.enabled = false;
    this.config = DEFAULT_CONFIG;
    this._rendering = false;
    this._camera = null;
    this._size = new THREE.Vector2(1, 1);
    this._materialCache = new Map();
    this._bloomLayer = new THREE.Layers();
    this._bloomLayer.set(SELECTIVE_BLOOM_LAYER);
    this._originalRender = renderer.render;
    this._originalSetSize = renderer.setSize;
    this._originalSetPixelRatio = renderer.setPixelRatio;
    this._installRendererHooks();
    this._unsubscribeQuality = quality.subscribe(() => this._applyPreset());
    this._applyPreset();
  }

  _installRendererHooks() {
    this.renderer.render = (scene, camera) => {
      if (this.enabled && !this._rendering && scene === this.scene) {
        return this.render(camera);
      }
      return this._originalRender.call(this.renderer, scene, camera);
    };

    this.renderer.setSize = (width, height, updateStyle = true) => {
      const result = this._originalSetSize.call(this.renderer, width, height, updateStyle);
      this._syncSize(width, height);
      return result;
    };

    this.renderer.setPixelRatio = (value) => {
      const result = this._originalSetPixelRatio.call(this.renderer, value);
      this._syncSize();
      return result;
    };
  }

  _applyPreset() {
    const preset = this.quality?.preset || {};
    const config = preset.postProcessing || DEFAULT_CONFIG;
    this.config = { ...DEFAULT_CONFIG, ...config };
    const shouldEnable = Boolean(this.config.enabled && this.quality?.presetName === 'cinematic');
    this.enabled = shouldEnable;

    if (!shouldEnable) {
      this._disposePipeline();
      return;
    }

    if (this.bloomPass) {
      this.bloomPass.strength = this.config.bloomStrength;
      this.bloomPass.radius = this.config.bloomRadius;
      this.bloomPass.threshold = this.config.bloomThreshold;
    }
    if (this.gtaoPass) {
      this.gtaoPass.enabled = Boolean(this.config.aoEnabled);
      this.gtaoPass.blendIntensity = this.config.aoBlendIntensity;
    }
    if (this.compositeMaterial) {
      this.compositeMaterial.uniforms.uSharpen.value = this.config.sharpenAmount;
    }
  }

  _buildPipeline(camera) {
    this._camera = camera;

    this.baseComposer = new EffectComposer(
      this.renderer,
      createRenderTarget('halfpipe-cinematic-base'),
    );
    this.baseComposer.renderToScreen = false;
    this.baseRenderPass = new RenderPass(this.scene, camera);
    this.gtaoPass = new GTAOPass(this.scene, camera, 512, 512);
    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
    this.gtaoPass.blendIntensity = this.config.aoBlendIntensity;
    this.gtaoPass.enabled = Boolean(this.config.aoEnabled);
    this.gtaoPass.updateGtaoMaterial({
      radius: 0.20,
      distanceExponent: 1.0,
      thickness: 0.75,
      scale: 0.72,
      samples: 16,
      distanceFallOff: 0.85,
      screenSpaceRadius: true,
    });
    this.gtaoPass.updatePdMaterial({
      lumaPhi: 8.0,
      depthPhi: 2.0,
      normalPhi: 3.0,
      radius: 4.0,
      radiusExponent: 1.5,
      rings: 2,
      samples: 12,
    });
    this.baseComposer.addPass(this.baseRenderPass);
    this.baseComposer.addPass(this.gtaoPass);

    this.bloomComposer = new EffectComposer(
      this.renderer,
      createRenderTarget('halfpipe-cinematic-bloom'),
    );
    this.bloomComposer.renderToScreen = false;
    this.bloomRenderPass = new RenderPass(this.scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      this.config.bloomStrength,
      this.config.bloomRadius,
      this.config.bloomThreshold,
    );
    this.bloomComposer.addPass(this.bloomRenderPass);
    this.bloomComposer.addPass(this.bloomPass);

    this.darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    this.bloomSourceMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
    this.compositeMaterial = createCompositeMaterial();
    this.compositeMaterial.uniforms.uSharpen.value = this.config.sharpenAmount;
    this.compositeQuad = new FullScreenQuad(this.compositeMaterial);
    this._syncSize();
  }

  _syncSize(width = null, height = null) {
    if (!this.baseComposer || !this.bloomComposer) return;
    if (width === null || height === null) {
      this.renderer.getSize(this._size);
      width = this._size.x;
      height = this._size.y;
    }

    const safeWidth = Math.max(1, Math.floor(width || 1));
    const safeHeight = Math.max(1, Math.floor(height || 1));
    const pixelRatio = Math.max(0.5, this.renderer.getPixelRatio?.() || 1);
    this.baseComposer.setPixelRatio(pixelRatio);
    this.bloomComposer.setPixelRatio(pixelRatio);
    this.baseComposer.setSize(safeWidth, safeHeight);
    this.bloomComposer.setSize(safeWidth, safeHeight);
    this.compositeMaterial?.uniforms.uTexelSize.value.set(
      1 / Math.max(1, safeWidth * pixelRatio),
      1 / Math.max(1, safeHeight * pixelRatio),
    );
  }

  _isBloomTarget(object) {
    return Boolean(
      object.layers.test(this._bloomLayer)
      || object.userData?.visualGlowOnly
      || BLOOM_VFX_NAMES.has(object.name),
    );
  }

  _prepareBloomMaterials() {
    this._materialCache.clear();
    this.scene.traverse((object) => {
      if (!object?.isMesh || !object.material) return;
      this._materialCache.set(object, object.material);
      object.material = this._isBloomTarget(object)
        ? this.bloomSourceMaterial
        : this.darkMaterial;
    });
  }

  _restoreMaterials() {
    for (const [object, material] of this._materialCache) object.material = material;
    this._materialCache.clear();
  }

  render(camera) {
    if (!this.enabled) return this._originalRender.call(this.renderer, this.scene, camera);
    if (!this.baseComposer || !this.bloomComposer) this._buildPipeline(camera);

    this._camera = camera;
    this.baseRenderPass.camera = camera;
    this.gtaoPass.camera = camera;
    this.bloomRenderPass.camera = camera;
    this._rendering = true;

    try {
      this._prepareBloomMaterials();
      try {
        this.bloomComposer.render(0);
      } finally {
        this._restoreMaterials();
      }

      this.baseComposer.render(0);
      const bloomTexture = this.bloomPass.renderTargetsHorizontal?.[0]?.texture
        || this.bloomComposer.readBuffer.texture;
      this.compositeMaterial.uniforms.tBase.value = this.baseComposer.readBuffer.texture;
      this.compositeMaterial.uniforms.tBloom.value = bloomTexture;
      this.renderer.setRenderTarget(null);
      this.renderer.clear(true, true, true);
      this.compositeQuad.render(this.renderer);
    } finally {
      this._restoreMaterials();
      this._rendering = false;
    }
  }

  _disposePipeline() {
    this._restoreMaterials();
    this.gtaoPass?.dispose?.();
    this.bloomPass?.dispose?.();
    this.baseComposer?.dispose?.();
    this.bloomComposer?.dispose?.();
    this.compositeQuad?.dispose?.();
    this.darkMaterial?.dispose?.();
    this.bloomSourceMaterial?.dispose?.();
    this.compositeMaterial?.dispose?.();

    this.baseComposer = null;
    this.bloomComposer = null;
    this.baseRenderPass = null;
    this.bloomRenderPass = null;
    this.gtaoPass = null;
    this.bloomPass = null;
    this.compositeQuad = null;
    this.compositeMaterial = null;
    this.darkMaterial = null;
    this.bloomSourceMaterial = null;
  }

  dispose() {
    this.enabled = false;
    this._unsubscribeQuality?.();
    this._unsubscribeQuality = null;
    this._disposePipeline();
    this.renderer.render = this._originalRender;
    this.renderer.setSize = this._originalSetSize;
    this.renderer.setPixelRatio = this._originalSetPixelRatio;
  }
}
