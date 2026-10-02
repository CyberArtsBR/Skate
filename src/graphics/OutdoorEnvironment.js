import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const QUALITY_SEGMENTS = Object.freeze({
  low: [24, 12],
  medium: [32, 16],
  high: [48, 24],
  ultra: [64, 32],
  cinematic: [80, 40],
});

const DAYLIGHT_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/piazza_martin_lutero_1k.hdr';
const localEnvironmentUrl = url => url === DAYLIGHT_URL
  ? '/hdri/piazza_martin_lutero_1k.hdr' : url;

export class OutdoorEnvironment {
  constructor(renderer, { url = null, onReady = null } = {}) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.url = localEnvironmentUrl(url);
    this.onReady = typeof onReady === 'function' ? onReady : null;
    this.fallbackTarget = null;
    this.hdriTarget = null;
    this.texture = null;
    this.backgroundTexture = null;
    this.disposed = false;
    this.loadGeneration = 0;
    this.loadingUrl = null;
    this._loadPromise = this.url ? this._loadHdri(this.url, ++this.loadGeneration) : null;
  }

  async _loadHdri(url, generation = this.loadGeneration) {
    let source = null;
    this.loadingUrl = url;
    try {
      source = await (/\.exr(?:[?#]|$)/i.test(url) ? new EXRLoader() : new RGBELoader()).loadAsync(url);
      if (this.disposed || generation !== this.loadGeneration) {
        source.dispose();
        return null;
      }

      source.mapping = THREE.EquirectangularReflectionMapping;
      const nextTarget = this.pmrem.fromEquirectangular(source);
      const nextBackground = source;
      source = null;

      if (this.disposed || generation !== this.loadGeneration) {
        nextTarget.dispose();
        nextBackground.dispose();
        return null;
      }

      this.backgroundTexture?.dispose();
      this.backgroundTexture = nextBackground;
      this.hdriTarget?.dispose();
      this.hdriTarget = nextTarget;
      this.fallbackTarget?.dispose();
      this.fallbackTarget = null;
      this.texture = nextTarget.texture;
      this.loadingUrl = null;
      this.onReady?.(this.texture);
      return this.texture;
    } catch (error) {
      source?.dispose?.();
      if (generation === this.loadGeneration) this.loadingUrl = null;
      if (!this.disposed && generation === this.loadGeneration) {
        console.warn('[Halfpipe] HDRI environment failed to load; retaining previous environment.', error);
      }
      return null;
    }
  }

  async setUrl(url = null) {
    if (this.disposed) return null;
    const nextUrl = url ? localEnvironmentUrl(String(url)) : null;
    if (nextUrl === this.url && this.hdriTarget?.texture) {
      this.texture = this.hdriTarget.texture;
      this.onReady?.(this.texture);
      return this.texture;
    }
    if (nextUrl === this.url && this.loadingUrl === nextUrl && this._loadPromise) {
      return this._loadPromise;
    }

    this.url = nextUrl;
    const generation = ++this.loadGeneration;

    if (!nextUrl) {
      this.loadingUrl = null;
      this.hdriTarget?.dispose();
      this.hdriTarget = null;
      this.texture = this._buildFallback();
      this.onReady?.(this.texture);
      return this.texture;
    }

    // Keep the current PMREM active until the replacement has finished loading.
    // This prevents a black/reflectionless frame when switching maps.
    this._loadPromise = this._loadHdri(nextUrl, generation);
    return this._loadPromise;
  }

  _buildFallback({ quality = 'high', sigma = 0.05 } = {}) {
    const [widthSegments, heightSegments] = QUALITY_SEGMENTS[quality]
      || QUALITY_SEGMENTS.high;
    const environmentScene = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(60, widthSegments, heightSegments);
    const material = new THREE.ShaderMaterial({
      name: 'california-outdoor-pmrem-sky',
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      uniforms: {
        uSkyZenith: { value: new THREE.Color(0x62bde8) },
        uSkyHorizon: { value: new THREE.Color(0xc8e5eb) },
        uWarmHorizon: { value: new THREE.Color(0xf0bf8a) },
        uGround: { value: new THREE.Color(0x8c6b54) },
        uSunColor: { value: new THREE.Color(0xffe2ae) },
        uSunDirection: { value: new THREE.Vector3(-0.48, 0.68, 0.55).normalize() },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uWarmHorizon;
        uniform vec3 uGround;
        uniform vec3 uSunColor;
        uniform vec3 uSunDirection;

        void main() {
          vec3 dir = normalize(vDirection);
          float up = clamp(dir.y, -1.0, 1.0);
          float skyMix = smoothstep(0.0, 0.92, max(up, 0.0));
          vec3 sky = mix(uSkyHorizon, uSkyZenith, skyMix);

          float horizon = exp(-abs(up) * 9.0);
          sky = mix(sky, uWarmHorizon, horizon * 0.22);

          float groundMix = 1.0 - smoothstep(-0.72, -0.02, min(up, 0.0));
          vec3 baseColor = mix(sky, uGround, groundMix);

          float azimuth = atan(dir.z, dir.x);
          float urbanBand = (sin(azimuth * 6.0) * 0.5 + 0.5)
            * exp(-abs(up) * 18.0) * 0.045;
          baseColor += vec3(0.03, 0.018, 0.012) * urbanBand;

          float sun = pow(max(dot(dir, uSunDirection), 0.0), 180.0);
          baseColor += uSunColor * sun * 2.4;

          gl_FragColor = vec4(baseColor, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(geometry, material);
    dome.frustumCulled = false;
    environmentScene.add(dome);

    const nextTarget = this.pmrem.fromScene(environmentScene, sigma, 0.1, 100);

    environmentScene.remove(dome);
    geometry.dispose();
    material.dispose();

    this.fallbackTarget?.dispose();
    this.fallbackTarget = nextTarget;
    this.texture = nextTarget.texture;
    return this.texture;
  }

  build(options = {}) {
    if (this.hdriTarget) {
      this.texture = this.hdriTarget.texture;
      return this.texture;
    }
    if (this.texture?.isTexture && this.fallbackTarget) return this.texture;
    return this._buildFallback(options);
  }

  dispose() {
    this.disposed = true;
    this.loadGeneration += 1;
    this.backgroundTexture?.dispose();
    this.backgroundTexture = null;
    this.loadingUrl = null;
    this.fallbackTarget?.dispose();
    this.fallbackTarget = null;
    this.hdriTarget?.dispose();
    this.hdriTarget = null;
    this.texture = null;
    this.pmrem.dispose();
  }
}
