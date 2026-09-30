import fs from 'node:fs';

let summary = 'pass';
try {
  await import('../checks/v9-gameplay-regressions.mjs');
} catch (error) {
  const firstStack = String(error?.stack || '')
    .split('\n')
    .find((line) => line.includes('v9-gameplay-regressions.mjs'))
    || '';
  summary = `${error?.name || 'Error'}:${error?.message || 'unknown'}:${firstStack}`;
}

summary = summary
  .replace(/[^A-Za-z0-9_.:()=+\- ]/g, '_')
  .replace(/\s+/g, '_')
  .slice(0, 220);

console.log(summary);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
}
