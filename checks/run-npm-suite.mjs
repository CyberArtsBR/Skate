import { spawnSync } from 'node:child_process';

const scripts = process.argv.slice(2);
if (!scripts.length) {
  console.error('Usage: node checks/run-npm-suite.mjs <npm-script> [...]');
  process.exit(2);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];

for (const script of scripts) {
  console.log('\n=== npm run ' + script + ' ===');
  const result = spawnSync(npmCommand, ['run', script], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    failures.push(script + ': ' + result.error.message);
    continue;
  }
  if (result.status !== 0) {
    failures.push(script + ': exit ' + result.status);
  }
}

if (failures.length) {
  console.error('\nRelease suite failures:');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('\nRelease suite passed: ' + scripts.join(', '));
}
