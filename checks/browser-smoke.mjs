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
    hiddenGroundNodes: foundation.halfpipe.hiddenGroundNodes,
    wheelCount: foundation.rider.skateboard.wheels.length,
    rigCapabilities: foundation.rider.chimpion.rigAdapter.capabilities,
    renderer: canvas.getContext('webgl2') ? 'webgl2' : 'webgl',
  };
});

await page.screenshot({
  path: path.resolve('docs/foundation-preview.png'),
  fullPage: true,
});

await browser.close();

assert.equal(state.stageReady, true);
assert.equal(state.canvasOpacity, '1');
assert.equal(state.loadingDisplay, 'none');
assert.equal(state.score, '0');
assert.equal(state.time, '1:15');
assert.equal(state.wheelCount, 4);
assert.equal(state.rigCapabilities.gameplayFoundation, true);
assert.ok(state.hiddenGroundNodes.includes('halfpipe-ground_Baked_1'));
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedRequests, []);

console.log(JSON.stringify({ state, consoleErrors, pageErrors, failedRequests }, null, 2));
