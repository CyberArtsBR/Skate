import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  bloomStrength: 0.85,
  bloomRadius: 0.42,
  bloomThreshold: 0.45,
  bloomResolution: 0.65,
  aoEnabled: false,
  aoBlendIntensity: 0.36,
  sharpenAmount: 0.08,
});

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
      // ShaderMaterial receives these function declarations from Three.js.
      // Only the executable tone/color chunks belong in this shader body.
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
        // Bloom extends beyond opaque geometry into the transparent canvas.
        // Give the halo coverage instead of discarding it with base.a = 0.
        float haloAlpha = clamp(max(bloom.r, max(bloom.g, bloom.b)), 0.0, 0.85);
        float alpha = base.a + (1.0 - base.a) * haloAlpha;
        vec3 color = max(vec3(0.0), sharpened + bloom);
        gl_FragColor = vec4(color / max(alpha, 0.00001), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }
    `,
    transparent: false,
    premultipliedAlpha: true,
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
    this._emissiveMaterials = new Map();
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
    const shouldEnable = Boolean(this.config.enabled);
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
    if (this.compositeMaterial) {
      this.compositeMaterial.uniforms.uSharpen.value = this.config.sharpenAmount;
    }
    this._syncSize();
  }

  _buildPipeline(camera) {
    this._camera = camera;

    const baseTarget = createRenderTarget('halfpipe-cinematic-base');
    baseTarget.samples = this.quality?.presetName === 'performance' ? 0 : 4;
    this.baseComposer = new EffectComposer(this.renderer, baseTarget);
    this.baseComposer.renderToScreen = false;
    this.baseRenderPass = new RenderPass(this.scene, camera);
    this.baseComposer.addPass(this.baseRenderPass);

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

    this.darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false,
      fog: false, side: THREE.DoubleSide });
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
    this.bloomComposer.setPixelRatio(pixelRatio * this.config.bloomResolution);
    this.baseComposer.setSize(safeWidth, safeHeight);
    this.bloomComposer.setSize(safeWidth, safeHeight);
    this.compositeMaterial?.uniforms.uTexelSize.value.set(
      1 / Math.max(1, safeWidth * pixelRatio),
      1 / Math.max(1, safeHeight * pixelRatio),
    );
  }

  _isBloomTarget(object, material) {
    if (!object.userData?.emissiveBloom) return false;
    // Coping emission is a material-slot role, not permission to bloom any
    // unrelated emissive slot sharing the same source mesh.
    return !object.userData.copingContactZone || material?.userData?.halfpipeRole === 'coping';
  }

  _prepareBloomMaterials() {
    this._materialCache.clear();
    this.scene.traverse((object) => {
      if (!object?.isMesh || !object.material) return;
      this._materialCache.set(object, object.material);
      const source = object.material;
      const bloomMaterial = (material) => {
        if (!this._isBloomTarget(object, material) || !material?.emissive) return this.darkMaterial;
        let glow = this._emissiveMaterials.get(material);
        if (!glow) {
          glow = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false,
            side: material.side, fog: false, depthTest: true, depthWrite: true });
          this._emissiveMaterials.set(material, glow);
        }
        glow.color.copy(material.emissive).multiplyScalar(material.emissiveIntensity || 0);
        return glow;
      };
      object.material = Array.isArray(source) ? source.map(bloomMaterial) : bloomMaterial(source);
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
    this.bloomRenderPass.camera = camera;
    this._rendering = true;
    const shadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const autoClear = this.renderer.autoClear;
    const previousShaderError = this.renderer.debug.onShaderError;
    const previousShaderCheck = this.renderer.debug.checkShaderErrors;
    let compositeFailed = false;

    try {
      this._prepareBloomMaterials();
      // A visible HDRI belongs in the base image, never the selective glow pass.
      // Otherwise the sunset becomes an enormous bloom source over the skater.
      const background = this.scene.background;
      try {
        this.scene.background = null;
        this.renderer.shadowMap.autoUpdate = false;
        this.bloomComposer.render(0);
      } finally {
        this.scene.background = background;
        this.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
        this._restoreMaterials();
      }

      this.baseComposer.render(0);
      const bloomTexture = this.bloomPass.renderTargetsHorizontal?.[0]?.texture
        || this.bloomComposer.readBuffer.texture;
      this.compositeMaterial.uniforms.tBase.value = this.baseComposer.readBuffer.texture;
      this.compositeMaterial.uniforms.tBloom.value = bloomTexture;
      this.renderer.setRenderTarget(null);
      this.renderer.clear(true, true, true);
      // A failed post-process program must never hide the playable scene.
      // Scope this handler to the composite draw, leaving scene shaders alone.
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = (...args) => {
        compositeFailed = true;
        previousShaderError?.(...args);
      };
      this.compositeQuad.render(this.renderer);
    } catch (error) {
      compositeFailed = true;
      console.warn('Halfpipe bloom unavailable; restoring direct scene rendering.', error);
    } finally {
      this._restoreMaterials();
      this.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      this.renderer.autoClear = autoClear;
      this.renderer.debug.onShaderError = previousShaderError;
      this.renderer.debug.checkShaderErrors = previousShaderCheck;
      this._rendering = false;
    }
    if (compositeFailed) {
      this.enabled = false;
      this.renderer.setRenderTarget(null);
      this._originalRender.call(this.renderer, this.scene, camera);
    }
  }

  _disposePipeline() {
    this._restoreMaterials();
    for (const material of this._emissiveMaterials.values()) material.dispose();
    this._emissiveMaterials.clear();
    this.bloomPass?.dispose?.();
    this.baseComposer?.dispose?.();
    this.bloomComposer?.dispose?.();
    this.compositeQuad?.dispose?.();
    this.darkMaterial?.dispose?.();
    this.compositeMaterial?.dispose?.();

    this.baseComposer = null;
    this.bloomComposer = null;
    this.baseRenderPass = null;
    this.bloomRenderPass = null;
    this.bloomPass = null;
    this.compositeQuad = null;
    this.compositeMaterial = null;
    this.darkMaterial = null;
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

