import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(request.method() + ' ' + request.url() + ': ' + (request.failure()?.errorText || 'failed'));
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#game-stage')?.classList.contains('is-ready'));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.halfpipe?.model));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.rider?.chimpion?.model));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.background?.state?.naturalWidth));

async function layoutProbe() {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      const box = element?.getBoundingClientRect();
      return box ? {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
        opacity: Number(getComputedStyle(element).opacity),
      } : null;
    };
    return {
      viewport: [window.innerWidth, window.innerHeight],
      stage: rect('#game-stage'),
      canvas: rect('#game-canvas'),
      background: rect('.background-plate'),
      hud: rect('.halfpipe-hud'),
      backgroundImage: getComputedStyle(document.querySelector('.background-plate')).backgroundImage,
      backgroundAsset: window.__HALFPIPE_FOUNDATION__.background.element.dataset.assetUrl,
      session: window.__HALFPIPE_FOUNDATION__.session.snapshot(),
      hasHalfpipe: Boolean(window.__HALFPIPE_FOUNDATION__.halfpipe?.model),
      hasRider: Boolean(window.__HALFPIPE_FOUNDATION__.rider?.chimpion?.model),
    };
  });
}

function assertFullscreenLayout(probe, label) {
  const [width, height] = probe.viewport;
  for (const [name, box] of [
    ['stage', probe.stage],
    ['canvas', probe.canvas],
  ]) {
    assert.ok(box, label + ': missing ' + name);
    assert.ok(Math.abs(box.x) < 1 && Math.abs(box.y) < 1, label + ': ' + name + ' must start at viewport origin');
    assert.ok(Math.abs(box.width - width) < 1, label + ': ' + name + ' width must fill viewport');
    assert.ok(Math.abs(box.height - height) < 1, label + ': ' + name + ' height must fill viewport');
  }

  const background = probe.background;
  assert.ok(background, label + ': missing background');
  assert.ok(
    background.x <= 0.5
      && background.y <= 0.5
      && background.x + background.width >= width - 0.5
      && background.y + background.height >= height - 0.5,
    label + ': background must cover the full viewport without exposing side bars',
  );

  assert.ok(probe.canvas.opacity > 0.99, label + ': canvas must be visible');
  assert.notEqual(probe.hud?.display, 'none', label + ': HUD must be visible');
  assert.notEqual(probe.hud?.visibility, 'hidden', label + ': HUD must be visible');
}

const initial = await layoutProbe();
assert.equal(initial.hasHalfpipe, true);
assert.equal(initial.hasRider, true);
assert.ok(initial.backgroundImage && initial.backgroundImage !== 'none');
assert.equal(initial.backgroundAsset, '/images/backgrounds/halfpipe-chimpions-merch.jpg');
assert.equal(initial.session.phase, 'ready');
assertFullscreenLayout(initial, '1600x900');

await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'running');
const runningStart = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot());
await page.waitForTimeout(350);
const runningLater = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot());
assert.ok(runningLater.remaining < runningStart.remaining, 'session timer must progress after start');

await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'paused');
const pausedStart = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
await page.waitForTimeout(250);
const pausedLater = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
assert.ok(Math.abs(pausedLater - pausedStart) < 0.001, 'timer must not progress while paused');

await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'running');
await page.waitForTimeout(250);
const resumed = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
assert.ok(resumed < pausedLater, 'timer must resume after pause');

await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'ready');
const reset = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  return {
    session: foundation.session.snapshot(),
    simulation: foundation.simulation.snapshot(),
    camera: foundation.cameraController.snapshot(),
  };
});
assert.equal(reset.session.score, 0);
assert.equal(reset.session.phase, 'ready');
assert.ok(Math.abs(reset.session.remaining - 75) < 0.001);
assert.equal(reset.simulation.mode, 'contact');
assert.equal(reset.camera.dynamicActive, false);
assert.equal(reset.camera.verticalShift, 0);

for (const viewport of [
  { width: 2560, height: 1080, label: '21:9' },
  { width: 1280, height: 960, label: '4:3' },
]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(100);
  assertFullscreenLayout(await layoutProbe(), viewport.label);
}

const webglResilience = await page.evaluate(() => {
  const canvas = document.querySelector('#game-canvas');
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  const recoveryExposed = typeof window.__HALFPIPE_FOUNDATION__?.recoverWebGL === 'function'
    || Boolean(document.querySelector('[data-webgl-recovery]'));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  return {
    lostPrevented: lost.defaultPrevented,
    recoveryExposed,
  };
});

await browser.close();

assert.equal(webglResilience.lostPrevented, true, 'webglcontextlost must be preventDefault() protected');
assert.equal(webglResilience.recoveryExposed, true, 'runtime must expose a WebGL recovery/reload path');
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedRequests, []);

console.log(JSON.stringify({
  initial,
  runningStart,
  runningLater,
  reset,
  webglResilience,
  consoleErrors,
  pageErrors,
  failedRequests,
}, null, 2));
