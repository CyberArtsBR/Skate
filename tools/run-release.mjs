import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Canonical non-browser release validation. Production deployment is gated by
// GitHub Actions; Render performs a clean build only after those checks pass.
const suites = [
  'check:syntax',
  'check:contracts',
  'check:physics',
  'check:contact',
  'check:session',
  'check:controller',
  'check:camera',
  'check:tricks',
  'check:gameplay',
  'check:v9',
  'check:v15',
  'check:coping-glow',
  'check:graffiti-ramp',
  'check:aerial-tuck',
  'check:rigs',
  'check:character',
  'check:ui',
  'check:integration',
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
