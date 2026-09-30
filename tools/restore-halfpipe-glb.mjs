import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const sourceDir = path.join(root, 'src', 'v16');
const output = path.join(root, 'public', 'models', 'halfpipe', 'halfpipe.glb');
const parts = [];

for (let index = 0; index <= 5; index += 1) {
  const name = `halfpipeGlbChunk${String(index).padStart(2, '0')}.js`;
  const source = fs.readFileSync(path.join(sourceDir, name), 'utf8');
  const match = source.match(/export default '([^']*)';?\s*$/s);
  if (!match) throw new Error(`Invalid Halfpipe GLB chunk: ${name}`);
  parts.push(match[1]);
}

const bytes = Buffer.from(parts.join(''), 'base64');
if (bytes.toString('ascii', 0, 4) !== 'glTF') {
  throw new Error('Restored Halfpipe asset is not a GLB');
}
const version = bytes.readUInt32LE(4);
const declaredLength = bytes.readUInt32LE(8);
if (version !== 2 || declaredLength !== bytes.length) {
  throw new Error(`Invalid Halfpipe GLB header: version=${version} declared=${declaredLength} actual=${bytes.length}`);
}

const hash = crypto.createHash('sha256').update(bytes).digest('hex');
if (hash !== '345faa11b593c2000831882d21c3dcd593de1cf2f34dcfb3ef18548b7a610468') {
  throw new Error(`Unexpected Halfpipe GLB SHA256: ${hash}`);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, bytes);
console.log(`Restored exact Halfpipe GLB · ${bytes.length} bytes · sha256 ${hash}`);
