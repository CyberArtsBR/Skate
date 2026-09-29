import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.env.HALFPIPE_PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.halfpipe?.ridingSurface));
await page.waitForFunction(() => Boolean(window.__HALFPIPE_FOUNDATION__?.rider));

const results = await page.evaluate(() => {
  const foundation = window.__HALFPIPE_FOUNDATION__;
  foundation.physics.setRunning(false);

  const ridingCenter = foundation.halfpipe.ridingSurfaceBounds
    .getCenter(foundation.halfpipe.ridingSurfaceBounds.min.clone());

  const stations = foundation.presentationDebug.stations.map((_, index) => {
    foundation.presentationDebug.select(index);
    foundation.rider.root.updateWorldMatrix(true, true);

    const sample = foundation.presentationBinder.lastSample;
    const Vector3 = foundation.rider.root.position.constructor;
    const worldNormal = new Vector3(sample.normal.x, sample.normal.y, 0).normalize();

    const supports = foundation.rider.skateboard.surfaceSupportPoints.map((support) => {
      const worldPoint = foundation.rider.skateboard.root.localToWorld(support.position.clone());
      const hit = foundation.halfpipe.measureRidingSurfaceSeparation(worldPoint, worldNormal);
      return {
        name: support.name,
        separation: hit?.separation ?? null,
        point: hit?.point?.toArray?.() ?? null,
      };
    });

    const measured = supports.filter((support) => Number.isFinite(support.separation));
    return {
      station: foundation.presentationDebug.current.name,
      pipeX: foundation.rider.presentationState.pipeX,
      boardAngle: foundation.presentationBinder.lastAngle,
      profileMinSeparation: foundation.presentationBinder.lastContact?.minSeparation ?? null,
      visualMinSeparation: measured.length
        ? Math.min(...measured.map((support) => support.separation))
        : null,
      hitCount: measured.length,
      supportCount: supports.length,
      supports,
    };
  });

  return {
    alignment: { ...foundation.halfpipe.alignment },
    ridingCenterX: ridingCenter.x,
    stations,
  };
});

await fs.mkdir(path.resolve('audit'), { recursive: true });

for (const [index, name] of [
  [2, 'upper-left'],
  [3, 'left-lip'],
  [5, 'upper-right'],
  [6, 'right-lip'],
]) {
  await page.evaluate((stationIndex) => {
    window.__HALFPIPE_FOUNDATION__.presentationDebug.select(stationIndex);
  }, index);
  await page.screenshot({
    path: path.resolve('audit', `visual-contact-${name}.png`),
    fullPage: true,
  });
}

await fs.writeFile(
  path.resolve('audit', 'visual-contact.json'),
  JSON.stringify(results, null, 2),
);

await browser.close();


console.log(JSON.stringify(results, null, 2));

const violations = [];
const requireContact = (condition, message) => {
  if (!condition) violations.push(message);
};

requireContact(
  results.alignment.source === 'authored-riding-origin',
  'halfpipe alignment source must remain authored-riding-origin',
);
requireContact(
  Boolean(results.alignment.ridingSurfaceName),
  'riding surface must be named',
);
requireContact(
  Math.abs(results.alignment.appliedX - results.alignment.authoredPositionX) < 1e-8,
  `halfpipe X must preserve authored riding origin: ${results.alignment.appliedX} vs ${results.alignment.authoredPositionX}`,
);

for (const station of results.stations) {
  requireContact(
    station.hitCount >= 4,
    `${station.station} must raycast at least four skateboard support points against the visible riding mesh`,
  );
  requireContact(
    Number.isFinite(station.visualMinSeparation) && station.visualMinSeparation >= -0.01,
    `${station.station} penetrates the visible riding mesh by ${station.visualMinSeparation}`,
  );
}

const byName = Object.fromEntries(results.stations.map((station) => [station.station, station]));
for (const [leftName, rightName] of [
  ['LOWER LEFT', 'LOWER RIGHT'],
  ['UPPER LEFT', 'UPPER RIGHT'],
  ['LEFT LIP', 'RIGHT LIP'],
]) {
  const difference = Math.abs(
    byName[leftName].visualMinSeparation - byName[rightName].visualMinSeparation,
  );
  requireContact(
    difference < 0.03,
    `${leftName}/${rightName} visible-surface separation is asymmetric by ${difference}`,
  );
}

if (violations.length) {
  console.error('Visual contact regressions:');
  for (const violation of violations) console.error('- ' + violation);
  process.exitCode = 1;
} else {
  console.log('Visual contact regression passed.');
}
