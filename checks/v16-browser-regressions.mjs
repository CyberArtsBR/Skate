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
  assert.equal(title.width, 1280, 'preserved title artwork must render at 1280px wide');
  assert.equal(title.height, 720, 'preserved title artwork must render at 720px high');
  assert.equal(title.complete, true);
  assert.equal(title.titleReady, '1');
  assert.equal(title.startLabel, 'Start Game');

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.waitForFunction(() => document.querySelectorAll('.hero-card').length === 10);

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
  assert.equal(startIndex, 1, 'Heretic is the second rider in the current roster');
  assert.equal(columnCount, 5, 'desktop rider select must render five columns');

  // Ten riders render as two rows of five on desktop. Down must move to the
  // same column of row two, and Up must return to the actual starting rider.
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

  // Exercise the installed V16 presentation patch without changing physics.
  // Mid-flip the body stays compact around the deck and foot IK keeps the
  // character visually attached to the skateboard instead of floating away.
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
    const result = {
      bodyY: rider.bodyCarrier.position.y,
      bodyRoll: rider.bodyCarrier.rotation.z,
      boardRoll: rider.boardPivot.rotation.z,
      footIKWeight: rider.root.userData.footIK?.weight || 0,
    };
    rider.setPresentationState(base);
    return result;
  });

  assert.ok(backflip.bodyY > 0.06 && backflip.bodyY < 0.14, `mid-flip bodyY must stay compact; got ${backflip.bodyY}`);
  assert.ok(Math.abs(backflip.bodyRoll) < 0.08, `mid-flip body roll must stay controlled; got ${backflip.bodyRoll}`);
  assert.ok(Math.abs(backflip.boardRoll) < 0.06, `board secondary roll must stay restrained; got ${backflip.boardRoll}`);
  assert.ok(backflip.footIKWeight >= 0.65, `backflip feet must stay visually anchored; got ${backflip.footIKWeight}`);

  assert.deepEqual(pageErrors, [], 'V16 browser regression must not produce page errors');
  assert.deepEqual(consoleErrors, [], 'V16 browser regression must not produce console errors');
  console.log('Halfpipe V16 browser regressions passed.');
} finally {
  await browser.close();
}
