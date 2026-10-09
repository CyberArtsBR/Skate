import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const output = path.join(project, 'artifacts/portals-presentation');
const publicRoot = '/portal-game/';
const documentPath = '/host/preview';
const originalHtml = await readFile(path.join(dist, 'index.html'), 'utf8');

// Portals may place the document outside the game asset root, without a final
// slash. Only its JS/CSS entry URLs are resolved by the host: public runtime
// URLs are deliberately left untouched, so a broken asset helper cannot pass.
const hostedHtml = originalHtml.replace(
  /\b(src|href)=(['"])(?:\.\/|\/)?assets\/([^'"]+\.(?:js|css)(?:\?[^'"]*)?)\2/g,
  (_, attribute, quote, asset) => `${attribute}=${quote}${publicRoot}assets/${asset}${quote}`,
);
assert.notEqual(hostedHtml, originalHtml, 'dist must contain relative JS/CSS bundle entry URLs');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary',
};
const served = [];
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === documentPath) {
      served.push({ pathname, status: 200 });
      response.writeHead(200, { 'Content-Type': mimeTypes['.html'], 'Cache-Control': 'no-store' });
      response.end(hostedHtml); return;
    }
    if (!pathname.startsWith(publicRoot)) {
      served.push({ pathname, status: 404 }); response.writeHead(404); response.end('Outside game asset root'); return;
    }
    const filename = path.resolve(dist, pathname.slice(publicRoot.length) || 'index.html');
    if (!filename.startsWith(dist + path.sep) && filename !== path.join(dist, 'index.html')) {
      response.writeHead(403); response.end('Invalid path'); return;
    }
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('Not a file');
    const headers = { 'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    let start = 0, end = info.size - 1, status = 200;
    if (range) {
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return; }
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; status = 206;
    }
    headers['Content-Length'] = end - start + 1;
    served.push({ pathname, status }); response.writeHead(status, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename, { start, end }).pipe(response);
  } catch {
    served.push({ pathname: request.url, status: 404 }); response.writeHead(404); response.end('Missing asset');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, { recursive: true });
const evidence = { url: origin + documentPath, publicRoot, palettes: {}, screenshots: [],
  pageErrors: [], consoleErrors: [], failedRequests: [], canceledMedia: [], canceledDecodedAssets: [],
  httpErrors: [], localRequests: [] };
let browser, page;

async function screenshot(name) {
  await page.screenshot({ path: path.join(output, name) }); evidence.screenshots.push(name);
}

