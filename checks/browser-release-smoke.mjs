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

async function probe() {
  return page.evaluate(() => {
    const foundation = window.__HALFPIPE_FOUNDATION__;
    const rect = (selector) => {
      const element = document.querySelector(selector);
      const box = element?.getBoundingClientRect();
      return box ? {
        x: box.x, y: box.y, width: box.width, height: box.height,
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
      backgroundAsset: foundation.background.element.dataset.assetUrl,
      session: foundation.session.snapshot(),
      flow: foundation.flow.snapshot(),
      graphicsPreset: foundation.graphics.preset,
      hasHalfpipe: Boolean(foundation.halfpipe?.model),
      hasRider: Boolean(foundation.rider?.chimpion?.model),
    };
  });
}

function assertFullscreenLayout(state, label) {
  const [width, height] = state.viewport;
  for (const [name, box] of [['stage', state.stage], ['canvas', state.canvas]]) {
    assert.ok(box, label + ': missing ' + name);
    assert.ok(Math.abs(box.x) < 1 && Math.abs(box.y) < 1, label + ': ' + name + ' must start at viewport origin');
    assert.ok(Math.abs(box.width - width) < 1, label + ': ' + name + ' width must fill viewport');
    assert.ok(Math.abs(box.height - height) < 1, label + ': ' + name + ' height must fill viewport');
  }
  assert.ok(state.background, label + ': missing background');
  assert.ok(
    state.background.x <= 0.5
      && state.background.y <= 0.5
      && state.background.x + state.background.width >= width - 0.5
      && state.background.y + state.background.height >= height - 0.5,
    label + ': background must cover full viewport without pillar bars',
  );
  assert.ok(state.canvas.opacity > 0.99, label + ': canvas must be visible');
  assert.notEqual(state.hud?.display, 'none', label + ': HUD must be present');
  assert.notEqual(state.hud?.visibility, 'hidden', label + ': HUD must be visible');
}

const initial = await probe();
assert.equal(initial.hasHalfpipe, true);
assert.equal(initial.hasRider, true);
assert.ok(initial.backgroundImage && initial.backgroundImage !== 'none');
assert.equal(initial.backgroundAsset, '/images/backgrounds/halfpipe-chimpions-merch.jpg');
assert.equal(initial.session.phase, 'ready');
assert.equal(initial.flow.state, 'title');
assert.equal(initial.graphicsPreset, 'high');
assertFullscreenLayout(initial, '1600x900');

await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
try {
  await page.waitForFunction(
    () => window.__HALFPIPE_FOUNDATION__.session.phase === 'running'
      && window.__HALFPIPE_FOUNDATION__.flow.state === 'run',
    null,
    { timeout: 6000 },
  );
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    flow: window.__HALFPIPE_FOUNDATION__?.flow?.snapshot?.(),
    session: window.__HALFPIPE_FOUNDATION__?.session?.snapshot?.(),
    countdown: {
      hidden: document.querySelector('.countdown-overlay')?.hidden,
      text: document.querySelector('.countdown-label')?.textContent,
    },
    simulationRunning: window.__HALFPIPE_FOUNDATION__?.physics?.running,
  }));
  console.error('Countdown diagnostic:', JSON.stringify(diagnostic));
  throw error;
}

const runningStart = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot());
await page.waitForTimeout(350);
const runningLater = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot());
assert.ok(runningLater.remaining < runningStart.remaining, 'session timer must progress after countdown');

await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'paused');
const pausedStart = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
await page.waitForTimeout(250);
const pausedLater = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
assert.ok(Math.abs(pausedLater - pausedStart) < 0.001, 'timer must not progress while paused');

await page.keyboard.press('KeyP');
await page.waitForFunction(
  () => window.__HALFPIPE_FOUNDATION__.session.phase === 'running'
    && window.__HALFPIPE_FOUNDATION__.flow.state === 'run',
);
await page.waitForTimeout(250);
const resumed = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
assert.ok(resumed < pausedLater, 'timer must resume without immediately re-pausing');

await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.physics.reset());
await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'title');
const reset = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  return {
    session: foundation.session.snapshot(),
    simulation: foundation.simulation.snapshot(),
    camera: foundation.cameraController.snapshot(),
    flow: foundation.flow.snapshot(),
  };
});
assert.equal(reset.session.score, 0);
assert.equal(reset.session.phase, 'ready');
assert.ok(Math.abs(reset.session.remaining - 75) < 0.001);
assert.equal(reset.simulation.mode, 'contact');
assert.equal(reset.camera.dynamicActive, false);
assert.equal(reset.camera.verticalShift, 0);
assert.equal(reset.flow.state, 'title');

for (const viewport of [
  { width: 2560, height: 1080, label: '21:9' },
  { width: 1280, height: 960, label: '4:3' },
]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(100);
  assertFullscreenLayout(await probe(), viewport.label);
}

const webglResilience = await page.evaluate(() => {
  const canvas = document.querySelector('#game-canvas');
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  const recoveryExposed = typeof window.__HALFPIPE_FOUNDATION__?.recoverWebGL === 'function'
    || Boolean(document.querySelector('[data-webgl-recovery]'));
  return { lostPrevented: lost.defaultPrevented, recoveryExposed };
});

await browser.close();

assert.equal(webglResilience.lostPrevented, true, 'webglcontextlost must be preventDefault() protected');
assert.equal(webglResilience.recoveryExposed, true, 'runtime must expose a WebGL recovery path');
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
