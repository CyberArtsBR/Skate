import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { DEFAULT_GRAPHICS_PRESET } from '../src/graphics/GraphicsQuality.js';

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
  failedRequests.push(
    `${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`,
  );
});

const assetPath = (value) => new URL(String(value || ''), url).pathname;

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#game-stage')?.classList.contains('is-ready'));
  await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.halfpipe?.model));
  await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.rider?.chimpion?.model));
  await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.background?.state?.naturalWidth));
  await page.waitForFunction(() => document.querySelector('.title-screen .v16-title-art')?.complete);

  const initial = await page.evaluate(() => {
    const foundation = window.__HALFPIPE_FOUNDATION__;
    const art = document.querySelector('.title-screen .v16-title-art');
    const start = document.querySelector('.title-screen [data-action="start"]');
    const stage = document.querySelector('#game-stage').getBoundingClientRect();
    const canvas = document.querySelector('#game-canvas').getBoundingClientRect();
    return {
      flow: foundation.flow.snapshot(),
      session: foundation.session.snapshot(),
      graphicsPreset: foundation.graphics.preset,
      backgroundAsset: foundation.background.element.dataset.assetUrl,
      backgroundWidth: foundation.background.state.naturalWidth,
      backgroundHeight: foundation.background.state.naturalHeight,
      stage: [stage.x, stage.y, stage.width, stage.height],
      canvas: [canvas.x, canvas.y, canvas.width, canvas.height],
      title: {
        src: art?.src || '',
        width: art?.naturalWidth || 0,
        height: art?.naturalHeight || 0,
        complete: Boolean(art?.complete),
        startLabel: start?.getAttribute('aria-label') || '',
      },
    };
  });

  assert.equal(initial.flow.state, 'title');
  assert.equal(initial.session.phase, 'ready');
  assert.equal(initial.graphicsPreset, DEFAULT_GRAPHICS_PRESET);
  assert.equal(assetPath(initial.backgroundAsset), assetPath(GAME_CONFIG.assets.background));
  assert.ok(initial.backgroundWidth > 0 && initial.backgroundHeight > 0, 'configured background must decode');
  assert.deepEqual(initial.stage.map(Math.round), [0, 0, 1600, 900]);
  assert.deepEqual(initial.canvas.map(Math.round), [0, 0, 1600, 900]);
  assert.equal(initial.title.complete, true);
  assert.ok(initial.title.width >= 1280, `title art width is too small: ${initial.title.width}`);
  assert.ok(initial.title.height >= 720, `title art height is too small: ${initial.title.height}`);
  assert.ok(
    Math.abs(initial.title.width / initial.title.height - 16 / 9) < 0.01,
    `title art must remain 16:9; got ${initial.title.width}x${initial.title.height}`,
  );
  assert.equal(initial.title.startLabel, 'Start Game');

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.waitForFunction(() => document.querySelectorAll('.hero-card').length === 4);

  const selection = await page.evaluate(() => {
    const mapIds = Array.from(document.querySelectorAll('.map-card'), (node) => node.dataset.mapId || '');
    return {
      heroCards: document.querySelectorAll('.hero-card').length,
      heroImages: document.querySelectorAll('.hero-card-image').length,
      boardSwatches: document.querySelectorAll('.board-swatch').length,
      mapCards: mapIds.length,
      mapIds,
      randomHero: Boolean(document.querySelector('.hero-card[data-hero-id="random"].is-selected')),
      randomBoard: Boolean(document.querySelector('.board-swatch[data-board-color-id="random"].is-selected')),
      randomMap: Boolean(document.querySelector('.map-card[data-map-id="random"].is-selected')),
    };
  });

  assert.equal(selection.heroCards, 4, 'Exactly four uploaded riders must be visible');
  assert.equal(selection.heroImages, 3, 'The three legacy names retain portraits; Tuxr uses a monogram');
  assert.equal(selection.boardSwatches, 10, 'Random + 9 skateboard colors must be visible');
  assert.ok(selection.mapCards >= 2, 'map UI must expose Random plus production maps');
  assert.equal(new Set(selection.mapIds).size, selection.mapIds.length, 'map IDs must be unique');
  assert.ok(selection.mapIds.includes('random'), 'Random map option must remain available');
  assert.ok(selection.mapIds.includes('city'), 'City map must remain available');
  assert.equal(selection.randomHero, false);
  assert.equal(selection.randomBoard, true);
  assert.equal(selection.randomMap, true);

  await page.locator('.hero-card[data-hero-id="heretic"]').click();
  await page.locator('.board-swatch[data-board-color-id="original"]').click();
  await page.locator('.map-card[data-map-id="city"]').click();
  await page.locator('[data-confirm]').click();
  await page.waitForFunction(
    () => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls',
    null,
    { timeout: 20000 },
  );

  const customization = await page.evaluate(() => {
    const foundation = window.__HALFPIPE_FOUNDATION__;
    return {
      riderId: foundation.customization.riderId,
      boardColorId: foundation.customization.boardColorId,
      mapId: foundation.activeMap?.id,
      mapImageUrl: foundation.activeMap?.imageUrl || '',
      runtimeMapIds: Array.from(foundation.customization.maps || [], (map) => map.id),
      backgroundAsset: foundation.background.element.dataset.assetUrl,
      rigValid: Boolean(foundation.rider.chimpion.rigAdapter.valid),
      halfpipeLoaded: Boolean(foundation.halfpipe?.model),
    };
  });
  assert.equal(customization.riderId, 'heretic');
  assert.equal(customization.boardColorId, 'original');
  assert.equal(customization.mapId, 'city');
  assert.ok(customization.runtimeMapIds.includes('city'));
  assert.deepEqual(
    selection.mapIds.filter((id) => id !== 'random').sort(),
    [...customization.runtimeMapIds].sort(),
    'map UI and runtime map catalog must stay synchronized',
  );
  assert.equal(assetPath(customization.backgroundAsset), assetPath(customization.mapImageUrl));
  assert.equal(customization.rigValid, true);
  assert.equal(customization.halfpipeLoaded, true);

  const backflip = await page.evaluate(() => {
    const rider = window.__HALFPIPE_FOUNDATION__.rider;
    const base = { ...rider.presentationState };
    rider.setPresentationState({
      ...base,
      time: (Number(base.time) || 0) + 0.016,
      airborne: true,
      trickVisualActive: true,
      trickType: 'backflip',
      trickProgress: 0.5,
      trickRoll: Math.PI,
      wallSide: 1,
      turnDirection: 1,
      airHeight: 3,
      verticalVelocity: 4,
      dropInRoll: 0,
      secondaryLag: 0,
      landing: 0,
      landingAnticipation: 0,
    });
    const grabIK = rider.root.userData.backflipGrabIK || {};
    const result = {
      hasBodyAxis: Boolean(rider.root.userData.hasBodyCenteredBackflipAxis),
      axisY: rider.backflipAxisCarrier?.position?.y ?? null,
      axisRoll: rider.backflipAxisCarrier?.rotation?.z ?? null,
      pivotY: rider.backflipAxisY ?? null,
      trickCarrierRoll: rider.trickCarrier.rotation.z,
      footIKWeight: rider.root.userData.footIK?.weight || 0,
      grabIKActive: Boolean(grabIK.active),
      grabIKWeight: Number(grabIK.weight) || 0,
    };
    rider.setPresentationState(base);
    return result;
  });

  assert.equal(backflip.hasBodyAxis, true, 'body-centered backflip axis must remain active');
  assert.ok(Number.isFinite(backflip.axisY) && Number.isFinite(backflip.pivotY));
  assert.ok(Math.abs(backflip.axisY - backflip.pivotY) < 0.001);
  assert.ok(Math.abs(backflip.trickCarrierRoll) < 0.001);
  assert.ok(Math.abs(Math.abs(backflip.axisRoll) - Math.PI) < 0.08);
  assert.ok(backflip.footIKWeight >= 0.65, `backflip foot lock too weak: ${backflip.footIKWeight}`);
  assert.equal(backflip.grabIKActive, true);
  assert.ok(backflip.grabIKWeight >= 0.2, `backflip grab IK did not engage: ${backflip.grabIKWeight}`);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () => window.__HALFPIPE_FOUNDATION__.flow.state === 'run'
      && window.__HALFPIPE_FOUNDATION__.session.phase === 'running',
    null,
    { timeout: 3000 },
  );

  const runStart = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot());
  await page.waitForFunction(
    ({ elapsed }) => {
      const session = window.__HALFPIPE_FOUNDATION__.session.snapshot();
      return session.phase === 'running' && session.elapsed > elapsed + 0.05;
    },
    { elapsed: runStart.elapsed },
    { timeout: 10000, polling: 100 },
  );

  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'paused');
  const paused = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
  await page.waitForTimeout(250);
  const pausedLater = await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.session.snapshot().remaining);
  assert.ok(Math.abs(pausedLater - paused) < 0.001, 'session timer must stop while paused');

  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.session.phase === 'running');
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'pause');
  await page.locator('.pause-menu [data-action="restart"]').click();
  await page.waitForFunction(() => (
    window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown'
      && window.__HALFPIPE_FOUNDATION__.session.phase === 'countdown'
  ));
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (
    window.__HALFPIPE_FOUNDATION__.flow.state === 'run'
      && window.__HALFPIPE_FOUNDATION__.session.phase === 'running'
  ));

  const webglResilience = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    return {
      lostPrevented: lost.defaultPrevented,
      recoveryExposed: typeof window.__HALFPIPE_FOUNDATION__?.recoverWebGL === 'function'
        || Boolean(document.querySelector('[data-webgl-recovery]')),
    };
  });
  assert.equal(webglResilience.lostPrevented, true);
  assert.equal(webglResilience.recoveryExposed, true);

  assert.deepEqual(consoleErrors, [], 'release smoke must not produce console errors');
  assert.deepEqual(pageErrors, [], 'release smoke must not produce page errors');
  assert.deepEqual(failedRequests, [], 'release smoke must not produce failed asset requests');

  console.log(JSON.stringify({
    initial,
    selection,
    customization,
    backflip,
    runStart,
    paused,
    webglResilience,
  }, null, 2));
} finally {
  await browser.close();
}
