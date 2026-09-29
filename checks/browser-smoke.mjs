import assert from 'node:assert/strict';
import path from 'node:path';
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
const dropInProbe = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  foundation.physics.setRunning(false);
  const state = foundation.simulation.reset();
  foundation.physics.applyCurrentState();
  foundation.rider.root.updateWorldMatrix(true, true);
  const wheelWorld = foundation.rider.skateboard.contactPoints.map((point) => {
    const world = foundation.rider.skateboard.root.localToWorld(point.clone());
    return world.toArray();
  });
  const lipY = foundation.profile.sample(foundation.profile.rightLip).y;
  const topWheelY = Math.max(...wheelWorld.map((point) => point[1]));
  return {
    pipeX: state.pipeX,
    rightLip: foundation.profile.rightLip,
    lipY,
    topWheelY,
    topWheelGap: lipY - topWheelY,
    wheelWorld,
    dropInRoll: foundation.rider.presentationState.dropInRoll,
    carrierRoll: foundation.rider.trickCarrier.rotation.z,
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
    chimpionTargetHeight: foundation.rider.chimpion.root.userData.targetHeight,
    skateboardSourceScale: foundation.rider.skateboard.root.userData.sourceScale,
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
await page.screenshot({
  path: path.resolve('docs/rider-integration-transition.png'),
  fullPage: true,
});
await page.screenshot({
  path: path.resolve('docs/rider-integration-transition-detail.png'),
  clip: { x: 1020, y: 360, width: 360, height: 330 },
});
await page.evaluate(() => window.__HALFPIPE_FOUNDATION__.presentationDebug.select(0));

const airTransition = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  const simulation = foundation.simulation;
  const profile = foundation.profile;
  foundation.physics.setRunning(false);

  const takeoffX = profile.rightLip - simulation.airTakeoffInset;
  simulation.reset({
    pipeX: takeoffX - 0.025,
    tangentVelocity: 20,
  });
  simulation.setPumpIntent(0);
  simulation.setTurnIntent(0);
  simulation.setHandPlantHeld(false);
  foundation.physics.applyCurrentState();

  let launch = null;
  let landing = null;
  let previousMode = simulation.snapshot().mode;
  let previousRoot = foundation.rider.root.position.clone();
  let previousState = simulation.snapshot();

  for (let index = 0; index < 480; index += 1) {
    const next = simulation.stepFixed();
    foundation.physics.applyCurrentState();
    const nextRoot = foundation.rider.root.position.clone();

    if (previousMode === 'contact' && next.mode === 'airborne' && !launch) {
      launch = {
        previousPipeX: previousState.pipeX,
        pipeX: next.pipeX,
        previousRoot: previousRoot.toArray(),
        root: nextRoot.toArray(),
        rootDelta: nextRoot.distanceTo(previousRoot),
        lipDistance: Math.abs(profile.rightLip - next.pipeX),
      };
    }

    if (previousMode === 'airborne' && next.mode === 'contact' && !landing) {
      landing = {
        previousRoot: previousRoot.toArray(),
        root: nextRoot.toArray(),
        rootDelta: nextRoot.distanceTo(previousRoot),
        pipeX: next.pipeX,
      };
      break;
    }

    previousMode = next.mode;
    previousRoot = nextRoot;
    previousState = next;
  }

  return { launch, landing };
});

const backFacingPoseProbe = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  const simulation = foundation.simulation;
  const profile = foundation.profile;
  const wallX = (side, fraction) => side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );

  simulation.reset({
    pipeX: wallX(1, 0.58),
    tangentVelocity: 8,
  });
  simulation.state.facingTurns = 1;
  simulation.setPumpIntent(0);
  simulation.setTurnIntent(0);
  simulation.setHandPlantHeld(false);
  foundation.physics.applyCurrentState();

  const rig = foundation.rider.chimpion.rigAdapter.rig;
  const world = (bone) => {
    if (!bone) return null;
    const point = bone.position.clone();
    bone.getWorldPosition(point);
    return point.toArray();
  };

  return {
    facingYaw: foundation.rider.presentationState.facingYaw,
    ascending: foundation.rider.presentationState.ascending,
    rampAscending: foundation.rider.presentationState.rampAscending,
    bodyY: foundation.rider.chimpion.root.position.y,
    baseBodyY: foundation.rider.baseChimpionY,
    leftTargetY: foundation.rider.footIK.targets.left.position.y,
    rightTargetY: foundation.rider.footIK.targets.right.position.y,
    leftTargetBaseY: foundation.rider.footIK.targets.left.userData.baseY,
    rightTargetBaseY: foundation.rider.footIK.targets.right.userData.baseY,
    footIK: { ...foundation.rider.footIK.result },
    leftHand: world(rig.leftHand),
    rightHand: world(rig.rightHand),
    leftKnee: world(rig.leftShin),
    rightKnee: world(rig.rightShin),
    leftFoot: world(rig.leftFoot),
    rightFoot: world(rig.rightFoot),
  };
});

