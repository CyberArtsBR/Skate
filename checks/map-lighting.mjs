import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GRAPHICS_PRESETS } from '../src/graphics/GraphicsQuality.js';
import { getMapLightingProfile, MAP_LIGHTING_PROFILES } from '../src/graphics/MapLightingProfiles.js';
import { quality } from '../src/graphics/RenderQualityManager.js';
import { createLighting } from '../src/scene/createLighting.js';

const expectedLighting = {
  skyColor: 0xdce8f5, groundColor: 0x65616a,
  keyColor: 0xfff0dc, fillColor: 0xc3d9ef,
  keyPosition: [0, 20, 0], fillPosition: [10, 10, -8],
  hemisphereFactor: 0.85, keyFactor: 0.85, fillFactor: 1.15,
  environmentFactor: 0.8, exposureFactor: 0.98, environmentRotationY: 0,
};
const expectedAtmosphere = {
  'the-gym': [0x202933, 0.18], japan: [0xb9d6e9, 0.12],
  'canyon-session': [0xd3c2a8, 0.6], 'skate-park': [0xc7dce8, 0.7],
  space: [0x343e60, 0.2], city: [0xc4d7d4, 1],
  'tree-house': [0xbbcbb8, 1.05], 'cyber-night': [0x414760, 0.68],
};
assert.equal(Object.keys(MAP_LIGHTING_PROFILES).length, 8);
assert.equal(getMapLightingProfile('unknown-map'), MAP_LIGHTING_PROFILES.city);
for (const [mapId, profile] of Object.entries(MAP_LIGHTING_PROFILES)) {
  const { fogColor, fogFactor, ...lightingProfile } = profile;
  assert.deepEqual(lightingProfile, expectedLighting, `${mapId}: use exact Gym lighting`);
  assert.deepEqual([fogColor, fogFactor], expectedAtmosphere[mapId],
    `${mapId}: retain atmosphere without replacing backgrounds or fog`);
  assert.ok(!Object.hasOwn(profile, 'environmentIntensity'),
    `${mapId}: map intensity must not bypass the Gym/preset reflection factor`);
}

// Evaluate the actual runtime map definitions without importing their browser
// UI/CSS dependencies. Reflection source must match Gym as well as its factors.
const mapSource = readFileSync(new URL('../src/v18/installHalfpipeV18Patches.js', import.meta.url), 'utf8');
const mapDefinitions = mapSource.slice(mapSource.indexOf('const BASE_ENVIRONMENT ='),
  mapSource.indexOf('const STORAGE =')).replace('export const HALFPIPE_MAPS', 'const HALFPIPE_MAPS');
assert.ok(mapDefinitions.includes('const HALFPIPE_MAPS'), 'inspect the real runtime map table');
const runtimeMaps = runInNewContext(`${mapDefinitions}; HALFPIPE_MAPS`, {
  MAP_IMAGES: new Proxy({}, { get: (_target, key) => String(key) }),
});
const gymMap = runtimeMaps.find(map => map.id === 'the-gym');
assert.ok(gymMap?.environmentUrl, 'Gym must provide the shared reflection source');
assert.equal(runtimeMaps.length, 8);
for (const map of runtimeMaps) {
  assert.equal(map.environmentUrl, gymMap.environmentUrl,
    `${map.id}: use the same reflection source, not only the Gym intensity`);
  assert.ok(MAP_LIGHTING_PROFILES[map.id], `${map.id}: reflection and direct-light maps must agree`);
}
const japanMap = runtimeMaps.find(map => map.id === 'japan');
assert.equal(japanMap.backgroundEnvironmentUrl, '/hdri/japan-sunset-1k.exr',
  'Japan must retain the separate authored sunset backdrop');
assert.equal(japanMap.backgroundRotationY, 0.5, 'Japan backdrop keeps its original orientation');
assert.notEqual(japanMap.backgroundEnvironmentUrl, japanMap.environmentUrl,
  'Japan visible sky must not replace the shared lighting source');

// Exercise the real backdrop loader with deferred EXR loads. A late Japan load
// must never paint over another map, even if Japan is selected again meanwhile.
const backgroundSource = mapSource.slice(mapSource.indexOf('let installed = false;'),
  mapSource.indexOf('const readStored ='));
assert.ok(backgroundSource.includes('function replaceMapBackground'),
  'inspect the runtime background separation, not a duplicate implementation');
const skyLoads = [];
const backgroundScene = { environment: 'Gym IBL', environmentRotation: { y: 0 },
  backgroundRotation: { y: 0 }, background: null };
const backgroundFoundation = { activeMap: japanMap,
  setEnvironmentBackground(texture) { backgroundScene.background = texture; } };
