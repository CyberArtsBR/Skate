import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const sourceDir = path.join(root, 'src', 'v16');
const output = path.join(root, 'public', 'images', 'backgrounds', 'halfpipe-title.jpg');
const parts = [];

for (let index = 0; index <= 13; index += 1) {
  const name = `titleImageChunk${String(index).padStart(2, '0')}.js`;
  const source = fs.readFileSync(path.join(sourceDir, name), 'utf8');
  const match = source.match(/export default '([^']*)';?\s*$/s);
  if (!match) throw new Error(`Invalid Halfpipe title chunk: ${name}`);
  parts.push(match[1]);
}

const bytes = Buffer.from(parts.join(''), 'base64');
if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
  throw new Error('Restored Halfpipe title is not a valid JPEG stream');
}

let width = 0;
let height = 0;
for (let offset = 2; offset + 9 < bytes.length;) {
  if (bytes[offset] !== 0xff) { offset += 1; continue; }
  const marker = bytes[offset + 1];
  if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
  const length = bytes.readUInt16BE(offset + 2);
  if (length < 2 || offset + 2 + length > bytes.length) break;
  if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
    height = bytes.readUInt16BE(offset + 5);
    width = bytes.readUInt16BE(offset + 7);
    break;
  }
  offset += 2 + length;
}

if (width !== 1672 || height !== 941) {
  throw new Error(`Unexpected Halfpipe title dimensions: ${width}x${height}`);
}

const hash = crypto.createHash('sha256').update(bytes).digest('hex');
if (hash !== '53693ce610f9298f29430d9e5fb8421931da210e9361e204d20fcc7217b13159') {
  throw new Error(`Unexpected Halfpipe title SHA256: ${hash}`);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, bytes);
console.log(`Restored exact Halfpipe title ${width}x${height} · ${bytes.length} bytes · sha256 ${hash}`);
