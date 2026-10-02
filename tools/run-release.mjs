import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Canonical non-browser release validation. Historical V9/Phase 4 suites remain
// available as explicit legacy diagnostics, but they no longer define the
// approved current tuning. Production deployment is gated by GitHub Actions.
const suites = [
  'check:syntax',
  'check:contracts',
  'check:gameplay:current',
  'check:contact',
  'check:session',
  'check:controller',
  'check:camera',
  'check:v15',
  'check:coping-glow',
  'check:graffiti-ramp',
  'check:aerial-tuck',
  'check:rigs',
  'check:character',
  'check:hud-palettes',
  'check:map-lighting',
  'build',
];

const runner = fileURLToPath(new URL('../checks/run-npm-suite.mjs', import.meta.url));
const child = spawn(process.execPath, [runner, ...suites], { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
