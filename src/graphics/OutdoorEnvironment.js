import * as THREE from 'three';

const QUALITY_SEGMENTS = Object.freeze({
  low: [24, 12],
  medium: [32, 16],
  high: [48, 24],
  ultra: [64, 32],
});

export class OutdoorEnvironment {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.target = null;
    this.texture = null;
  }

  build({ quality = 'high', sigma = 0.05 } = {}) {
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

          // GLSL smoothstep requires edge0 < edge1. Preserve the old visual
          // intent (more ground toward -Y) without relying on undefined order.
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

    const previousTarget = this.target;
    this.target = nextTarget;
    this.texture = nextTarget.texture;
    previousTarget?.dispose();
    return this.texture;
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
    this.texture = null;
    this.pmrem.dispose();
  }
}
