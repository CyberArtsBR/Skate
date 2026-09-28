import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#game-stage')?.classList.contains('is-ready'));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.rider));

const state = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  const canvas = document.querySelector('#game-canvas');
  const hud = document.querySelector('.halfpipe-hud');
  return {
    title: document.title,
    stageReady: document.querySelector('#game-stage').classList.contains('is-ready'),
    canvasOpacity: getComputedStyle(canvas).opacity,
    loadingDisplay: getComputedStyle(document.querySelector('#loading-state')).display,
    score: hud.querySelector('[data-score]').textContent,
    time: hud.querySelector('[data-time]').textContent,
    hudText: hud.innerText.replace(/\s+/g, ' ').trim(),
    backgroundAsset: foundation.background.element.dataset.assetUrl,
    backgroundImage: getComputedStyle(document.querySelector('.background-plate')).backgroundImage,
    backgroundDimensions: [
      foundation.background.state.naturalWidth,
      foundation.background.state.naturalHeight,
    ],
    hiddenGroundNodes: foundation.halfpipe.hiddenGroundNodes,
    wheelCount: foundation.rider.skateboard.wheels.length,
    rigCapabilities: foundation.rider.chimpion.rigAdapter.capabilities,
    groundMaterial: foundation.ground.ground.material.type,
    groundDepthWrite: foundation.ground.ground.material.depthWrite,
    groundGridVisible: foundation.ground.grid.visible,
    cameraPosition: foundation.camera.position.toArray(),
    cameraRoll: foundation.camera.rotation.z,
    renderer: canvas.getContext('webgl2') ? 'webgl2' : 'webgl',
  };
});

await page.screenshot({
  path: path.resolve('docs/background-integration-preview.png'),
  fullPage: true,
});

await page.keyboard.press('d');
const profileDebugVisible = await page.evaluate(
  () => window.__HALFPIPE_FOUNDATION__.profileDebug.root.visible,
);
await page.keyboard.press('d');

await browser.close();

assert.equal(state.stageReady, true);
assert.equal(state.canvasOpacity, '1');
assert.equal(state.loadingDisplay, 'none');
assert.equal(state.score, '0');
assert.equal(state.time, '1:15');
assert.equal(state.backgroundAsset, '/images/backgrounds/urban-sports-beach.jpg');
assert.ok(state.backgroundImage.includes('urban-sports-beach.jpg'));
assert.ok(state.backgroundDimensions[0] >= 1600);
assert.ok(state.backgroundDimensions[1] >= 900);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] > 1.76);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] < 1.8);
assert.equal(state.wheelCount, 4);
assert.equal(state.rigCapabilities.gameplayFoundation, true);
assert.equal(state.groundMaterial, 'ShadowMaterial');
assert.equal(state.groundDepthWrite, false);
assert.equal(state.groundGridVisible, false);
assert.equal(state.cameraPosition[0], 0);
assert.ok(Math.abs(state.cameraRoll) < 1e-8);
assert.equal(profileDebugVisible, true);
assert.ok(state.hiddenGroundNodes.includes('halfpipe-ground_Baked_1'));
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedRequests, []);

console.log(JSON.stringify({ state, consoleErrors, pageErrors, failedRequests }, null, 2));
