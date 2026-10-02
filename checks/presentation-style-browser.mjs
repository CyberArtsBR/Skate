import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://localhost:5173';
const output = path.resolve('artifacts/presentation-style');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

async function waitForInk(selector) {
  await page.waitForFunction(target => {
    const canvas = document.querySelector(target)?.querySelector('canvas');
    return canvas && canvas.width > 1 && canvas.height > 1
      && [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]
        .some((value, index) => index % 4 === 3 && value > 0);
  }, selector);
}

async function inspectText(selector) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    const canvas = element.querySelector('canvas');
    const ink = canvas?.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, opaque = 0;
    if (ink) for (let i = 3; i < ink.length; i += 4) {
      if (ink[i] === 0) transparent++;
      if (ink[i] > 240) opaque++;
    }
    const bounds = element.getBoundingClientRect();
    const drawn = canvas?.getBoundingClientRect();
    return { text: element.textContent, background: style.backgroundColor,
      hasCanvas: Boolean(canvas), transparent, opaque,
      x: bounds.x, right: bounds.right, width: bounds.width, height: bounds.height,
      inkWidth: drawn?.width, inkHeight: drawn?.height };
  });
}

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__?.flow.state === 'title');
  await waitForInk('[data-score]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.locator('.hero-card[data-hero-id="heretic"]').click();
  await page.locator('.board-swatch[data-board-color-id="original"]').click();
  await page.locator('.map-card[data-map-id="tree-house"]').click();
  await page.locator('[data-confirm]').click();
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
  await waitForInk('.countdown-label');
  const prompt = await inspectText('.countdown-label');
  assert.match(prompt.text, /Press.*Start/i);
  assert.equal(prompt.background, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: path.join(output, 'press-to-start.png') });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'run');

  await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.physics.setRunning(false);
    game.hud.setScore(3217);
    game.hud.setTime('0:37');
    game.hud.showTrick('fakie-aerial-540', 1421, { duration: 60000,
      breakdown: { airHeight: 7.2, quality: .7 } });
    game.hud.showLanding('sketchy', { duration: 60000 });
  });
  await waitForInk('.trick-award-name');
  await waitForInk('[data-trick-feedback] > span');
  await page.waitForTimeout(300);
  const hud = {};
  for (const selector of ['.hud-score > span', '[data-score]', '.hud-time > span', '[data-time]',
    '.trick-award-name', '[data-trick-feedback] > span']) {
    hud[selector] = await inspectText(selector);
    assert.equal(hud[selector].background, 'rgba(0, 0, 0, 0)', selector);
    assert.ok(hud[selector].opaque > 30 && hud[selector].transparent > 30, selector);
  }
  assert.equal(hud['[data-score]'].text, '3,217');
  assert.equal(hud['[data-time]'].text, '0:37');
  assert.equal(hud['.trick-award-name'].text, 'FAKIE AERIAL 540°');
  assert.equal(await page.locator('[data-trick-feedback] small canvas').count(), 0);
  assert.equal(await page.locator('.trick-landing-summary canvas').count(), 0);
  await page.screenshot({ path: path.join(output, 'graffiti-hud-red-glow.png') });

  const rail = await page.evaluate(() => {
    const nodes = [];
    window.__HALFPIPE_FOUNDATION__.halfpipe.root.traverse(object => {
      if (object.userData?.copingContactZone || /local-red-glow/.test(object.name)) {
        nodes.push({ name: object.name, bloom: Boolean(object.userData.emissiveBloom),
          visible: object.visible, material: object.material?.name,
          depthTest: object.material?.depthTest, color: object.material?.color?.getHexString() });
      }
    });
    return nodes;
  });
  assert.ok(rail.some(node => /local-red-glow/.test(node.name)), 'localized red halo must exist');
  assert.ok(rail.every(node => !node.bloom), 'coping must not feed the HDR bloom pass');

  // Check small screens and settings through the real HUD update path.
  await page.setViewportSize({ width: 640, height: 400 });
  await page.evaluate(() => {
    const hud = window.__HALFPIPE_FOUNDATION__.hud;
    hud.setScore(987654321);
    hud.setTime('0:09');
    hud.showTrick('fakie-aerial-540-double-backflip', 98765, { duration: 60000 });
    hud.setPlayerMode({ highContrast: true, uiScale: 1.5, reducedMotion: true });
  });
  await waitForInk('.trick-award-name');
  await page.waitForTimeout(250);
  for (const selector of ['[data-score]', '[data-time]', '.trick-award-name']) {
    const text = await inspectText(selector);
    assert.ok(text.x >= -1 && text.right <= 641, `${selector} clips at 640px: ${JSON.stringify(text)}`);
    assert.ok(text.inkWidth <= text.width + 1, `${selector} ink must fit its bounds`);
  }
  assert.equal(await page.locator('[data-time]').textContent(), '0:09');
  await page.screenshot({ path: path.join(output, 'graffiti-hud-small-screen.png') });

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.hud.setPlayerMode({ highContrast: false, uiScale: 1, reducedMotion: false });
    game.hud.clearFeedback();
    game.hud.root.hidden = true;
    game.presentationDebug.select(0);
    game.rider.root.position.set(-6.2, 7.2, 0);
    game.rider.root.rotation.set(0, 0, 0);
    game.camera.position.set(-4.9, 8.6, 8.2);
    game.camera.lookAt(-6.2, 8.2, 0);
  });
  const poses = [];
  for (const [type, roll] of [['aerial-turn', 0], ['backflip', Math.PI / 3]]) {
    const pose = await page.evaluate(({ type, roll }) => {
      const rider = window.__HALFPIPE_FOUNDATION__.rider;
      const state = { ...rider.presentationState, time: 30,
        airborne: true, trickVisualActive: true, trickType: type,
        trickProgress: .5, trickRoll: roll, facingYaw: Math.PI / 2,
        flipLaunchFacingYaw: Math.PI / 2, wallSide: 1, airHeight: 3,
        speedNormalized: .8, landingAnticipation: 0, landing: 0,
        secondaryLag: 0, dropInRoll: 0, dropInProgress: 1 };
      rider.smoothedPose = null;
      rider.setPresentationState(state);
      const Vector3 = rider.root.position.constructor;
      const rig = rider.chimpion.rigAdapter.rig;
      const point = key => rider.skateboard.root.worldToLocal(rig[key].getWorldPosition(new Vector3())).toArray();
      return { type, kneeFlex: rider.smoothedPose.kneeFlex,
        crouch: rider.smoothedPose.aerialCrouch,
        footError: rider.root.userData.footIK.maxError,
        hips: point('hips'), chest: point('chest'),
        leftShoulder: point('leftUpperArm'), leftHand: point('leftHand'),
        rightShoulder: point('rightUpperArm'), rightHand: point('rightHand') };
    }, { type, roll });
    assert.ok(pose.kneeFlex > 1.6, type + ': must have a deep crouch');
    assert.ok(pose.footError < .08, type + ': feet must remain on the board');
    assert.ok(pose.leftHand[1] < pose.leftShoulder[1] && pose.rightHand[1] < pose.rightShoulder[1],
      type + ': both hands must point down toward the board');
    poses.push(pose);
    await page.screenshot({ path: path.join(output, type + '-crouch.png') });
  }

  await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.hud.root.hidden = false;
    game.cameraController.resetDynamic();
    game.simulation.state.score = 140000;
    game.session.elapsed = game.session.durationSeconds - .01;
    game.session.remaining = .01;
    game.physics.setRunning(true);
  });
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'results');
  await waitForInk('.results-screen [data-stat="finalScore"] strong');
  await page.screenshot({ path: path.join(output, 'results.png') });
  await page.locator('.results-screen [data-action="next"]').click();
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'podium');
  await waitForInk('.podium-screen h1');
  assert.equal(await page.locator('.podium-screen h1').textContent(), 'Congratulations!');
  await page.waitForFunction(() => [...document.querySelectorAll('.podium-score-label')]
    .every(label => !label.hidden && getComputedStyle(label).visibility !== 'hidden'));
  await page.screenshot({ path: path.join(output, 'congratulations-podium.png') });

  const arenas = [];
  for (const mapId of ['the-gym', 'japan']) {
    await page.evaluate(() => {
      const flow = window.__HALFPIPE_FOUNDATION__.flow;
      if (!flow.canTransitionTo('character-select')) flow.transitionTo('title');
      flow.transitionTo('character-select');
    });
    await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
    await page.locator(`.map-card[data-map-id="${mapId}"]`).click();
    await page.locator('[data-confirm]').click();
    await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls', null, { timeout: 60000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
    // The start prompt debounces the key used to leave the tutorial.
    await page.waitForTimeout(350);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'run');
    const arena = await page.evaluate(() => {
      const game = window.__HALFPIPE_FOUNDATION__;
      game.physics.setRunning(false);
      const halos = [];
      game.halfpipe.root.traverse(node => {
        if (/local-red-glow/.test(node.name)) halos.push(node.name);
      });
      return { id: game.activeMap?.id, fullMap: game.halfpipe.fullMap, halos };
    });
    assert.equal(arena.fullMap, true);
    assert.equal(arena.halos.length, 2, mapId + ': both rails need red glow');
    arenas.push(arena);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, mapId + '-red-glow.png') });
  }
  assert.deepEqual(errors, [], 'runtime must not report JS, shader or asset errors');
  const evidence = { prompt, hud, rail, poses, arenas, screenshots: output, errors };
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
