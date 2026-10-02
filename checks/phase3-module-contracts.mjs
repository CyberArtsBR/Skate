import assert from 'node:assert/strict';
import fs from 'node:fs';

const motionSource = fs.readFileSync('src/halfpipe/HalfpipeMotionSolver.js', 'utf8');
const statsSource = fs.readFileSync('src/halfpipe/RunStatistics.js', 'utf8');

assert.match(motionSource, /export class HalfpipeMotionSolver/);
assert.match(motionSource, /computeLaunchVelocity\(/);
assert.match(motionSource, /integrateAirStep\(/);
assert.match(motionSource, /integrateSurfaceX\(/);
assert.doesNotMatch(motionSource, /\bthis\.state\b/);
assert.doesNotMatch(motionSource, /HalfpipeVisual|RiderController|document\.|window\.|createScene/);

assert.match(statsSource, /export function snapshotRunStatistics/);
assert.doesNotMatch(statsSource, /HalfpipeVisual|RiderController|document\.|window\.|createScene/);

console.log('Phase 3 module contracts passed.');
