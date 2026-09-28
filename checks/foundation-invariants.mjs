import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { createRiderPresentationState } from '../src/character/RiderPresentationState.js';

const profile = new HalfpipeProfile();
const center = profile.sample(0);
const left = profile.sample(profile.leftLip);
const right = profile.sample(profile.rightLip);

assert.equal(center.region, 'flat-bottom');
assert.equal(center.y, 0);
assert.equal(left.region, 'left-transition');
assert.equal(right.region, 'right-transition');
assert.ok(Math.abs(left.y - right.y) < 1e-8, 'profile must be symmetric');
assert.ok(Math.abs(left.y - profile.transitionHeight) < 0.01, 'lip height must match config');
assert.ok(Math.abs(right.tangent.length() - 1) < 1e-8, 'surface tangent must be normalized');
assert.ok(Math.abs(right.normal.length() - 1) < 1e-8, 'surface normal must be normalized');
assert.ok(Math.abs(right.tangent.dot(right.normal)) < 1e-8, 'normal must be perpendicular');

const presentationState = createRiderPresentationState({
  pipeX: 4,
  pumpCompression: 3,
  landing: -1,
  speedNormalized: 0.5,
});
assert.equal(presentationState.pipeX, 4);
assert.equal(presentationState.pumpCompression, 1);
assert.equal(presentationState.landing, 0);
assert.equal(presentationState.speedNormalized, 0.5);

for (const file of [
  'public/models/halfpipe/halfpipe.glb',
  'public/models/skateboard/skateboard.glb',
  'public/models/characters/The Heretic.glb',
]) {
  assert.ok(fs.statSync(file).size > 1024, `${file} must contain a non-empty GLB`);
}

console.log('Foundation invariants passed.');
