import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CountdownTimer } from '../src/ui/CountdownOverlay.js';
import {
  CONTROLLER_FAMILY,
  detectControllerFamily,
  glyphFor,
} from '../src/ui/ControllerGlyphs.js';
import { resolveDebugMode } from '../src/ui/HalfpipeHUD.js';
import { normalizeResultsStats } from '../src/ui/ResultsScreen.js';
import {
  HALFPIPE_FLOW_STATE,
  HalfpipeGameFlow,
} from '../src/game/HalfpipeGameFlow.js';

assert.equal(resolveDebugMode(''), false);
assert.equal(resolveDebugMode('?debug=0'), false);
assert.equal(resolveDebugMode('?debug=1'), true);

assert.equal(
  detectControllerFamily('Xbox Wireless Controller'),
  CONTROLLER_FAMILY.XBOX,
);
assert.equal(
  detectControllerFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)'),
  CONTROLLER_FAMILY.PLAYSTATION,
);
assert.equal(
  detectControllerFamily(''),
  CONTROLLER_FAMILY.KEYBOARD,
);
assert.equal(glyphFor('confirm', CONTROLLER_FAMILY.XBOX), 'A');
assert.equal(glyphFor('confirm', CONTROLLER_FAMILY.PLAYSTATION), '×');
assert.equal(glyphFor('tertiary', CONTROLLER_FAMILY.PLAYSTATION), '□');

const stats = normalizeResultsStats({
  score: 9876.4,
  bestTrick: 'AERIAL 180 +811',
  highestAir: 3.126,
  longestCombo: 2,
  tricksLanded: 12,
  perfectLandings: 4,
  crashes: 1,
  pumpAccuracy: 0.875,
});
assert.deepEqual(stats, {
  finalScore: 9876,
  bestTrick: 'AERIAL 180 +811',
  highestAir: '3.13m',
  longestCombo: '×2',
  tricksLanded: 12,
  perfectLandings: 4,
  crashes: 1,
  pumpAccuracy: '88%',
});

const countdownEvents = [];
const countdown = new CountdownTimer({
  onTick(value) {
    countdownEvents.push(String(value));
  },
  onGo() {
    countdownEvents.push('GO');
  },
  onComplete() {
    countdownEvents.push('COMPLETE');
  },
});

countdown.start();
countdown.step(1);
countdown.step(1);
countdown.step(1);
countdown.step(0.7);
assert.deepEqual(countdownEvents, ['3', '2', '1', 'GO', 'COMPLETE']);
assert.equal(countdown.snapshot().complete, true);

const transitions = [];
const flow = new HalfpipeGameFlow({
  callbacks: {
    onTransition(payload) {
      transitions.push(payload.state);
    },
  },
});
assert.equal(flow.snapshot().state, HALFPIPE_FLOW_STATE.TITLE);
assert.equal(flow.transitionTo(HALFPIPE_FLOW_STATE.CHARACTER_SELECT), true);
assert.equal(flow.transitionTo(HALFPIPE_FLOW_STATE.COUNTDOWN), true);
assert.equal(flow.transitionTo(HALFPIPE_FLOW_STATE.RUN), true);
assert.equal(flow.transitionTo(HALFPIPE_FLOW_STATE.RESULTS), true);
assert.equal(flow.transitionTo(HALFPIPE_FLOW_STATE.PAUSE), false);
assert.deepEqual(transitions, [
  'character-select',
  'countdown',
  'run',
  'results',
]);

const desktopOnlyFiles = [
  'src/input/HalfpipePumpInput.js',
  'src/ui/HalfpipeHUD.js',
  'src/ui/ResultsScreen.js',
  'src/ui/PauseMenu.js',
  'src/ui/ControlsScreen.js',
  'src/ui/CountdownOverlay.js',
];
const forbiddenTouchTokens = [
  'touchstart',
  'touchend',
  'touchmove',
  'virtual-joystick',
  'virtual joystick',
  'swipe',
];

for (const path of desktopOnlyFiles) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8').toLowerCase();
  for (const token of forbiddenTouchTokens) {
    assert.equal(
      source.includes(token),
      false,
      path + ' unexpectedly introduced mobile/touch control token: ' + token,
    );
  }
}

console.log('phase 4 UI flow regression passed');