async function inspectText(selector, palette) {
  await page.waitForFunction(({ selector, palette }) => {
    const element = document.querySelector(selector), canvas = element?.querySelector('canvas');
    if (element?.dataset.graffitiPalette !== palette || !canvas || canvas.width < 2 || canvas.height < 2) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 240) return true;
    return false;
  }, { selector, palette });
  const inspection = await page.locator(selector).evaluate(element => {
    const canvas = element.querySelector('canvas'), style = getComputedStyle(element);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (!pixels[i]) transparent++;
      if (pixels[i] > 240) opaque++;
    }
    return { text: element.textContent, palette: element.dataset.graffitiPalette,
      background: style.backgroundColor, backgroundImage: style.backgroundImage,
      transparent, opaque, canvas: [canvas.width, canvas.height] };
  });
  assert.equal(inspection.background, 'rgba(0, 0, 0, 0)', selector + ': solid text backing');
  assert.equal(inspection.backgroundImage, 'none', selector + ': background image backing');
  assert.ok(inspection.transparent > 30 && inspection.opaque > 30, selector + ': must have ink and transparency');
  return inspection;
}

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('request', request => {
    if (request.url().startsWith(origin + '/')) evidence.localRequests.push(new URL(request.url()).pathname);
  });
  page.on('requestfailed', request => {
    const failure = { url: request.url(), type: request.resourceType(), error: request.failure()?.errorText };
    if (failure.type === 'media' && failure.error === 'net::ERR_ABORTED') evidence.canceledMedia.push(failure);
    else evidence.failedRequests.push(failure);
  });
  page.on('response', response => { if (response.status() >= 400) evidence.httpErrors.push({ url: response.url(), status: response.status() }); });

  await page.goto(origin + documentPath, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__?.flow.state === 'title');
  await page.waitForFunction(() => ['[data-opening-image]', '.v16-title-art'].every(selector => {
    const image = document.querySelector(selector); return image?.complete && image.naturalWidth > 0;
  }));
  evidence.boot = await page.evaluate(() => ({ phase: window.__HALFPIPE_FOUNDATION__.session.phase,
    state: window.__HALFPIPE_FOUNDATION__.flow.state, path: location.pathname,
    models: { halfpipe: Boolean(window.__HALFPIPE_FOUNDATION__.halfpipe.model),
      rider: Boolean(window.__HALFPIPE_FOUNDATION__.rider.chimpion.model),
      skateboard: Boolean(window.__HALFPIPE_FOUNDATION__.rider.skateboard.model),
      wheels: window.__HALFPIPE_FOUNDATION__.rider.skateboard.wheels.length },
    images: ['[data-opening-image]', '.v16-title-art'].map(selector => {
      const image = document.querySelector(selector);
      return { selector, pathname: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight };
    }) }));
  assert.equal(evidence.boot.path, documentPath, 'preview must have no trailing slash');
  assert.ok(evidence.boot.models.halfpipe && evidence.boot.models.rider && evidence.boot.models.skateboard,
    'the real shipped GLBs must finish loading and decoding');
  assert.equal(evidence.boot.models.wheels, 4, 'decoded skateboard must have its four real wheels');
  for (const image of evidence.boot.images) assert.equal(image.pathname, publicRoot + 'images/backgrounds/halfpipe-opening.jpg');
  evidence.palettes.gold = await inspectText('.hud-score > span', 'gold');
  evidence.palettes.cyan = await inspectText('.hud-time > span', 'cyan');
  await screenshot('01-nested-title.png');

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'character-select');
  await page.locator('.hero-card[data-hero-id="heretic"]').click();
  await page.locator('.board-swatch[data-board-color-id="original"]').click();
  await page.locator('.map-card[data-map-id="tree-house"]').click();
  await page.locator('[data-confirm]').click();
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'controls');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'countdown');
  evidence.palettes.fire = await inspectText('.countdown-label', 'fire');
  assert.match(evidence.palettes.fire.text, /Press.*Start/i);
  await screenshot('02-nested-press-to-start.png');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__HALFPIPE_FOUNDATION__.flow.state === 'run'
    && window.__HALFPIPE_FOUNDATION__.session.phase === 'running');
  evidence.running = await page.evaluate(() => ({ map: window.__HALFPIPE_FOUNDATION__.activeMap?.id,
    state: window.__HALFPIPE_FOUNDATION__.flow.state, phase: window.__HALFPIPE_FOUNDATION__.session.phase }));
  assert.equal(evidence.running.map, 'tree-house');

  await page.evaluate(() => {
    const game = window.__HALFPIPE_FOUNDATION__;
    game.physics.setRunning(false);
    game.hud.setScore(3217); game.hud.setTime('0:37');
    game.hud.showTrick('fakie-aerial-540', 1421, { duration: 60000, breakdown: { airHeight: 7.2, quality: .7 } });
    game.hud.showLanding('sketchy', { duration: 60000 });
  });
  evidence.palettes.green = await inspectText('.trick-award-name', 'green');
  evidence.score = await inspectText('[data-score]', 'gold');
  evidence.trickScore = await inspectText('[data-trick-feedback] > span', 'cyan');
  assert.equal(evidence.score.text, '3,217');
  assert.equal(evidence.palettes.green.text, 'FAKIE AERIAL 540°');
  assert.equal(await page.locator('[data-trick-feedback] small canvas, .trick-landing-summary canvas').count(), 0,
    'AIR and landing messages must retain their existing presentation');
  evidence.halos = await page.evaluate(() => {
    const halos = [];
    window.__HALFPIPE_FOUNDATION__.halfpipe.root.traverse(node => {
      if (!node.userData.copingContactZone) return;
      const color = node.material.emissive;
      let visible = true; for (let parent = node; parent; parent = parent.parent) visible &&= parent.visible;
      halos.push({ name: node.name, color: [color.r, color.g, color.b], visible,
        bloom: Boolean(node.userData.emissiveBloom), bloomExclude: node.userData.bloomExclude,
        depthTest: node.material.depthTest, depthWrite: node.material.depthWrite,
        emission: node.material.emissiveIntensity });
    });
    return halos;
  });
  assert.equal(evidence.halos.length, 1, 'the v2 dual-rail mesh must glow red');
  for (const halo of evidence.halos) {
    assert.ok(halo.visible && halo.depthTest && halo.depthWrite && halo.bloom && !halo.bloomExclude);
    assert.equal(halo.emission, 3);
    assert.ok(halo.color[0] > halo.color[1] * 4 && halo.color[0] > halo.color[2] * 4, halo.name + ': halo must be red');
  }
  await screenshot('03-nested-graffiti-red-glow.png');
  await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.hud.setTime('0:09'));
  evidence.palettes.red = await inspectText('[data-time]', 'red');
  assert.equal(evidence.palettes.red.text, '0:09');
  await screenshot('04-nested-red-time.png');

  assert.deepEqual(Object.keys(evidence.palettes).sort(), ['cyan', 'fire', 'gold', 'green', 'red']);
  for (const palette of Object.keys(evidence.palettes)) {
    assert.ok(served.some(item => item.pathname === publicRoot + `fonts/graffiti/${palette}.png` && item.status === 200),
      palette + ': atlas must load from the bundle public root');
  }
  const misplaced = evidence.localRequests.filter(url => url !== documentPath && !url.startsWith(publicRoot));
  assert.deepEqual(misplaced, [], 'runtime assets must resolve under /portal-game/, not the host document route');
  // Chromium can report a canceled fetch after Three.js has already decoded
  // this GLB. Accept only that exact file with positive decoded-model proof;
  // missing models, failed HTTP responses and all other failed fetches fail.
  evidence.failedRequests = evidence.failedRequests.filter(failure => {
    if (failure.error === 'net::ERR_ABORTED' && failure.url === origin + publicRoot + 'models/skateboard/skateboard.glb'
      && evidence.boot.models.skateboard && evidence.boot.models.wheels === 4
      && served.some(item => item.pathname === publicRoot + 'models/skateboard/skateboard.glb'
        && (item.status === 200 || item.status === 206))) {
      evidence.canceledDecodedAssets.push(failure); return false;
    }
    return true;
  });
  assert.deepEqual(evidence.pageErrors, [], 'JavaScript runtime errors');
  assert.deepEqual(evidence.consoleErrors, [], 'console/shader/asset errors');
  assert.deepEqual(evidence.failedRequests, [], 'asset requests must complete');
  assert.deepEqual(evidence.httpErrors, [], 'asset responses must not fail');
  evidence.served = served;
  evidence.passed = true;
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`Portals presentation passed at ${evidence.url}: all five palettes, transparent ink, running session and strong red coping. Evidence: ${output}`);
} catch (error) {
  evidence.passed = false; evidence.failure = error.stack || String(error); evidence.served = served;
  if (page) await screenshot('failure.png').catch(() => {});
  await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
