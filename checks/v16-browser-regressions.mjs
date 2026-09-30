import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#game-stage')?.classList.contains('is-ready'));
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__?.flow?.state === 'title');

  const title = await page.evaluate(() => {
    const art = document.querySelector('.title-screen .v16-title-art');
    const start = document.querySelector('.title-screen [data-action="start"]');
    return {
      src: art ? new URL(art.src).pathname : null,
      width: art?.naturalWidth || 0,
      height: art?.naturalHeight || 0,
      complete: Boolean(art?.complete),
      titleReady: document.querySelector('.title-screen')?.dataset?.v16TitleReady || '',
      startLabel: start?.getAttribute('aria-label') || '',
    };
  });
  assert.equal(title.src, '/images/backgrounds/halfpipe-title.jpg');
  assert.ok(title.width >= 1280, `preserved title artwork must be at least 1280px wide; got ${title.width}`);
  assert.ok(title.height >= 720, `preserved title artwork must be at least 720px high; got ${title.height}`);
  assert.ok(
    Math.abs(title.width / title.height - 16 / 9) < 0.01,
    `preserved title artwork must remain 16:9; got ${title.width}x${title.height}`,
  );
  assert.equal(title.complete, true);
  assert.equal(title.titleReady, '1');
  assert.equal(title.startLabel, 'Start Game');

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.waitForFunction(() => document.querySelectorAll('.hero-card').length === 11);

  assert.equal(await page.locator('.hero-card').count(), 11, 'V18 adds one Random rider card to the 10-rider roster');
  assert.equal(await page.locator('.board-swatch').count(), 10, 'V18 adds one Random skateboard option');
  assert.equal(await page.locator('.map-card').count(), 5, 'V18 exposes Random plus four maps');
  assert.ok(await page.locator('.hero-card[data-hero-id="random"]').evaluate((node) => node.classList.contains('is-selected')));
  assert.ok(await page.locator('.board-swatch[data-board-color-id="random"]').evaluate((node) => node.classList.contains('is-selected')));
  assert.ok(await page.locator('.map-card[data-map-id="random"]').evaluate((node) => node.classList.contains('is-selected')));

  // V16 grid navigation still operates on the real 10-rider roster. Select the
  // Heretic explicitly first so Random remains a V18 presentation choice and
  // the legacy semantic-grid regression stays deterministic.
  await page.locator('.hero-card[data-hero-id="heretic"]').click();

  const selectedId = () => page.locator('.hero-card.is-selected').getAttribute('data-hero-id');
  const selectedIndex = () => page.evaluate(() => (
    [...document.querySelectorAll('.hero-card')]
      .findIndex((card) => card.classList.contains('is-selected'))
  ));

  const startHero = await selectedId();
  const startIndex = await selectedIndex();
  const columnCount = await page.evaluate(() => {
    const grid = document.querySelector('.hero-grid');
    return getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
  });
  assert.equal(startHero, 'heretic');
  assert.equal(columnCount, 5, 'desktop rider select must render five columns');

  const expectedDownIndex = startIndex + columnCount;
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await selectedId(), startHero, 'ArrowDown must move to another rider row');
  assert.equal(
    await selectedIndex(),
    expectedDownIndex,
    'ArrowDown must preserve the rider column while moving to row two',
  );

  await page.keyboard.press('ArrowUp');
  assert.equal(
    await selectedIndex(),
    startIndex,
    'ArrowUp must return to the same rider column on row one',
  );
  assert.equal(await selectedId(), startHero);

  // Exercise the installed V16/V17 presentation patch without changing physics.
  // The approved hotfix re-parents body + board beneath a body-centered axis,
  // so local bodyCarrier Y is intentionally negative during the flip. Validate
  // the actual pivot contract instead of the obsolete board-level coordinate.
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
      bodyRoll: rider.bodyCarrier.rotation.z,
      boardRoll: rider.boardPivot.rotation.z,
      trickCarrierRoll: rider.trickCarrier.rotation.z,
      axisY: rider.backflipAxisCarrier?.position?.y ?? null,
      axisRoll: rider.backflipAxisCarrier?.rotation?.z ?? null,
      pivotY: rider.backflipAxisY ?? null,
      footIKWeight: rider.root.userData.footIK?.weight || 0,
      grabIKActive: Boolean(grabIK.active),
      grabIKWeight: Number(grabIK.weight) || 0,
      hasBodyAxis: Boolean(rider.root.userData.hasBodyCenteredBackflipAxis),
    };
    rider.setPresentationState(base);
    return result;
  });

  assert.equal(backflip.hasBodyAxis, true, 'backflip body-centered axis hotfix must remain installed');
  assert.ok(Number.isFinite(backflip.axisY) && Number.isFinite(backflip.pivotY), 'body-centered axis must expose a finite pivot');
  assert.ok(Math.abs(backflip.axisY - backflip.pivotY) < 0.001, `axis must rotate around rider body center; axis=${backflip.axisY}, pivot=${backflip.pivotY}`);
  assert.ok(Math.abs(backflip.trickCarrierRoll) < 0.001, `legacy board-level carrier must not own the flip; got ${backflip.trickCarrierRoll}`);
  assert.ok(Math.abs(Math.abs(backflip.axisRoll) - Math.PI) < 0.08, `body-centered axis must own the mid-flip rotation; got ${backflip.axisRoll}`);
  assert.ok(Math.abs(backflip.bodyRoll) < 0.08, `body secondary roll must stay controlled; got ${backflip.bodyRoll}`);
  assert.ok(Math.abs(backflip.boardRoll) < 0.06, `board secondary roll must stay restrained; got ${backflip.boardRoll}`);
  assert.ok(backflip.footIKWeight >= 0.65, `backflip feet must stay visually anchored; got ${backflip.footIKWeight}`);
  assert.equal(backflip.grabIKActive, true, 'mid-flip two-hand skateboard grab IK must be active');
  assert.ok(backflip.grabIKWeight >= 0.5, `mid-flip grab IK must have meaningful weight; got ${backflip.grabIKWeight}`);

  assert.deepEqual(pageErrors, [], 'V16 browser regression must not produce page errors');
  assert.deepEqual(consoleErrors, [], 'V16 browser regression must not produce console errors');
  console.log('Halfpipe V16/V18 browser regressions passed.');
} finally {
  await browser.close();
}
