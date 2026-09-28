import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`);
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#game-stage')?.classList.contains('is-ready'));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.rider));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.simulation));
const passiveProbe = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  foundation.physics.setRunning(false);
  foundation.simulation.reset();
  for (let index = 0; index < 240; index += 1) foundation.simulation.stepFixed();
  foundation.physics.applyCurrentState();
  const snapshot = foundation.simulation.snapshot();
  return {
    ...snapshot,
    riderX: foundation.rider.root.position.x,
    boardAngle: foundation.presentationBinder.lastAngle,
    footIK: { ...foundation.rider.footIK.result },
    contact: foundation.presentationBinder.lastContact
      ? {
        clearance: foundation.presentationBinder.lastContact.clearance,
        extraClearance: foundation.presentationBinder.lastContact.extraClearance,
        minimumSeparation: foundation.presentationBinder.lastContact.minimumSeparation,
        minSeparation: foundation.presentationBinder.lastContact.minSeparation,
        supportPointCount: foundation.presentationBinder.lastContact.supportPointCount,
      }
      : null,
  };
});
await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  foundation.presentationDebug.select(0);
});

const state = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  const canvas = document.querySelector('#game-canvas');
  const hud = document.querySelector('.halfpipe-hud');
  return {
    title: document.title,
    stageReady: document.querySelector('#game-stage').classList.contains('is-ready'),
    canvasOpacity: getComputedStyle(canvas).opacity,
    loadingDisplay: getComputedStyle(document.querySelector('#loading-state')).display,
    score: hud.querySelector('[data-score]').textContent,
    time: hud.querySelector('[data-time]').textContent,
    hudText: hud.innerText.replace(/\s+/g, ' ').trim(),
    backgroundAsset: foundation.background.element.dataset.assetUrl,
    backgroundImage: getComputedStyle(document.querySelector('.background-plate')).backgroundImage,
    backgroundDimensions: [
      foundation.background.state.naturalWidth,
      foundation.background.state.naturalHeight,
    ],
    hiddenGroundNodes: foundation.halfpipe.hiddenGroundNodes,
    wheelCount: foundation.rider.skateboard.wheels.length,
    wheelSpinSafe: foundation.rider.skateboard.wheelSpinSafe,
    measuredWheelDiameter: foundation.rider.skateboard.measuredWheelDiameter,
    surfaceSupportPointCount: foundation.rider.skateboard.surfaceSupportPoints.length,
    rigCapabilities: foundation.rider.chimpion.rigAdapter.capabilities,
    groundMaterial: foundation.ground.ground.material.type,
    groundDepthWrite: foundation.ground.ground.material.depthWrite,
    groundGridVisible: foundation.ground.grid.visible,
    cameraPosition: foundation.camera.position.toArray(),
    cameraRoll: foundation.camera.rotation.z,
    skateboardCoordinateSystem: foundation.rider.skateboard.coordinateSystem,
    skateboardDimensions: foundation.rider.skateboard.dimensions.toArray(),
    deckTopHeight: foundation.rider.skateboard.deckSurfaceY,
    wheelContactHeight: foundation.rider.skateboard.wheelContactY,
    footIK: { ...foundation.rider.footIK.result },
    stance: foundation.rider.root.userData.stance,
    stationCount: foundation.presentationDebug.stations.length,
    station: foundation.presentationDebug.current.name,
    boardAngle: foundation.presentationBinder.lastAngle,
    physicsRunning: foundation.physics.running,
    simulationMode: foundation.simulation.snapshot().mode,
    fixedDt: foundation.simulation.fixedDt,
    renderer: canvas.getContext('webgl2') ? 'webgl2' : 'webgl',
  };
});

await page.screenshot({
  path: path.resolve('docs/rider-integration-center.png'),
  fullPage: true,
});
await page.screenshot({
  path: path.resolve('docs/rider-integration-center-detail.png'),
  clip: { x: 610, y: 470, width: 380, height: 360 },
});

const stationStates = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  return foundation.presentationDebug.stations.map((_, index) => {
    foundation.presentationDebug.select(index);
    return {
      station: foundation.presentationDebug.current.name,
      pipeX: foundation.rider.presentationState.pipeX,
      boardAngle: foundation.presentationBinder.lastAngle,
      tangent: foundation.presentationBinder.lastSample.tangent.toArray(),
      normal: foundation.presentationBinder.lastSample.normal.toArray(),
      footIK: { ...foundation.rider.footIK.result },
      contact: foundation.presentationBinder.lastContact
        ? {
          clearance: foundation.presentationBinder.lastContact.clearance,
          extraClearance: foundation.presentationBinder.lastContact.extraClearance,
          minimumSeparation: foundation.presentationBinder.lastContact.minimumSeparation,
          minSeparation: foundation.presentationBinder.lastContact.minSeparation,
          supportPointCount: foundation.presentationBinder.lastContact.supportPointCount,
        }
        : null,
    };
  });
});
await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.presentationDebug.select(5));
const transitionState = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  return {
    station: foundation.presentationDebug.current.name,
    pipeX: foundation.rider.presentationState.pipeX,
    boardAngle: foundation.presentationBinder.lastAngle,
    tangent: foundation.presentationBinder.lastSample.tangent.toArray(),
    normal: foundation.presentationBinder.lastSample.normal.toArray(),
    footIK: { ...foundation.rider.footIK.result },
  };
});
await page.screenshot({
  path: path.resolve('docs/rider-integration-transition.png'),
  fullPage: true,
});
await page.screenshot({
  path: path.resolve('docs/rider-integration-transition-detail.png'),
  clip: { x: 1020, y: 360, width: 360, height: 330 },
});
await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.presentationDebug.select(0));

await page.keyboard.press('d');
const profileDebugVisible = await page.evaluate(
  () => window.__HALFPIPE_FOUNDATION__.profileDebug.root.visible,
);
await page.keyboard.press('d');

await browser.close();

assert.equal(state.stageReady, true);
assert.equal(state.canvasOpacity, '1');
assert.equal(state.loadingDisplay, 'none');
assert.equal(state.score, '0');
assert.equal(state.time, '1:15');
assert.ok(state.backgroundAsset.startsWith('data:image/jpeg;base64,'));
assert.ok(state.backgroundImage.includes('data:image/jpeg;base64,'));
assert.ok(state.backgroundDimensions[0] >= 256);
assert.ok(state.backgroundDimensions[1] >= 144);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] > 1.76);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] < 1.8);
assert.equal(state.wheelCount, 4);
assert.equal(state.wheelSpinSafe, false);
assert.ok(state.measuredWheelDiameter > 0);
assert.ok(state.surfaceSupportPointCount >= 6);
assert.equal(state.rigCapabilities.gameplayFoundation, true);
assert.equal(state.groundMaterial, 'ShadowMaterial');
assert.equal(state.groundDepthWrite, false);
assert.equal(state.groundGridVisible, false);
assert.equal(state.cameraPosition[0], 0);
assert.ok(Math.abs(state.cameraRoll) < 1e-8);
assert.deepEqual(state.skateboardCoordinateSystem, {
  forwardAxis: '+X',
  lateralAxis: '+Z',
  upAxis: '+Y',
  noseDirection: '+X',
  tailDirection: '-X',
  regularFrontFoot: 'left',
  regularRearFoot: 'right',
});
assert.equal(state.stance, 'regular');
assert.equal(state.stationCount, 7);
assert.equal(state.station, 'CENTER / FLAT');
assert.ok(passiveProbe.time > 1.99 && passiveProbe.time < 2.01);
assert.ok(passiveProbe.bottomCrossings >= 1);
assert.ok(Math.abs(passiveProbe.riderX) > 0.1);
assert.ok(Number.isFinite(passiveProbe.boardAngle));
assert.ok(passiveProbe.footIK.maxError < 0.2);
assert.equal(state.physicsRunning, false);
assert.equal(state.simulationMode, 'contact');
assert.ok(Math.abs(state.fixedDt - (1 / 120)) < 1e-12);
assert.ok(state.deckTopHeight > state.wheelContactHeight);
assert.ok(state.footIK.enabled);
assert.ok(state.footIK.maxError < 0.2, `center foot IK error is ${state.footIK.maxError}`);
assert.equal(transitionState.station, 'UPPER RIGHT');
assert.ok(transitionState.pipeX > 0);
assert.ok(transitionState.boardAngle > 0);
assert.ok(transitionState.tangent[0] > 0);
assert.ok(transitionState.normal[1] > 0);
assert.ok(transitionState.footIK.maxError < 0.2, `transition foot IK error is ${transitionState.footIK.maxError}`);
assert.ok(transitionState.contact);
assert.ok(transitionState.contact.supportPointCount >= 6);
assert.ok(
  transitionState.contact.minSeparation >= transitionState.contact.minimumSeparation - 1e-4,
  `transition support penetration: ${transitionState.contact.minSeparation} < ${transitionState.contact.minimumSeparation}`,
);
assert.deepEqual(stationStates.map((station) => station.station), [
  'CENTER / FLAT',
  'LOWER LEFT',
  'UPPER LEFT',
  'LEFT LIP',
  'LOWER RIGHT',
  'UPPER RIGHT',
  'RIGHT LIP',
]);
for (const station of stationStates) {
  assert.ok(station.tangent[0] > 0, `${station.station} tangent must preserve +X nose convention`);
  assert.ok(station.normal[1] > 0, `${station.station} normal must point upward`);
  assert.ok(station.footIK.maxError < 0.2, `${station.station} foot IK error is ${station.footIK.maxError}`);
  assert.ok(station.contact, `${station.station} must expose contact diagnostics`);
  assert.ok(
    station.contact.minSeparation >= station.contact.minimumSeparation - 1e-4,
    `${station.station} support penetration: ${station.contact.minSeparation} < ${station.contact.minimumSeparation}`,
  );
}
assert.ok(stationStates[2].boardAngle < 0, 'left transition must slope down toward center');
assert.ok(stationStates[5].boardAngle > 0, 'right transition must slope up away from center');
assert.equal(profileDebugVisible, true);
assert.ok(state.hiddenGroundNodes.includes('halfpipe-ground_Baked_1'));
assert.deepEqual(consoleErrors, []);
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedRequests, []);

console.log(JSON.stringify({
  state,
  transitionState,
  stationStates,
  consoleErrors,
  pageErrors,
  failedRequests,
}, null, 2));
