import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The existing Render service still invokes check:release. Deployments are
// build-only at the owner's request; manual local release checks keep their
// original suite. render.yaml also declares the direct build command.
const suites = process.env.RENDER === 'true'
  ? ['build']
  : ['check:static', 'check:physics', 'check:contact', 'check:session',
    'check:controller', 'check:camera', 'check:tricks', 'check:gameplay',
    'check:v9', 'check:v15', 'check:rigs', 'check:character', 'check:ui',
    'check:integration', 'build'];
if (process.env.RENDER === 'true') console.log('[Deploy] Build only; playtesting is handled by the owner.');
const runner = fileURLToPath(new URL('../checks/run-npm-suite.mjs', import.meta.url));
const child = spawn(process.execPath, [runner, ...suites], { stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
