import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://localhost:5173';
const output = path.resolve('artifacts/ramp-edge-cover');
const viewports = [
  { width: 1600, height: 900 },
  { width: 2879, height: 1613 },
  { width: 2879, height: 1216 },
  { width: 2560, height: 1080 },
  { width: 640, height: 400 },
];
// Keep a real amount of painted facade outside the viewport, not a tolerance
// that would accidentally accept a thin vertical background gutter.
const minimumSideOverscan = 0.015;
const evidence = { url, minimumSideOverscan, viewports: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: viewports[0] });
page.on('pageerror', error => evidence.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') evidence.errors.push(message.text());
});

function intervalsAtY(triangles, y) {
  const intervals = [];
  for (const triangle of triangles) {
    const xs = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      if (Math.abs(a[1] - b[1]) < 1e-10) {
        if (Math.abs(y - a[1]) < 1e-8) xs.push(a[0], b[0]);
        continue;
      }
      const t = (y - a[1]) / (b[1] - a[1]);
      if (t >= -1e-8 && t <= 1 + 1e-8) xs.push(a[0] + t * (b[0] - a[0]));
    }
    if (xs.length >= 2) {
      const left = Math.min(...xs), right = Math.max(...xs);
      if (right - left > 1e-9) intervals.push([left, right]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [left, right] of intervals) {
    const last = merged.at(-1);
    if (last && left <= last[1] + 1e-7) last[1] = Math.max(last[1], right);
    else merged.push([left, right]);
  }
  return merged;
}

async function inspectFront() {
  return page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    const Vector3 = game.camera.position.constructor;
    game.halfpipe.model.updateWorldMatrix(true, true);
    game.camera.updateMatrixWorld(true);
    const triangles = [];
    const materials = [];
    game.halfpipe.model.traverse(object => {
      if (!object.isMesh) return;
      const slots = Array.isArray(object.material) ? object.material : [object.material];
      const geometry = object.geometry;
      const positions = geometry.attributes.position;
      const index = geometry.index;
      const groups = geometry.groups.length ? geometry.groups
        : [{ start: 0, count: index?.count || positions.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = slots[group.materialIndex];
        if (!/^FRENTE(?:\.\d+)?$/.test(material?.name || '')) continue;
        materials.push({ object: object.name, material: material.name,
          texture: Boolean(material.map), metalness: material.metalness });
        for (let offset = group.start; offset + 2 < group.start + group.count; offset += 3) {
          triangles.push([0, 1, 2].map(vertex => new Vector3()
            .fromBufferAttribute(positions, index ? index.getX(offset + vertex) : offset + vertex)
            .applyMatrix4(object.matrixWorld).toArray()));
        }
      }
    });
    const vertices = triangles.flat();
    const frontZ = Math.max(...vertices.map(point => point[2]));
    const frontTriangles = triangles.filter(triangle =>
      triangle.every(point => Math.abs(point[2] - frontZ) < .001))
      .map(triangle => triangle.map(point => new Vector3().fromArray(point).project(game.camera).toArray()));
    const projected = frontTriangles.flat();
    const bounds = { left: Math.min(...projected.map(point => point[0])),
      right: Math.max(...projected.map(point => point[0])),
      bottom: Math.min(...projected.map(point => point[1])),
      top: Math.max(...projected.map(point => point[1])) };
    const canvas = game.graphics.quality.renderer.domElement.getBoundingClientRect();
    return { frontZ, materials, triangleCount: frontTriangles.length,
      triangles: frontTriangles, bounds, camera: game.cameraController.snapshot(),
      quaternion: game.camera.quaternion.toArray(), aspect: game.camera.aspect,
      projectionAspect: game.camera.projectionMatrix.elements[5] / game.camera.projectionMatrix.elements[0],
      canvas: { width: canvas.width, height: canvas.height, left: canvas.left, top: canvas.top } };
  });
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__?.flow.state === 'title');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.locator('.hero-card[data-hero-id="heretic"]').click();
  await page.locator('.board-swatch[data-board-color-id="original"]').click();
  await page.locator('.map-card[data-map-id="space"]').click();
  await page.locator('[data-confirm]').click();
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls', null, { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'run');
  const originalRider = await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.physics.setRunning(false);
    game.hud.clearFeedback();
    return { position: game.rider.root.position.toArray(), state: game.rider.presentationState };
  });

  for (const viewport of viewports) {
    const label = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.evaluate(previous => {
      const game = window.__HALFPIPE_FOUNDATION__;
      game.rider.root.position.fromArray(previous.position);
      game.rider.setPresentationState(previous.state);
      game.cameraController.resetDynamic();
    }, originalRider);
    await page.waitForTimeout(250);
    const front = await inspectFront();
    const triangles = front.triangles;
    delete front.triangles;
    const record = { viewport, front, slices: [], aerial: [] };
    evidence.viewports.push(record);
    await page.screenshot({ path: path.join(output, `${label}-base.png`) });
    assert.ok(front.triangleCount > 0, `${label}: inspect the actual painted front plane`);
    assert.ok(front.materials.every(material => material.texture && material.metalness === 0),
      `${label}: the painted front must stay textured and nonmetallic`);
    assert.ok(Math.abs(front.aspect - viewport.width / viewport.height) < 1e-9);
    assert.ok(Math.abs(front.projectionAspect - front.aspect) < 1e-9,
      `${label}: responsive layout must preserve undistorted native aspect`);
    assert.equal(front.canvas.width, viewport.width);
    assert.equal(front.canvas.height, viewport.height);
    assert.equal(front.canvas.left, 0);
    assert.equal(front.canvas.top, 0);

    const low = Math.max(-1, front.bounds.bottom), high = Math.min(1, front.bounds.top);
    assert.ok(high - low > .4, `${label}: facade must occupy a substantial visible vertical band`);
    for (const fraction of [.02, .1, .3, .5, .7, .9, .98]) {
      const y = low + (high - low) * fraction;
      const intervals = intervalsAtY(triangles, y);
      const left = intervals.find(interval => interval[0] <= -1 && interval[1] >= -1);
      const right = intervals.find(interval => interval[0] <= 1 && interval[1] >= 1);
      record.slices.push({ y, fraction, intervals, left, right });
      assert.ok(left && left[0] <= -1 - minimumSideOverscan,
        `${label} at NDC y=${y.toFixed(4)}: left paint must overscan screen edge; ${JSON.stringify(intervals)}`);
      assert.ok(right && right[1] >= 1 + minimumSideOverscan,
        `${label} at NDC y=${y.toFixed(4)}: right paint must overscan screen edge; ${JSON.stringify(intervals)}`);
    }
    assert.ok(front.bounds.bottom <= -1,
      `${label}: no scenery below the ramp frontage; bottom=${front.bounds.bottom}`);

    for (const y of [10, 18, 22]) {
      const sample = await page.evaluate(height => {
        const game = window.__HALFPIPE_FOUNDATION__;
        const controller = game.cameraController;
        const Vector3 = game.camera.position.constructor;
        game.rider.root.position.set(7, height, 0);
        game.rider.setPresentationState({ ...game.rider.presentationState,
          airborne: true, trickVisualActive: true, trickType: 'aerial-turn',
          trickProgress: .5, airHeight: height - 6.62, facingYaw: Math.PI / 2 });
        for (let frame = 0; frame < 180; frame++) {
          controller.updateForRider({ y: height, airborne: true, verticalVelocity: 0 }, 1 / 60);
        }
        game.camera.updateMatrixWorld(true);
        const shift = controller.verticalShift;
        const left = new Vector3(-.5, 8 + shift, 0).project(game.camera);
        const right = new Vector3(.5, 8 + shift, 0).project(game.camera);
        return { riderY: height, ...controller.snapshot(),
          quaternion: game.camera.quaternion.toArray(), unitWidth: right.x - left.x };
      }, y);
      record.aerial.push(sample);
      assert.equal(sample.position[0], front.camera.position[0], `${label}: no aerial X movement`);
      assert.equal(sample.position[2], front.camera.position[2], `${label}: no aerial retreat or zoom out`);
      assert.equal(sample.fov, front.camera.fov, `${label}: lens is fixed during flight`);
      assert.ok(sample.verticalShift > 0, `${label}: camera follows aerial height in Y`);
      assert.ok(Math.abs(sample.targetY - front.camera.targetY - sample.verticalShift) < 1e-8);
      assert.ok(sample.quaternion.every((value, index) => Math.abs(value - front.quaternion[index]) < 1e-8),
        `${label}: retain the same front viewing angle`);
      assert.ok(Math.abs(sample.unitWidth - record.aerial[0].unitWidth) < 1e-8,
        `${label}: vertical following must retain apparent scale`);
      await page.screenshot({ path: path.join(output, `${label}-aerial-${y}.png`) });
    }
  }
  assert.deepEqual(evidence.errors, [], 'no JS, shader, or browser asset errors');
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.failure = error.stack || String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
}
