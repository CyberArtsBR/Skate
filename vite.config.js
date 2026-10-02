import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const mapFiles = ['city.jpg', 'treehouse.jpg', 'cyber-night.png', 'canyon-session.png',
  'skate-park.png', 'space.png', 'the-gym-thumb.png', 'japan-thumb.png'];
const mapVersions = Object.fromEntries(mapFiles.map((file) => [
  file,
  createHash('sha256')
    .update(readFileSync(new URL('./public/images/maps/' + file, import.meta.url)))
    .digest('hex').slice(0, 12),
]));

export default defineConfig({
  define: { __HALFPIPE_MAP_VERSIONS__: JSON.stringify(mapVersions) },
});
