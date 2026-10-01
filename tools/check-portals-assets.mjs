import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['public'];
const VALID_SEGMENT = /^[A-Za-z0-9._-]+$/;
const invalid = [];

function walk(dir, relative = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (!VALID_SEGMENT.test(entry.name)) invalid.push(rel.replaceAll('\\', '/'));
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
  }
}

for (const root of ROOTS) {
  if (fs.existsSync(root)) walk(root);
}

if (invalid.length) {
  console.error('Portals-invalid asset paths detected:');
  for (const item of invalid) console.error(` - ${item}`);
  console.error('Allowed filename characters: letters, digits, ".", "_", and "-".');
  process.exit(1);
}

console.log('Portals asset-path check passed.');