class DeferredEXRLoader {
  loadAsync(url) {
    return new Promise(resolve => skyLoads.push({ url, resolve }));
  }
}
const replaceBackground = runInNewContext(`${backgroundSource}; replaceMapBackground`, {
  EXRLoader: DeferredEXRLoader,
  EquirectangularReflectionMapping: THREE.EquirectangularReflectionMapping,
  quality: { scene: backgroundScene }, console,
});
const makeSkyTexture = () => ({ disposed: 0, dispose() { this.disposed += 1; } });
replaceBackground(backgroundFoundation, japanMap);
const spaceMap = runtimeMaps.find(map => map.id === 'space');
backgroundFoundation.activeMap = spaceMap;
replaceBackground(backgroundFoundation, spaceMap);
const staleSky = makeSkyTexture();
skyLoads[0].resolve(staleSky);
await Promise.resolve();
assert.equal(staleSky.disposed, 1, 'unused Japan sky must be disposed after a map switch');
assert.equal(backgroundScene.background, null, 'late Japan sky must not replace Space artwork');

backgroundFoundation.activeMap = japanMap;
replaceBackground(backgroundFoundation, japanMap);
replaceBackground(backgroundFoundation, japanMap);
const olderJapanSky = makeSkyTexture();
skyLoads[1].resolve(olderJapanSky);
await Promise.resolve();
assert.equal(olderJapanSky.disposed, 1, 'generation guard must also handle repeated Japan selections');
const visibleJapanSky = makeSkyTexture();
skyLoads[2].resolve(visibleJapanSky);
await Promise.resolve();
assert.equal(backgroundScene.background, visibleJapanSky);
assert.equal(visibleJapanSky.mapping, THREE.EquirectangularReflectionMapping);
assert.equal(backgroundScene.backgroundRotation.y, 0.5);
assert.equal(backgroundScene.environment, 'Gym IBL', 'sky must never become the lighting source');
assert.equal(backgroundScene.environmentRotation.y, 0, 'background rotation must not rotate Gym IBL');
assert.ok(skyLoads.every(load => load.url === japanMap.backgroundEnvironmentUrl));
backgroundFoundation.activeMap = spaceMap;
backgroundScene.background = null; // setArenaMap clears the old sky first.
replaceBackground(backgroundFoundation, spaceMap);
assert.equal(visibleJapanSky.disposed, 1, 'previously visible sky must be released when no longer used');

// Run the actual asynchronous map application too. A photographic background
// can be awaiting decode after the arena has cleared Japan's sky, while activeMap
// still says Japan. Its old EXR load must already have been invalidated then.
const applicationSource = mapSource.slice(mapSource.indexOf('async function applyMapToRuntime('),
  mapSource.indexOf('function resolveRandomSelections('));
assert.ok(applicationSource.includes('await foundation.background'),
  'exercise the real map transition and its photo-background await');
const defer = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const photoDecode = defer();
const photoStarted = defer();
const transitionSkyLoads = [];
const transitionScene = { environment: 'Gym IBL', environmentRotation: { y: 0 },
  backgroundRotation: { y: 0 }, background: null, clearAlpha: 1 };
let photoLoadStarted = false;
const transitionFoundation = {
  activeMap: japanMap,
  async setArenaMap() { transitionScene.background = null; transitionScene.clearAlpha = 0; },
  background: {
    setImage() { photoLoadStarted = true; photoStarted.resolve(); return photoDecode.promise; },
  },
  setEnvironmentBackground(texture) {
    transitionScene.background = texture;
    transitionScene.clearAlpha = 1;
  },
};
const transitionState = { applyingMap: false, mapMode: 'explicit' };
class TransitionEXRLoader {
  loadAsync(url) {
    return new Promise(resolve => transitionSkyLoads.push({ url, resolve }));
  }
}
const transitionRuntime = runInNewContext(`${backgroundSource}; ${applicationSource};
  ({ replaceMapBackground, applyMapToRuntime })`, {
  EXRLoader: TransitionEXRLoader,
  EquirectangularReflectionMapping: THREE.EquirectangularReflectionMapping,
  quality: { scene: transitionScene }, console, HALFPIPE_MAPS: runtimeMaps,
  window: { __HALFPIPE_FOUNDATION__: transitionFoundation },
  ensureState: () => transitionState,
});
const screen = { setBusy() {} };
transitionRuntime.replaceMapBackground(transitionFoundation, japanMap);
const transitioningToSpace = transitionRuntime.applyMapToRuntime(screen, spaceMap);
await photoStarted.promise;
assert.equal(photoLoadStarted, true, 'the transition must be paused at photo decode');
assert.equal(transitionFoundation.activeMap.id, 'japan', 'old map id reproduces the race window');
const lateTransitionSky = makeSkyTexture();
transitionSkyLoads[0].resolve(lateTransitionSky);
await Promise.resolve();
assert.equal(lateTransitionSky.disposed, 1, 'invalidate pending Japan sky before the first map await');
assert.equal(transitionScene.background, null, 'late Japan sky must not reappear during photo decode');
assert.equal(transitionScene.clearAlpha, 0, 'late sky must not hide the photographic background');
photoDecode.resolve();
assert.equal(await transitioningToSpace, true);
assert.equal(transitionFoundation.activeMap.id, 'space');
assert.equal(transitionScene.background, null);
assert.equal(transitionScene.clearAlpha, 0);

