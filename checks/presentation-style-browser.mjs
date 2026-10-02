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
      palette: element.dataset.graffitiPalette,
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
  await page.locator('.map-card[data-map-id="space"]').click();
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
  const graffiti = await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    const Vector3 = game.camera.position.constructor;
    const fronts = [];
    game.halfpipe.model.updateWorldMatrix(true, true);
    game.camera.updateMatrixWorld();
    game.halfpipe.model.traverse(object => {
      const material = object.material;
      if (!object.isMesh || !/^FRENTE(?:\.\d+)?$/.test(material?.name || '')) return;
      const positions = object.geometry.attributes.position;
      const projected = [];
      for (let i = 0; i < positions.count; i++) {
        projected.push(new Vector3().fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld).project(game.camera).toArray());
      }
      fronts.push({ name: material.name, metalness: material.metalness,
        texture: Boolean(material.map), uv: material.map?.channel,
        reflectiveOverride: Boolean(object.userData.maxReflectiveFront),
        bounds: { left: Math.min(...projected.map(p => p[0])),
          right: Math.max(...projected.map(p => p[0])),
          bottom: Math.min(...projected.map(p => p[1])),
          top: Math.max(...projected.map(p => p[1])) },
        coversSides: Math.min(...projected.map(p => p[0])) < -1.02
          && Math.max(...projected.map(p => p[0])) > 1.02 });
    });
    return fronts;
  });
  assert.equal(graffiti.length, 1, 'the canonical graffiti front must be present');
  assert.equal(graffiti[0].metalness, 0, 'paint must remain nonmetallic in the game');
  assert.ok(graffiti[0].texture && graffiti[0].uv === 1);
  assert.equal(graffiti[0].reflectiveOverride, false);
  assert.ok(graffiti[0].coversSides, 'painted front must overscan the screen, not nearly fit inside it');
  assert.ok(graffiti[0].bounds.bottom < -1.02,
    'ramp frontage must cover the bottom with slack for impacts');
  const hud = {};
  for (const selector of ['.hud-score > span', '[data-score]', '.hud-time > span', '[data-time]',
    '.trick-award-name', '[data-trick-feedback] > span']) {
    hud[selector] = await inspectText(selector);
    assert.equal(hud[selector].background, 'rgba(0, 0, 0, 0)', selector);
    assert.ok(hud[selector].opaque > 30 && hud[selector].transparent > 30, selector);
    assert.equal(hud[selector].palette, selector.startsWith('.trick-')
      || selector.startsWith('[data-trick-') ? 'green' : 'fire', selector);
  }
  assert.equal(hud['[data-score]'].text, '3,217');
  assert.equal(hud['[data-time]'].text, '0:37');
  assert.equal(hud['.trick-award-name'].text, 'FAKIE AERIAL 540°');
  assert.equal(await page.locator('[data-trick-feedback] small canvas').count(), 0);
  assert.equal(await page.locator('.trick-landing-summary canvas').count(), 0);
  await page.screenshot({ path: path.join(output, 'graffiti-hud-red-glow.png') });

  // Exercise the real controller at several airborne heights. Only Y may move:
  // no ramp-fitting retreat, no FOV change, and no aerial rider scale change.
  const aerialCamera = await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    const controller = game.cameraController;
    const Vector3 = game.camera.position.constructor;
    controller.resetDynamic();
    const base = controller.snapshot();
    const samples = [];
    const baseQuaternion = game.camera.quaternion.toArray();
    for (const y of [10, 14, 18, 22]) {
      for (let frame = 0; frame < 120; frame++) {
        controller.updateForRider({ y, airborne: true, verticalVelocity: 0 }, 1 / 60);
      }
      game.camera.updateMatrixWorld();
      const shift = controller.verticalShift;
      const left = new Vector3(-.5, 8 + shift, 0).project(game.camera);
      const right = new Vector3(.5, 8 + shift, 0).project(game.camera);
      samples.push({ y, ...controller.snapshot(), quaternion: game.camera.quaternion.toArray(),
        unitWidth: right.x - left.x });
    }
    controller.resetDynamic();
    return { base, baseQuaternion, samples };
  });
  for (const sample of aerialCamera.samples) {
    assert.equal(sample.position[0], aerialCamera.base.position[0]);
    assert.equal(sample.position[2], aerialCamera.base.position[2], 'high airs must never dolly out');
    assert.equal(sample.fov, aerialCamera.base.fov, 'high airs must never change FOV');
    assert.ok(sample.verticalShift > 0, 'high airs must move the camera up');
    assert.ok(Math.abs(sample.targetY - aerialCamera.base.targetY - sample.verticalShift) < 1e-9);
    assert.ok(sample.quaternion.every((v, i) => Math.abs(v - aerialCamera.baseQuaternion[i]) < 1e-9));
    assert.ok(Math.abs(sample.unitWidth - aerialCamera.samples[0].unitWidth) < 1e-9,
      'vertical tracking must preserve apparent scale');
  }
  const groundedRider = await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    const previous = { position: game.rider.root.position.toArray(),
      state: game.rider.presentationState };
    game.rider.root.position.set(7, 18, 0);
    game.rider.setPresentationState({ ...previous.state, airborne: true,
      trickVisualActive: true, trickType: 'aerial-turn', trickProgress: .5,
      airHeight: 11.4, facingYaw: Math.PI / 2 });
    for (let frame = 0; frame < 120; frame++) {
      game.cameraController.updateForRider({ y: 18, airborne: true }, 1 / 60);
    }
    return previous;
  });
  await page.screenshot({ path: path.join(output, 'aerial-fixed-scale.png') });
  await page.evaluate(previous => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.rider.root.position.fromArray(previous.position);
    game.rider.setPresentationState(previous.state);
    game.cameraController.resetDynamic();
  }, groundedRider);

  const rail = await page.evaluate(() => {
    const nodes = [];
    window.__HALFPIPE_FOUNDATION__.halfpipe.root.traverse(object => {
      if (object.userData?.copingContactZone || /local-red-glow/.test(object.name)) {
        nodes.push({ name: object.name, bloom: Boolean(object.userData.emissiveBloom),
          visible: object.visible, material: object.material?.name,
          depthTest: object.material?.depthTest, color: object.material?.color?.getHexString(),
          emission: object.material?.emissiveIntensity });
      }
    });
    return nodes;
  });
  assert.ok(rail.some(node => node.bloom && node.emission === 3 && node.color === 'ff1728'),
    'physical coping must emit a strong selective red glow');
  assert.ok(rail.every(node => !/local-red-glow/.test(node.name)), 'detached halo quads must not return');

  // Verify the composed scene lights, not just matching profile constants.
  const mapLighting = await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    const quality = game.graphics.quality;
    const originalId = game.activeMap.id;
    const records = [];
    for (const map of game.customization.maps) {
      game.lighting.setMapProfile(map.id);
      const { hemisphere, key, fill } = game.lighting;
      records.push({ id: map.id, environmentUrl: map.environmentUrl,
        lights: { sky: hemisphere.color.getHex(), ground: hemisphere.groundColor.getHex(),
          key: key.color.getHex(), fill: fill.color.getHex(),
          hemisphereIntensity: hemisphere.intensity, keyIntensity: key.intensity,
          fillIntensity: fill.intensity, keyPosition: key.position.toArray(),
          fillPosition: fill.position.toArray(), keyTarget: key.target.position.toArray(),
          environmentIntensity: quality.scene.environmentIntensity,
          environmentRotation: quality.scene.environmentRotation.y,
          exposure: quality.renderer.toneMappingExposure } });
    }
    game.lighting.setMapProfile(originalId);
    return records;
  });
  const gymLights = mapLighting.find(map => map.id === 'the-gym');
  assert.equal(mapLighting.length, 8);
  for (const map of mapLighting) {
    assert.deepEqual(map.lights, gymLights.lights, map.id + ': actual lights must match Gym');
    assert.equal(map.environmentUrl, gymLights.environmentUrl, map.id + ': reflection source must match Gym');
  }

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
  assert.equal((await inspectText('[data-time]')).palette, 'fire', 'low time keeps the requested palette');
  assert.equal((await inspectText('.trick-award-name')).palette, 'green');
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
    if (mapId === 'japan') {
      await page.waitForFunction(() => {
        const quality = window.__HALFPIPE_FOUNDATION__.graphics.quality;
        return quality.scene.background?.isTexture
          && quality.scene.background !== quality.environment.backgroundTexture;
      }, null, { timeout: 60000 });
    }
    const arena = await page.evaluate(() => {
      const game = window.__HALFPIPE_FOUNDATION__;
      game.physics.setRunning(false);
      const halos = [];
      game.halfpipe.root.traverse(node => {
        if (node.userData.copingContactZone && node.userData.emissiveBloom) halos.push(node.name);
      });
      const replacement = game.halfpipe.replacementRamp;
      const quality = game.graphics.quality;
      return { id: game.activeMap?.id, fullMap: game.halfpipe.fullMap, halos,
        usesV2: Boolean(replacement && replacement.parent === game.halfpipe.model),
        surfaceIsV2: Boolean(replacement?.getObjectById(game.halfpipe.ridingSurface.id)),
        camera: game.cameraController.snapshot(),
        environmentUrl: quality.environment.url,
        backgroundEnvironmentUrl: game.activeMap.backgroundEnvironmentUrl,
        separateBackground: quality.scene.background !== quality.environment.backgroundTexture,
        backgroundRotation: quality.scene.backgroundRotation.y };
    });
    assert.equal(arena.fullMap, true);
    assert.equal(arena.usesV2, true, mapId + ': embedded v1 must be replaced by v2');
    assert.equal(arena.surfaceIsV2, true, mapId + ': contacts must use v2');
    assert.equal(arena.halos.length, 1, mapId + ': the authored dual-rail mesh must glow red');
    assert.equal(arena.environmentUrl, '/hdri/piazza_martin_lutero_1k.hdr');
    assert.equal(arena.camera.fov, aerialCamera.base.fov);
    assert.equal(arena.camera.position[2], aerialCamera.base.position[2]);
    if (mapId === 'japan') {
      assert.equal(arena.backgroundEnvironmentUrl, '/hdri/japan-sunset-1k.exr');
      assert.equal(arena.separateBackground, true);
      assert.equal(arena.backgroundRotation, .5, 'Japan must retain the original sky orientation');
    }
    arenas.push(arena);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, mapId + '-red-glow.png') });
  }
  assert.deepEqual(errors, [], 'runtime must not report JS, shader or asset errors');
  const evidence = { prompt, hud, graffiti, aerialCamera, mapLighting, rail, poses, arenas, screenshots: output, errors };
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
