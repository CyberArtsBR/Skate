import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const requiredImport of [
  'HalfpipeGameFlow',
  'HalfpipeVFX',
  'HalfpipeAudio',
  'RenderQualityManager',
  'ResultsScreen',
]) {
  assert.ok(main.includes(requiredImport), `main integration must include ${requiredImport}`);
}

assert.match(main, /result\.steps\s*\*\s*simulation\.fixedDt/, 'camera/session presentation dt must derive from actual fixed steps');
assert.doesNotMatch(main, /updateForRider\([\s\S]{0,300}?simulation\.fixedDt\s*\)/, 'camera must not receive unconditional fixedDt per render frame');
assert.ok((main.match(/simulation\.drainEvents\(\)/g) || []).length >= 1, 'gameplay event queue must be drained by integration');
assert.match(main, /routeGameplayEvents\(/, 'gameplay events must fan out through a central router');
assert.match(main, /audio\.unlock\(/, 'audio context must unlock from the integration interaction path');
assert.match(main, /getRunStats\(\)/, 'results must consume gameplay-core authoritative run stats');
assert.match(main, /HALFPIPE_FLOW_STATE\.TITLE/, 'flow must include title');
assert.match(main, /HALFPIPE_FLOW_STATE\.CHARACTER_SELECT/, 'flow must include character select');
assert.match(main, /HALFPIPE_FLOW_STATE\.CONTROLS/, 'flow must include controls/tutorial');
assert.match(main, /HALFPIPE_FLOW_STATE\.COUNTDOWN/, 'flow must include countdown');
assert.match(main, /HALFPIPE_FLOW_STATE\.RUN/, 'flow must include run');
assert.match(main, /HALFPIPE_FLOW_STATE\.RESULTS/, 'flow must include results');
assert.match(main, /webglcontextlost/, 'runtime must protect WebGL context loss');
assert.match(main, /webglcontextrestored/, 'runtime must define context-restoration behavior');
assert.doesNotMatch(main, /RoomEnvironment/, 'legacy generic RoomEnvironment must not return');
assert.match(main, /GRAPHICS_STORAGE_KEY/, 'graphics quality selection should persist locally');
assert.match(main, /DEFAULT_GRAPHICS_PRESET/, 'graphics integration must retain an explicit safe default');

for (const script of ['check:gameplay', 'check:character', 'check:ui', 'check:integration']) {
  assert.ok(packageJson.scripts?.[script], `package scripts must preserve ${script}`);
  assert.ok(packageJson.scripts['check:release'].includes(script), `release gate must execute ${script}`);
}

console.log('Phase 4 integration contracts passed.');
