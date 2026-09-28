import assert from 'node:assert/strict';
import { HalfpipeSession, formatSessionTime } from '../src/game/HalfpipeSession.js';

const session = new HalfpipeSession({ durationSeconds: 75 });

assert.deepEqual(session.snapshot(), {
  phase: 'ready',
  elapsed: 0,
  remaining: 75,
  duration: 75,
  score: 0,
});
assert.equal(formatSessionTime(75), '1:15');
assert.equal(formatSessionTime(74.1), '1:15');
assert.equal(formatSessionTime(60), '1:00');
assert.equal(formatSessionTime(0), '0:00');

assert.equal(session.start(), true);
assert.equal(session.phase, 'running');

session.step(1 / 120);
assert.ok(session.elapsed > 0);
assert.ok(session.remaining < 75);

assert.equal(session.pause(), true);
const paused = session.snapshot();
session.step(5);
assert.deepEqual(session.snapshot(), paused, 'paused session must not consume event time');

assert.equal(session.resume(), true);
assert.equal(session.phase, 'running');

for (let index = 0; index < 75 * 120; index += 1) {
  session.step(1 / 120);
}

assert.equal(session.phase, 'finished');
assert.equal(session.remaining, 0);
assert.ok(session.elapsed >= 75);
assert.equal(session.start(), false, 'finished run must require a reset before restart');

session.reset();
assert.equal(session.phase, 'ready');
assert.equal(session.remaining, 75);
assert.equal(session.score, 0);

console.log(JSON.stringify(session.snapshot(), null, 2));
