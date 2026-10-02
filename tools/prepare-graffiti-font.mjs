/**
 * Deterministically prepares the five user-supplied graffiti alphabet sheets.
 * No font approximation or image generation is involved: the original colored
 * strokes become transparent PNG sprites, with their source crop coordinates.
 * Usage: node tools/prepare-graffiti-font.mjs [directory containing source PNGs]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = process.argv[2] || 'C:/Users/meltb/Downloads';
const sources = {
  gold: 'b6967d1a-370c-4ea4-b886-5c3b4b5b4096.png',
  fire: 'd9409ab3-f282-4e87-8ce1-86e7c6d211cf.png',
  green: '7eea4dfc-c1e0-46fb-9bf9-c3f930f4fb98.png',
  red: '1b8ecc5a-010a-4b90-8acc-a29da1c83308.png',
  cyan: '2cd1266a-68d5-4941-af9d-6ac6d2e347fa.png',
};

function decodePng(buffer) {
  let width, height, channels, compressed = [];
  for (let at = 8; at < buffer.length;) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) {
        throw new Error('Expected a non-interlaced, eight-bit RGB/RGBA PNG');
      }
      channels = data[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') compressed.push(data);
    at += length + 12;
  }
  const scanlines = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const raw = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1), filter = scanlines[row];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? raw[y * stride + x - channels] : 0;
      const up = y ? raw[(y - 1) * stride + x] : 0;
      const upperLeft = y && x >= channels ? raw[(y - 1) * stride + x - channels] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      if (prediction === undefined) throw new Error(`Unsupported PNG filter ${filter}`);
      raw[y * stride + x] = (scanlines[row + x + 1] + prediction) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    raw.copy(rgba, i * 4, i * channels, i * channels + 3);
    rgba[i * 4 + 3] = channels === 4 ? raw[i * channels + 3] : 255;
  }
  return { width, height, rgba };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++) crc = crcTable[(crc ^ chunk[i]) & 255] ^ (crc >>> 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}
function encodePng({ width, height, rgba }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const stride = width * 4, rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function removeLightBacking(image) {
  for (let i = 0; i < image.rgba.length; i += 4) {
    const rgb = [image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]];
    const low = Math.min(...rgb), high = Math.max(...rgb), chroma = high - low;
    if (low >= 208 && chroma < 48) {
      image.rgba.fill(0, i, i + 4);
    } else if (low > 150 && chroma < 32) {
      // Neutral antialiased outlines were blended against the light backing.
      // Recover their dark ink plus alpha instead of retaining a white fringe.
      const alpha = (255 - low) / 105;
      for (let c = 0; c < 3; c++) image.rgba[i + c] = Math.max(0, Math.round((rgb[c] - 255 * (1 - alpha)) / alpha));
      image.rgba[i + 3] = Math.round(Math.min(1, alpha) * image.rgba[i + 3]);
    }
  }
}

const standardRows = [
  ['ABCDEF', 0, 242, [0, 292, 506, 734, 951, 1193, 1448]],
  ['GHIJKLM', 242, 449, [0, 211, 446, 613, 807, 1030, 1201, 1448]],
  ['NOPQRST', 449, 669, [0, 222, 428, 610, 812, 1006, 1210, 1448]],
  ['UVWXYZ', 669, 864, [0, 236, 443, 741, 976, 1215, 1448]],
  ['0123456789', 864, 1008, [0, 154, 265, 407, 540, 688, 825, 969, 1113, 1265, 1448]],
];
const cyanRows = [
  ['ABCDEF', 0, 250, [0, 291, 507, 733, 952, 1191, 1448]],
  ['GHIJKLM', 250, 471, [0, 211, 446, 614, 807, 1030, 1202, 1448]],
  ['NOPQRST', 471, 694, [0, 222, 429, 610, 812, 1007, 1210, 1448]],
  ['UVWXYZ', 694, 903, [0, 236, 444, 742, 977, 1216, 1448]],
  ['012345678%', 903, 1086, [0, 174, 264, 410, 542, 691, 827, 969, 1114, 1265, 1448]],
];

function trimmedCrop(image, left, top, right, bottom) {
  let x0 = right, y0 = bottom, x1 = left, y1 = top;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      if (image.rgba[(y * image.width + x) * 4 + 3] < 24) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error(`Empty crop at ${left},${top}`);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, scale: 1 };
}

const manifest = {};
const prepared = {};
for (const [palette, filename] of Object.entries(sources)) {
  const image = decodePng(fs.readFileSync(path.join(sourceDirectory, filename)));
  if (image.width !== 1448 || image.height !== 1086) throw new Error(`Unexpected sheet dimensions: ${filename}`);
  removeLightBacking(image);
  const glyphs = {};
  for (const [letters, top, bottom, cuts] of palette === 'cyan' ? cyanRows : standardRows) {
    [...letters].forEach((letter, index) => { glyphs[letter] = trimmedCrop(image, cuts[index], top, cuts[index + 1], bottom); });
  }
  if (palette !== 'cyan') {
    const punctuation = [
      [':', 199, 304, .55], ['.', 323, 405, .2], [',', 405, 490, .32],
      ['!', 502, 612, .83], ['?', 640, 750, .8], ['-', 792, 905, .28],
      ['(', 954, 1057, .72], [')', 1083, 1200, .72],
    ];
    for (const [letter, left, right, scale] of punctuation) {
      // The exclamation's tall upper stroke starts above its neighboring marks.
      glyphs[letter] = { ...trimmedCrop(image, left, letter === '!' ? 984 : 1008, right, 1086), scale };
    }
  }
  prepared[palette] = image;
  manifest[palette] = { file: `${palette}.png`, width: image.width, height: image.height, glyphs };
}

// The cyan sheet ends in '%' rather than '9'. Reuse the supplied gold 9 shape
// and recolor only its colored strokes; outlines, depth and silhouette survive.
const cyan = prepared.cyan, gold = prepared.gold, nine = manifest.gold.glyphs['9'];
const extended = Buffer.alloc(cyan.width * (cyan.height + nine.h + 4) * 4);
cyan.rgba.copy(extended);
for (let y = 0; y < nine.h; y++) {
  for (let x = 0; x < nine.w; x++) {
    const from = ((nine.y + y) * gold.width + nine.x + x) * 4;
    const to = ((cyan.height + 2 + y) * cyan.width + x) * 4;
    const rgb = [gold.rgba[from], gold.rgba[from + 1], gold.rgba[from + 2]];
    const intensity = Math.max(...rgb) / 255;
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    const t = Math.min(1, y / nine.h);
    const color = t < .5 ? [20 + t * 80, 236 - t * 130, 255] : [100 + (t - .5) * 40, 95 - (t - .5) * 150, 239 - (t - .5) * 70];
    for (let c = 0; c < 3; c++) extended[to + c] = chroma > 35 ? Math.round(color[c] * intensity) : rgb[c];
    extended[to + 3] = gold.rgba[from + 3];
  }
}
manifest.cyan.glyphs['9'] = { x: 0, y: cyan.height + 2, w: nine.w, h: nine.h, scale: 1 };
cyan.height += nine.h + 4;
cyan.rgba = extended;
manifest.cyan.height = cyan.height;

const destination = path.join(project, 'public/fonts/graffiti');
fs.mkdirSync(destination, { recursive: true });
for (const [palette, image] of Object.entries(prepared)) {
  const output = encodePng(image);
  fs.writeFileSync(path.join(destination, `${palette}.png`), output);
  console.log(`${palette}: ${Object.keys(manifest[palette].glyphs).length} glyphs, ${Math.round(output.length / 1024)} KiB`);
}
fs.writeFileSync(path.join(project, 'src/ui/graffiti-atlas.js'),
  `// Generated by tools/prepare-graffiti-font.mjs from the supplied alphabet sheets.\nexport const GRAFFITI_ATLAS = ${JSON.stringify(manifest, null, 2)};\n`);
