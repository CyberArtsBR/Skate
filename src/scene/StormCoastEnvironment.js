import * as THREE from 'three';
import { quality as defaultQuality } from '../graphics/RenderQualityManager.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

const MAX_RAIN = 960;

// Fixed scenery layout: random variation is authored once, never tied to score,
// simulation, or contact. Everything in this group is presentation only.
function seededRandom(seed = 2709) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function material(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const skyVertex = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = `
  uniform float uTime;
  uniform float uLightning;
  uniform float uParallax;
  varying vec3 vDirection;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float cloudNoise(vec2 p) {
    float n = noise(p) * 0.55;
    n += noise(p * 2.13 + 7.4) * 0.27;
    n += noise(p * 4.57 + 18.2) * 0.12;
    n += noise(p * 9.23 + 31.0) * 0.06;
    return n;
  }
  void main() {
    vec3 d = normalize(vDirection);
    float up = clamp(d.y, 0.0, 1.0);
    vec3 horizon = vec3(0.19, 0.26, 0.29);
    vec3 zenith = vec3(0.026, 0.054, 0.080);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.68, up));
    float coastLight = exp(-pow((d.x + 0.42) * 2.1, 2.0))
      * exp(-pow((d.y - 0.025) * 10.0, 2.0));
    color += vec3(0.15, 0.092, 0.042) * coastLight;
    vec2 p = d.xz / max(0.20, d.y + 0.35) * 2.9;
    p += vec2(uTime * 0.006 + uParallax, uTime * 0.002);
    float cloud = cloudNoise(p);
    float bank = smoothstep(0.35, 0.76, cloud);
    color = mix(color, vec3(0.042, 0.070, 0.095), bank * 0.64);
    float silver = smoothstep(0.65, 0.92, cloud)
      * exp(-pow((d.y - 0.14) * 3.0, 2.0));
    color += vec3(0.033, 0.043, 0.045) * silver;
    color += vec3(0.07, 0.085, 0.11) * uLightning
      * exp(-pow((d.x + 0.45) * 2.4, 2.0));
    color = mix(vec3(0.042, 0.072, 0.081), color, smoothstep(-0.10, 0.06, d.y));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const oceanVertex = `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    p.z += sin(p.x * 0.28 + uTime * 0.60) * 0.045
      + sin(p.y * 0.35 - uTime * 0.48) * 0.032;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const oceanFragment = `
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    float ripple = sin(vWorld.z * 3.6 + sin(vWorld.x * 0.32) + uTime * 0.8);
    ripple += sin(vWorld.z * 7.1 + vWorld.x * 0.43 - uTime * 0.53) * 0.38;
    float reflection = exp(-pow((vWorld.x + 20.0) / 16.0, 2.0));
    float distant = 1.0 - smoothstep(-106.0, -16.0, vWorld.z);
    vec3 water = mix(vec3(0.025, 0.080, 0.096), vec3(0.10, 0.18, 0.20), distant);
    water += vec3(0.022, 0.039, 0.042) * ripple;
    water += vec3(0.105, 0.074, 0.032) * reflection
      * smoothstep(0.3, 1.0, ripple) * (0.3 + distant * 0.7);
    gl_FragColor = vec4(max(water, vec3(0.01)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const rainVertex = `
  uniform float uTime;
  uniform float uMotion;
  attribute vec4 aRainSeed;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv;
    float fall = mod(aRainSeed.y - uTime * (13.0 + aRainSeed.w * 6.0), 28.0);
    vec3 p = position;
    p.x *= 0.70 + aRainSeed.w * 0.65;
    p.y *= 0.50 + aRainSeed.w * 0.50;
    p.x += aRainSeed.x + (28.0 - fall) * 0.085 * uMotion;
    p.y += fall;
    p.z += aRainSeed.z;
    vFade = smoothstep(0.0, 1.2, fall) * (1.0 - smoothstep(26.0, 28.0, fall))
      * (0.18 + aRainSeed.w * 0.12);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const rainFragment = `
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float width = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.8);
    float taper = sin(vUv.y * 3.14159265);
    gl_FragColor = vec4(vec3(0.36, 0.52, 0.58), width * taper * vFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class StormCoastEnvironment {
  constructor(scene, { ramp, quality = defaultQuality } = {}) {
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'storm-coast-environment';
    this.root.userData.visualOnly = true;
    this.root.visible = false;
    this.disposed = false;
    this._time = 0;
    this._parallax = 0;
    this._lightningCycle = -1;
    this._lightningAge = Infinity;
    this._random = seededRandom();
    this._transform = new THREE.Object3D();
    const suppliedBounds = ramp?.ridingSurfaceBounds?.isBox3
      ? ramp.ridingSurfaceBounds : ramp?.bounds;
    this.bounds = suppliedBounds?.isBox3 && !suppliedBounds.isEmpty()
      ? suppliedBounds.clone()
      : new THREE.Box3(new THREE.Vector3(-8, 0, -4), new THREE.Vector3(8, 6.62, 4));
    this.centerX = (this.bounds.min.x + this.bounds.max.x) * 0.5;
    this.halfWidth = Math.max(8, (this.bounds.max.x - this.bounds.min.x) * 0.5);
    this.materials = {
      concrete: material(0x435a60, 0.42),
      seams: material(0x253e43, 0.84),
      cliff: material(0x344a4c, 0.96),
      farRock: material(0x5c7479, 1),
      middleRock: material(0x3e5d64, 1),
      grass: material(0x283f3c, 0.96),
      house: material(0x667678, 0.86),
      roof: material(0x3b555b, 0.89),
      wood: material(0x3d4c46, 0.9),
      leaves: material(0x234443, 0.88),
      metal: material(0x3a525b, 0.55, 0.55),
      windows: new THREE.MeshStandardMaterial({ color: 0xba8a48,
        emissive: 0xc5944f, emissiveIntensity: 0.35, roughness: 0.65 }),
      lamps: new THREE.MeshStandardMaterial({ color: 0xffd28a,
        emissive: 0xffbf6e, emissiveIntensity: 1.25, roughness: 0.4 }),
    };
    this._buildSky();
    this._buildCoast();
    this._buildPromenade();
    this._buildRain();
    this._buildLightning();
    scene.add(this.root);
    this._unregisterQuality = quality?.registerObject?.(this.root);
    this._unsubscribeQuality = quality?.subscribe?.(() => this._applyQuality());
    this._applyQuality();
    this._motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  }

  _instance(geometry, finish, transforms, parent, name) {
    const mesh = new THREE.InstancedMesh(geometry, finish, transforms.length);
    mesh.name = name;
    mesh.receiveShadow = true;
    for (let index = 0; index < transforms.length; index += 1) {
      const { p, s = [1, 1, 1], r = [0, 0, 0] } = transforms[index];
      this._transform.position.fromArray(p);
      this._transform.scale.fromArray(s);
      this._transform.rotation.fromArray(r);
      this._transform.updateMatrix();
      mesh.setMatrixAt(index, this._transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    parent.add(mesh);
    return mesh;
  }

  _buildSky() {
    this.skyMaterial = new THREE.ShaderMaterial({ name: 'storm-cloud-dome',
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uLightning: { value: 0 }, uParallax: { value: 0 } },
      vertexShader: skyVertex, fragmentShader: skyFragment });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(130, 32, 16), this.skyMaterial);
    dome.name = 'storm-sky-with-coastal-horizon';
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.root.add(dome);
  }

  _buildCoast() {
    this.farLayer = new THREE.Group();
    this.farLayer.name = 'far-headlands-parallax';
    this.middleLayer = new THREE.Group();
    this.middleLayer.name = 'coastal-town-parallax';
    this.root.add(this.farLayer, this.middleLayer);
    const random = this._random;
    const distantRocks = [];
    const middleRocks = [];
    for (let i = 0; i < 13; i += 1) distantRocks.push({
      p: [-83 + i * 13 + random() * 4, -0.8, -96 - random() * 11],
      s: [12 + random() * 11, 4 + random() * 8, 5 + random() * 5],
      r: [0, random(), random() * 0.15 - 0.075],
    });
    for (let i = 0; i < 8; i += 1) middleRocks.push({
      p: [-54 + i * 15, -2.5, -62 - random() * 10],
      s: [7 + random() * 8, 4 + random() * 8, 5 + random() * 6],
      r: [0, random() * 2, 0],
    });
    const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
    this._instance(rockGeometry, this.materials.farRock, distantRocks, this.farLayer, 'distant-coast-ridges');
    this._instance(rockGeometry, this.materials.middleRock, middleRocks, this.middleLayer, 'islands-and-headlands');
    this._instance(new THREE.SphereGeometry(1, 12, 7), this.materials.cliff,
      [-29, 0, 29].map(x => ({ p: [x, -4.7, -54], s: [31, 2.3, 11] })),
      this.middleLayer, 'low-coastal-town-peninsula');

    this.oceanMaterial = new THREE.ShaderMaterial({ name: 'storm-ocean-reflection',
      uniforms: { uTime: { value: 0 } }, vertexShader: oceanVertex, fragmentShader: oceanFragment });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(240, 150, 80, 42), this.oceanMaterial);
    ocean.name = 'coastal-ocean';
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -3.6, -70);
    this.root.add(ocean);

    // The far town is deliberately small and beyond the deck/flight corridor.
    const houses = [], roofs = [], windows = [], trees = [];
    for (let i = 0; i < 32; i += 1) {
      const x = -48 + i * 2.8 + random() * 0.9;
      const z = -50 - random() * 9;
      const height = 1.1 + random() * 3.8;
      const width = 1.1 + random() * 1.3;
      houses.push({ p: [x, -2.4 + height / 2, z], s: [width, height, 1.8] });
      roofs.push({ p: [x, -2.4 + height + 0.27, z],
        s: [width * 0.86, 0.55, 1.6], r: [0, Math.PI / 4, 0] });
      for (let row = 0; row < Math.min(3, Math.floor(height)); row += 1) {
        windows.push({ p: [x - width * 0.22, -1.7 + row * 0.84, z + 0.92], s: [0.25, 0.38, 1] });
        if (random() > 0.35) windows.push({ p: [x + width * 0.22, -1.7 + row * 0.84, z + 0.92],
          s: [0.25, 0.38, 1] });
      }
      if (i % 3 === 0) trees.push({ p: [x - 1.2, -0.7, z + 1.6], s: [0.8, 1.6, 0.8] });
    }
    this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.house, houses, this.middleLayer, 'coastal-town-buildings');
    this._instance(new THREE.ConeGeometry(1, 1, 4), this.materials.roof, roofs, this.middleLayer, 'coastal-town-roofs');
    this._instance(new THREE.PlaneGeometry(1, 1), this.materials.windows, windows, this.middleLayer, 'quiet-warm-town-windows');
    this._instance(new THREE.ConeGeometry(1, 1, 7), this.materials.grass, trees, this.middleLayer, 'town-cypress-silhouettes');

    const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.65, 5.5, 10), this.materials.house);
    lighthouse.name = 'headland-lighthouse';
    lighthouse.position.set(-35, 3.25, -63);
    this.middleLayer.add(lighthouse);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10), this.materials.lamps);
    lantern.name = 'lighthouse-lantern';
    lantern.position.set(-35, 6.25, -63);
    lantern.userData.emissiveBloom = true;
    this.middleLayer.add(lantern);
    this._instance(rockGeometry, this.materials.middleRock,
      [{ p: [-35, -2.4, -63], s: [3.5, 3.0, 4.0] }], this.middleLayer, 'lighthouse-headland-base');
  }

  _buildPromenade() {
    const minZ = this.bounds.min.z;
    const maxZ = this.bounds.max.z;
    const centerX = this.centerX;
    const width = this.halfWidth * 2;
    const groundY = Math.min(0, this.bounds.min.y) - 0.10;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 16, 0.16, 10), this.materials.concrete);
    slab.name = 'wet-coastal-back-apron';
    slab.position.set(centerX, groundY, minZ - 5.1);
    slab.receiveShadow = true;
    this.root.add(slab);
    const front = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.16, 3), this.materials.concrete);
    front.name = 'wet-coastal-front-apron';
    front.position.set(centerX, groundY, maxZ + 1.6);
    front.receiveShadow = true;
    this.root.add(front);

    const blocks = [], posts = [], rails = [], lampPoles = [], lamps = [], trunks = [], fronds = [];
    for (const side of [-1, 1]) {
      const edgeX = centerX + side * (this.halfWidth + 4.8);
      blocks.push({ p: [edgeX, -2.0, minZ - 4.5], s: [6, 3.7, 13] });
      for (let i = 0; i < 7; i += 1) posts.push({ p: [edgeX, 0.65, minZ - 9 + i * 1.45],
        s: [0.085, 1.35, 0.085] });
      for (const y of [0.7, 1.15]) rails.push({ p: [edgeX, y, minZ - 4.65], s: [0.055, 0.055, 8.8] });
      for (let i = 0; i < 2; i += 1) {
        const x = edgeX + side * (1.2 + i * 0.8);
        const z = minZ - 1.4 - i * 6;
        lampPoles.push({ p: [x, 2.5, z], s: [0.10, 5.0, 0.10] });
        lamps.push({ p: [x, 5.0, z], s: [0.45, 0.14, 0.36] });
      }
      for (let i = 0; i < 3; i += 1) {
        const x = edgeX + side * (3.1 + i * 1.7);
        const z = minZ - 6.5 - i * 3.2;
        const height = 5.8 + i * 0.9;
        trunks.push({ p: [x, height * 0.5, z], s: [0.18, height, 0.18], r: [0, 0, side * -0.06] });
        for (let leaf = 0; leaf < 7; leaf += 1) {
          const angle = leaf / 7 * Math.PI * 2;
          fronds.push({ p: [x + Math.cos(angle) * 0.85, height - 0.05, z + Math.sin(angle) * 0.85],
            s: [0.35, 0.1, 2.3], r: [0.16, -angle + Math.PI / 2, 0] });
        }
      }
    }
    this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.cliff, blocks, this.root, 'promenade-retaining-cliffs');
    this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.metal, posts, this.root, 'coast-edge-fence-posts');
    this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.metal, rails, this.root, 'coast-edge-fence-rails');
    const poles = this._instance(new THREE.CylinderGeometry(1, 1, 1, 7), this.materials.metal, lampPoles, this.root, 'promenade-lamp-poles');
    poles.castShadow = true;
    const bulbs = this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.lamps, lamps, this.root, 'warm-promenade-lamps');
    bulbs.userData.emissiveBloom = true;
    const palmTrunks = this._instance(new THREE.CylinderGeometry(0.65, 1, 1, 7), this.materials.wood, trunks, this.root, 'wind-shaped-palm-trunks');
    palmTrunks.castShadow = true;
    const palmLeaves = this._instance(new THREE.SphereGeometry(1, 7, 4), this.materials.leaves, fronds, this.root, 'coastal-palm-fronds');
    palmLeaves.castShadow = true;

    const seams = [];
    for (let i = 0; i < 8; i += 1) seams.push({ p: [centerX - width / 2 - 5 + i * 4.0,
      groundY + 0.082, minZ - 5.1], s: [0.028, 0.006, 10] });
    this._instance(new THREE.BoxGeometry(1, 1, 1), this.materials.seams, seams, this.root, 'wet-apron-slab-seams');
  }

  _buildRain() {
    const geometry = new THREE.PlaneGeometry(0.022, 0.85);
    const seeds = new Float32Array(MAX_RAIN * 4);
    for (let i = 0; i < MAX_RAIN; i += 1) {
      seeds[i * 4] = this.centerX + (this._random() - 0.5) * 62;
      seeds[i * 4 + 1] = this._random() * 28;
      seeds[i * 4 + 2] = -18 + this._random() * 34;
      seeds[i * 4 + 3] = this._random();
    }
    geometry.setAttribute('aRainSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    this.rainMaterial = new THREE.ShaderMaterial({ name: 'soft-storm-rain-streaks',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uMotion: { value: 1 } },
      vertexShader: rainVertex, fragmentShader: rainFragment });
    this.rain = new THREE.InstancedMesh(geometry, this.rainMaterial, MAX_RAIN);
    this.rain.name = 'bounded-soft-storm-rain';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 30;
    // Atmospheric shaders belong only in the base image, never glow extraction.
    this.rain.userData.bloomExclude = true;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < MAX_RAIN; i += 1) this.rain.setMatrixAt(i, identity);
    this.root.add(this.rain);
  }

  _buildLightning() {
    const points = [new THREE.Vector3(-45, 27, -100), new THREE.Vector3(-46.4, 23, -100),
      new THREE.Vector3(-43.8, 20.7, -100), new THREE.Vector3(-47.1, 17.7, -100),
      new THREE.Vector3(-46.0, 14.3, -100), new THREE.Vector3(-49.0, 10, -100)];
    const positions = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i], b = points[i + 1];
      const width = 0.035;
      positions.push(a.x - width, a.y, a.z, a.x + width, a.y, a.z, b.x + width, b.y, b.z,
        a.x - width, a.y, a.z, b.x + width, b.y, b.z, b.x - width, b.y, b.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.lightningMaterial = new THREE.MeshBasicMaterial({ color: 0x9bb9ce,
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    this.lightning = new THREE.Mesh(geometry, this.lightningMaterial);
    this.lightning.name = 'distant-single-lightning-outline';
    this.lightning.visible = false;
    this.farLayer.add(this.lightning);
  }

  _applyQuality() {
    const density = Number(this.quality?.vfxScale) || 1;
    this.rain.count = Math.round(THREE.MathUtils.clamp(620 * density, 320, MAX_RAIN));
  }

  setVisible(visible) {
    if (this.disposed) return;
    this.root.visible = Boolean(visible);
    if (!visible) {
      this.lightning.visible = false;
      this._lightningAge = Infinity;
      this.skyMaterial.uniforms.uLightning.value = 0;
    }
  }

  update(dt, { riderX = 0, elapsed = 0, reducedMotion = false } = {}) {
    if (this.disposed || !this.root.visible) return;
    const delta = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.1);
    this._time += delta;
    const time = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : this._time;
    const reduce = Boolean(reducedMotion || this._motionQuery?.matches);
    const target = reduce ? 0 : THREE.MathUtils.clamp(
      ((Number(riderX) || 0) - this.centerX) / this.halfWidth, -1, 1);
    this._parallax = THREE.MathUtils.lerp(this._parallax, target, 1 - Math.exp(-2.2 * delta));
    this.farLayer.position.x = -this._parallax * 0.18;
    this.middleLayer.position.x = -this._parallax * 0.66;
    this.skyMaterial.uniforms.uParallax.value = this._parallax * 0.012;
    this.skyMaterial.uniforms.uTime.value = reduce ? 0 : time;
    this.oceanMaterial.uniforms.uTime.value = reduce ? 0 : time;
    this.rainMaterial.uniforms.uTime.value = time * (reduce ? 0.35 : 1);
    this.rainMaterial.uniforms.uMotion.value = reduce ? 0 : 1;
    this.rain.count = Math.round(THREE.MathUtils.clamp(
      620 * (Number(this.quality?.vfxScale) || 1) * (reduce ? 0.38 : 1), 120, MAX_RAIN));

    // One slow, low-contrast distant discharge every 29 seconds. No light,
    // exposure flash, camera shake, repeated flicker, or flash in reduced motion.
    const cycle = Math.floor((time + 11) / 29);
    if (reduce) {
      this._lightningCycle = cycle;
      this._lightningAge = Infinity;
    } else if (cycle > this._lightningCycle) {
      this._lightningCycle = cycle;
      this._lightningAge = time > 12 ? 0 : Infinity;
    }
    this._lightningAge += delta;
    const age = this._lightningAge;
    const strength = age < 2.0 ? Math.sin(Math.PI * age / 2.0) * 0.20 : 0;
    this.lightning.visible = strength > 0.002;
    this.lightningMaterial.opacity = strength;
    this.skyMaterial.uniforms.uLightning.value = strength;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._unsubscribeQuality?.();
    this._unregisterQuality?.();
    this._unsubscribeQuality = null;
    this._unregisterQuality = null;
    this.root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    disposeObject3D(this.root);
    this.root.removeFromParent();
    this._motionQuery = null;
  }
}
