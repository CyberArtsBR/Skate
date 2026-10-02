// Asset production only: render the actual arena GLBs, without starting the game
// or exercising controls. Output is consumed by the map selection screen.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const workspace = resolve(fileURLToPath(new URL('../', import.meta.url)));
const outputDirectory = resolve(workspace, 'public/images/maps');
const receiptDirectory = resolve(workspace, 'artifacts/map-thumbnails');
const types = { '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.glb': 'model/gltf-binary' };

const pageSource = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#202933}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js",
"three/addons/":"/node_modules/three/examples/jsm/"}}</script></head><body>
<script type="module">
import * as THREE from 'three';
import { HalfpipeVisual } from '/src/halfpipe/HalfpipeVisual.js';
import { HalfpipeCamera } from '/src/camera/HalfpipeCamera.js';
import { createLighting } from '/src/scene/createLighting.js';
import { OutdoorEnvironment } from '/src/graphics/OutdoorEnvironment.js';
import { quality } from '/src/graphics/RenderQualityManager.js';
import { getMapLightingProfile } from '/src/graphics/MapLightingProfiles.js';
const id = new URLSearchParams(location.search).get('map');
const progress = value => console.log('[thumbnail] ' + id + ': ' + value);
progress('creating renderer');
const scene = new THREE.Scene();
scene.background = new THREE.Color(id === 'japan' ? 0xb9d6e9 : 0x202933);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(960, 540);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
quality.setPreset('high');
quality.attachRenderer(renderer, scene);
const lighting = createLighting(scene);
lighting.setMapProfile(id);
const map = new HalfpipeVisual('/models/arenas/' + id + '.glb', { fullMap: true });
progress('loading GLB');
await map.load();
progress('GLB loaded; loading local environment');
scene.add(map.root);
const environment = new OutdoorEnvironment(renderer);
await environment.setUrl(id === 'japan' ? '/hdri/japan-sunset-1k.exr' : '/hdri/piazza_martin_lutero_1k.hdr');
scene.environment = environment.build();
const profile = getMapLightingProfile(id);
scene.environmentIntensity = quality.environmentIntensity;
scene.environmentRotation.y = profile.environmentRotationY;
if (id === 'japan') {
  scene.background = environment.backgroundTexture;
  scene.backgroundIntensity = 1;
  scene.backgroundRotation.y = profile.environmentRotationY;
}
const camera = new HalfpipeCamera().camera;
camera.aspect = 960 / 540;
// Preview framing moves back to show the arena surroundings, not only the ramp.
camera.position.set(0, 9, 34);
camera.lookAt(0, 4.5, 0);
camera.updateProjectionMatrix();
map.update?.(0.1);
scene.updateMatrixWorld(true);
renderer.render(scene, camera);
progress('rendered');
window.thumbnailAsset = { dataUrl: renderer.domElement.toDataURL('image/png'),
  map: id, size: [960, 540], modelUrl: map.url,
  camera: camera.position.toArray(), target: [0, 4.5, 0] };
</script></body></html>`;

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(pageSource);
      return;
    }
    const publicAsset = /^\/(models|images|hdri)\//.test(path);
    if (!publicAsset && !/^\/(src|node_modules)\//.test(path)) throw new Error('Asset path denied');
    const base = publicAsset ? resolve(workspace, 'public') : workspace;
    const file = resolve(base, '.' + path);
    if (!file.startsWith(base + sep)) throw new Error('Asset path denied');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Asset unavailable');
  }
});

let browser;
try {
  await mkdir(receiptDirectory, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const receipts = [];
  for (const id of ['the-gym', 'japan']) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', error => console.error(id + ': ' + error.message));
    page.on('console', message => {
      if (message.text().startsWith('[thumbnail]') || message.type() === 'error') console.log(message.text());
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?map=' + id);
    await page.waitForFunction(() => Boolean(window.thumbnailAsset), null, { timeout: 120000 });
    const { dataUrl, ...receipt } = await page.evaluate(() => window.thumbnailAsset);
    const destination = resolve(outputDirectory, id + '-thumb.png');
    await writeFile(destination, Buffer.from(dataUrl.split(',')[1], 'base64'));
    receipts.push({ ...receipt, destination });
    console.log('Saved ' + destination);
    await page.close();
  }
  await writeFile(resolve(receiptDirectory, 'receipt.json'), JSON.stringify(receipts, null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
