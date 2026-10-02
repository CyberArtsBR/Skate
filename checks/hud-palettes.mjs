import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the actual HUD methods with a graffiti renderer spy. The browser
// presentation check separately verifies the atlas pixels and transparency.
const draws = [];
const setGraffitiText = (element, text, options) => {
  draws.push({ element, text, ...options });
};
function element() {
  const children = new Map();
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {} }, hidden: true,
    classList: {
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
      contains(name) { return classes.has(name); },
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
    },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
  };
}
function loadClass(file, name, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import\s[^;]+;\s*/gm, '')
    .replace(/^export\s/gm, '');
  return vm.runInNewContext(`${source}\n${name};`, dependencies, { filename: file });
}

const root = element();
const stage = { append(node) { node.parentElement = stage; } };
const HalfpipeHUD = loadClass('../src/ui/HalfpipeHUD.js', 'HalfpipeHUD', {
  document: { createElement: () => root }, URLSearchParams,
  setGraffitiText, refreshGraffitiTextTree() {}, applyGameUIPreferences() {},
  TrickFeedback: class {},
});
const hud = new HalfpipeHUD(stage);
assert.deepEqual(draws.map(({ text, palette }) => [text, palette]), [
  ['SCORE', 'fire'], ['TIME', 'fire'], ['0', 'fire'], ['1:15', 'fire'],
]);
hud.setScore(3217);
assert.equal(draws.at(-1).text, '3,217');
assert.equal(draws.at(-1).palette, 'fire');
for (const [time, low] of [['0:37', false], ['0:10', true], ['0:09', true], ['0:00', true]]) {
  hud.setTime(time);
  assert.equal(draws.at(-1).text, time);
  assert.equal(draws.at(-1).palette, 'fire', 'time must keep the yellow/red atlas even at low time');
  assert.equal(draws.at(-1).align, 'right');
  assert.equal(root.classList.contains('is-time-low'), low, 'keep the existing low-time state');
}

const TrickFeedback = loadClass('../src/ui/TrickFeedback.js', 'TrickFeedback', {
  setGraffitiText, clearTimeout, Date,
});
const feedback = new TrickFeedback(element());
const name = feedback.trick.querySelector('.trick-award-name');
const points = feedback.trick.querySelector(':scope > span');
points.textContent = '+1,421';
feedback._show = () => { feedback.trick.hidden = false; };
draws.length = 0;
feedback.showTrick('fakie-aerial-540', 1421);
assert.deepEqual(draws.map(({ text, palette }) => [text, palette]), [
  ['FAKIE AERIAL 540°', 'green'], ['+1,421', 'green'],
]);
assert.equal(draws[0].element, name);
assert.equal(draws[1].element, points);
assert.equal(draws[0].wrap, true);
assert.equal(draws[0].maxLines, 2);
assert.equal(feedback.landing.hidden, true);
assert.equal(feedback.status.hidden, true);

console.log('HUD palettes passed: SCORE/TIME fire, trick name/score green, including low time.');
