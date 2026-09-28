import assert from 'node:assert/strict';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { resolveContactClearance } from '../src/halfpipe/HalfpipeContactClearance.js';

const profile = new HalfpipeProfile();
const boardHalfLength = 0.456;
const wheelDiameter = 0.072;
const baseClearance = 0.18;
const supportPoints = [
  { name: 'rear-wheel', position: { x: -0.31, y: 0 } },
  { name: 'front-wheel', position: { x: 0.31, y: 0 } },
  { name: 'tail-underside', position: { x: -boardHalfLength, y: 0.04 } },
  { name: 'nose-underside', position: { x: boardHalfLength, y: 0.04 } },
];

function frameAt(x) {
  const sample = profile.sample(x);
  const tangent = sample.tangent.clone();
  const normal = sample.normal.clone();
  if (tangent.x < 0) tangent.multiplyScalar(-1);
  if (normal.y < 0) normal.multiplyScalar(-1);
  return {
    sample,
    tangent,
    normal,
    angle: Math.atan2(tangent.y, tangent.x),
  };
}

function solveAt(x) {
  const frame = frameAt(x);
  const slopeInfluence = Math.abs(frame.tangent.y);
  return resolveContactClearance({
    profile,
    sample: frame.sample,
    normal: frame.normal,
    angle: frame.angle,
    supportPoints,
    baseClearance,
    minimumSeparation: baseClearance + wheelDiameter * slopeInfluence,
  });
}

const center = solveAt(0);
const left = solveAt(-6.05);
const right = solveAt(6.05);

assert.ok(Math.abs(center.clearance - baseClearance) < 1e-6);
assert.ok(left.clearance > baseClearance);
assert.ok(right.clearance > baseClearance);
assert.ok(left.minSeparation >= left.minimumSeparation - 1e-5);
assert.ok(right.minSeparation >= right.minimumSeparation - 1e-5);
assert.ok(Math.abs(left.clearance - right.clearance) < 1e-5);
assert.ok(left.extraClearance < 0.2);
assert.ok(right.extraClearance < 0.2);

console.log(JSON.stringify({ center, left, right }, null, 2));