const trickPresentationProbe = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  const simulation = foundation.simulation;
  const profile = foundation.profile;
  const wallX = (side, fraction) => side * (
    profile.flatHalfWidth + profile.transitionWidth * fraction
  );

  simulation.reset({
    pipeX: wallX(-1, 0.84),
    tangentVelocity: -7,
  });
  simulation.setTurnIntent(1);
  simulation.stepFixed();
  simulation.setTurnIntent(0);
  const kickHalfSteps = Math.max(
    1,
    Math.round(simulation.snapshot().surfaceTrickDuration / simulation.fixedDt / 2),
  );
  for (let index = 0; index < kickHalfSteps; index += 1) simulation.stepFixed();
  foundation.physics.applyCurrentState();
  const kick = {
    trick: simulation.snapshot().lastTrick,
    yaw: foundation.rider.trickCarrier.rotation.y,
    roll: foundation.rider.trickCarrier.rotation.z,
    visualActive: foundation.rider.presentationState.trickVisualActive,
  };

  simulation.reset({
    pipeX: wallX(-1, 0.999),
    tangentVelocity: -7,
  });
  simulation.setHandPlantHeld(true);
  simulation.stepFixed();
  simulation.setHandPlantHeld(false);
  const handPlantHalfSteps = Math.max(
    1,
    Math.round(simulation.snapshot().surfaceTrickDuration / simulation.fixedDt / 2),
  );
  for (let index = 0; index < handPlantHalfSteps; index += 1) simulation.stepFixed();
  foundation.physics.applyCurrentState();
  const handPlant = {
    trick: simulation.snapshot().lastTrick,
    pipeX: simulation.snapshot().pipeX,
    leftLip: profile.leftLip,
    lipInset: simulation.lipInset,
    yaw: foundation.rider.trickCarrier.rotation.y,
    roll: foundation.rider.trickCarrier.rotation.z,
    offsetY: foundation.rider.trickCarrier.position.y,
    visualActive: foundation.rider.presentationState.trickVisualActive,
  };

  return { kick, handPlant };
});

await page.keyboard.press('F3');
const profileDebugVisible = await page.evaluate(
  () => window.__HALFPIPE_FOUNDATION__.profileDebug.root.visible,
);
await page.keyboard.press('F3');

await browser.close();

