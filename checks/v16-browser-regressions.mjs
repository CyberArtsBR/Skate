import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const titleAsset = 'public/images/backgrounds/halfpipe-title.jpg';
const titleBytes = fs.readFileSync(titleAsset);
assert.equal(titleBytes.length, 609579, 'title artwork byte size must match the supplied JPG');
assert.equal(
  crypto.createHash('sha256').update(titleBytes).digest('hex'),
  '53693ce610f9298f29430d9e5fb8421931da210e9361e204d20fcc7217b13159',
  'title artwork must remain byte-for-byte identical to the supplied JPG',
);

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
      titleReady: document.querySelector('.title-screen')?.dataset?.v16TitleReady || '',
      startLabel: start?.getAttribute('aria-label') || '',
    };
  });
  assert.equal(title.src, '/images/backgrounds/halfpipe-title.jpg');
  assert.equal(title.width, 1672);
  assert.equal(title.height, 941);
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
  assert.equal(startHero, 'heretic');
  assert.equal(await selectedIndex(), 0);

  // Ten riders render as two rows of five on desktop. Down must move to the
  // same column of row two, and Up must return to the original row.
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await selectedId(), startHero, 'ArrowDown must move to another rider row');
  assert.equal(await selectedIndex(), 5, 'ArrowDown from rider 0 must select rider 5');

  await page.keyboard.press('ArrowUp');
  assert.equal(await selectedIndex(), 0, 'ArrowUp must return to the same column on row one');
  assert.equal(await selectedId(), startHero);

  // Exercise the actual installed V16 presentation patch without changing
  // authoritative physics. Mid-flip the body should tuck toward the deck,
  // board secondary roll should remain restrained, and foot IK must keep a
  // strong visual connection to the skateboard.
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