// Beginning a transition must not dispose a currently displayed sky while the
// next arena is still loading. Release it only once the scene no longer uses it.
transitionFoundation.activeMap = japanMap;
transitionRuntime.replaceMapBackground(transitionFoundation, japanMap);
const heldJapanSky = makeSkyTexture();
transitionSkyLoads[1].resolve(heldJapanSky);
await Promise.resolve();
assert.equal(transitionScene.background, heldJapanSky);
const arenaLoad = defer();
transitionFoundation.setArenaMap = () => arenaLoad.promise.then(() => {
  transitionScene.background = null;
  transitionScene.clearAlpha = 0;
});
transitionFoundation.background.setImage = async () => {};
const waitingForArena = transitionRuntime.applyMapToRuntime(screen, spaceMap);
assert.equal(heldJapanSky.disposed, 0, 'do not dispose a sky still displayed during arena loading');
assert.equal(transitionScene.background, heldJapanSky);
arenaLoad.resolve();
assert.equal(await waitingForArena, true);
assert.equal(heldJapanSky.disposed, 1, 'release the old sky after arena safely removed it');
assert.equal(transitionScene.background, null);

// Exercise the actual runtime light creation and quality composition without a
// GPU, including map switches after changing the user's graphics quality.
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2();
const renderer = {
  domElement: { clientWidth: 1920, clientHeight: 1080 },
  capabilities: { maxTextureSize: 4096, getMaxAnisotropy: () => 16 },
  setPixelRatio(value) { this.pixelRatio = value; },
};
const originalPreset = quality.presetName;
const originalMap = quality.mapLighting;
quality.attachRenderer(renderer, scene);
const lights = createLighting(scene);
const results = [];
try {
  for (const [presetName, preset] of Object.entries(GRAPHICS_PRESETS)) {
    quality.setPreset(presetName);
    for (const [mapId, profile] of Object.entries(MAP_LIGHTING_PROFILES)) {
      lights.setMapProfile(mapId);
      assert.equal(lights.hemisphere.color.getHex(), expectedLighting.skyColor);
      assert.equal(lights.hemisphere.groundColor.getHex(), expectedLighting.groundColor);
      assert.equal(lights.key.color.getHex(), expectedLighting.keyColor);
      assert.equal(lights.fill.color.getHex(), expectedLighting.fillColor);
      assert.deepEqual(lights.key.position.toArray(), expectedLighting.keyPosition);
      assert.deepEqual(lights.fill.position.toArray(), expectedLighting.fillPosition);
      assert.equal(lights.hemisphere.intensity, preset.lighting.hemisphere * 0.85);
      assert.equal(lights.key.intensity, preset.lighting.key * 0.85);
      assert.equal(lights.fill.intensity, preset.lighting.fill * 1.15);
      assert.equal(lights.key.castShadow, true);
      assert.equal(lights.fill.castShadow, false);
      assert.deepEqual(lights.key.target.position.toArray(), [0, 0, 0]);
      assert.equal(scene.environmentIntensity, preset.environmentIntensity * 0.8);
      assert.equal(scene.environmentRotation.y, 0);
      assert.equal(renderer.toneMappingExposure, preset.toneMappingExposure * 0.98);
      assert.equal(scene.fog.color.getHex(), profile.fogColor);
      assert.equal(scene.fog.density, preset.fogDensity * profile.fogFactor);
      results.push({ preset: presetName, map: mapId, key: lights.key.intensity,
        fill: lights.fill.intensity, environment: scene.environmentIntensity,
        exposure: renderer.toneMappingExposure });
    }
  }
} finally {
  lights.dispose();
  quality.detachRenderer(renderer);
  quality.setPreset(originalPreset);
  quality.setMapLighting(originalMap);
}
assert.equal(scene.children.length, 0, 'light disposal must leave no registered scene lights');
console.log(JSON.stringify({ checkedMaps: 8, checkedPresets: 5,
  atmospherePreserved: true, sharedEnvironment: gymMap.environmentUrl,
  japanBackdrop: japanMap.backgroundEnvironmentUrl, results }, null, 2));