assert.equal(state.stageReady, true);
assert.equal(state.canvasOpacity, '1');
assert.equal(state.loadingDisplay, 'none');
assert.equal(state.score, '0');
assert.equal(state.time, '1:15');
assert.equal(state.backgroundAsset, '/images/backgrounds/halfpipe-chimpions-merch.jpg');
assert.ok(state.backgroundImage.includes('halfpipe-chimpions-merch.jpg'));
assert.ok(state.backgroundDimensions[0] >= 1600);
assert.ok(state.backgroundDimensions[1] >= 900);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] > 1.76);
assert.ok(state.backgroundDimensions[0] / state.backgroundDimensions[1] < 1.8);
assert.equal(state.wheelCount, 4);
assert.equal(state.wheelSpinSafe, true, 'Phase 4 skateboard runtime must expose four safe semantic wheel pivots');
assert.ok(state.measuredWheelDiameter > 0.075, `scaled skateboard wheel diameter is too small: ${state.measuredWheelDiameter}`);
assert.ok(state.surfaceSupportPointCount >= 6);
assert.ok(state.chimpionTargetHeight >= 2.3, `chimpion target height should be visibly larger: ${state.chimpionTargetHeight}`);
assert.ok(state.skateboardSourceScale >= 0.11, `skateboard source scale should be visibly larger: ${state.skateboardSourceScale}`);
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
  axleAxis: '+Z',
  noseDirection: '+X',
  tailDirection: '-X',
  leftSide: '+Z',
  rightSide: '-Z',
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
assert.equal(backFacingPoseProbe.ascending, true);
assert.equal(backFacingPoseProbe.rampAscending, true);
assert.ok(
  Math.cos(backFacingPoseProbe.facingYaw) < 0,
  `back-facing probe should really be fakie: ${JSON.stringify(backFacingPoseProbe)}`,
);
assert.ok(
  backFacingPoseProbe.footIK.enabled
    && backFacingPoseProbe.footIK.maxError < 0.08,
  `back-facing feet must stay planted on skateboard: ${JSON.stringify(backFacingPoseProbe)}`,
);
assert.ok(
  backFacingPoseProbe.bodyY
    <= backFacingPoseProbe.baseBodyY - 0.03,
  `fakie body should be seated lower toward the deck: ${JSON.stringify(backFacingPoseProbe)}`,
);
assert.ok(
  backFacingPoseProbe.leftTargetY
    <= backFacingPoseProbe.leftTargetBaseY - 0.04
    && backFacingPoseProbe.rightTargetY
      <= backFacingPoseProbe.rightTargetBaseY - 0.04,
  `fakie foot targets should be pulled down onto the deck: ${JSON.stringify(backFacingPoseProbe)}`,
);
assert.ok(
  Math.abs(backFacingPoseProbe.leftHand[1] - backFacingPoseProbe.leftKnee[1]) < 0.35
    && Math.abs(backFacingPoseProbe.rightHand[1] - backFacingPoseProbe.rightKnee[1]) < 0.35,
  `ascending fakie hands should stay down near the knees, not raised: ${JSON.stringify(backFacingPoseProbe)}`,
);
assert.ok(
  dropInProbe.pipeX > 0
    && Math.abs(dropInProbe.pipeX - dropInProbe.rightLip) < 0.12,
  `drop-in should start at the top of the RIGHT wall: ${JSON.stringify(dropInProbe)}`,
);
assert.ok(
  dropInProbe.dropInRoll > 0.12 && dropInProbe.carrierRoll > 0.12,
  `drop-in manual nose lift is not visible: ${JSON.stringify(dropInProbe)}`,
);
assert.ok(
  Math.abs(dropInProbe.topWheelGap) < 0.05,
  `drop-in upper wheel should begin at the coping/white bar, gap=${dropInProbe.topWheelGap}: ${JSON.stringify(dropInProbe)}`,
);
assert.equal(trickPresentationProbe.kick.trick, 'kick-turn');
assert.equal(trickPresentationProbe.kick.visualActive, true);
assert.ok(
  Math.abs(trickPresentationProbe.kick.yaw) > 0.45,
  `kick turn carrier yaw is not visible: ${trickPresentationProbe.kick.yaw}`,
);
assert.equal(trickPresentationProbe.handPlant.trick, 'hand-plant');
assert.equal(trickPresentationProbe.handPlant.visualActive, true);
assert.ok(
  Math.abs(
    trickPresentationProbe.handPlant.pipeX
      - (trickPresentationProbe.handPlant.leftLip
        + trickPresentationProbe.handPlant.lipInset)
  ) < 1e-6,
  `hand plant must be visually pinned to the white coping bar: ${JSON.stringify(trickPresentationProbe.handPlant)}`,
);
assert.ok(
  Math.abs(trickPresentationProbe.handPlant.roll) > 0.6,
  `hand plant carrier roll is not visible: ${trickPresentationProbe.handPlant.roll}`,
);
assert.ok(
  trickPresentationProbe.handPlant.offsetY > 0.12,
  `hand plant carrier lift is not visible: ${trickPresentationProbe.handPlant.offsetY}`,
);
assert.ok(airTransition.launch, 'air transition probe must reach airborne mode');
assert.ok(
  airTransition.launch.lipDistance >= 0.004,
  `takeoff anchor must preserve the configured near-coping position instead of snapping to the mathematical lip: ${airTransition.launch.lipDistance}`,
);
assert.ok(
  airTransition.launch.rootDelta < 0.4,
  `ramp-to-air presentation jump is too large: ${airTransition.launch.rootDelta}`,
);
assert.ok(airTransition.landing, 'air transition probe must return to contact mode');
assert.ok(
  airTransition.landing.rootDelta < 0.4,
  `air-to-ramp presentation jump is too large: ${airTransition.landing.rootDelta}`,
);
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
  airTransition,
  trickPresentationProbe,
  dropInProbe,
  backFacingPoseProbe,
}, null, 2));
