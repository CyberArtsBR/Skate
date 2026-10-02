import fs from 'node:fs';
import path from 'node:path';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import {
  DEFAULT_GRAPHICS_PRESET,
  GRAPHICS_PRESETS,
} from '../src/graphics/GraphicsQuality.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const violations = [];
const requireContract = (condition, message) => {
  if (!condition) violations.push(message);
};

function assetPath(asset) {
  try {
    return new URL(String(asset || ''), 'https://halfpipe.local').pathname;
  } catch {
    return String(asset || '').split('?')[0];
  }
}

function requirePublicAsset(asset, label, minimumBytes = 1024) {
  const pathname = assetPath(asset);
  requireContract(pathname.startsWith('/'), `${label} must resolve to a root-relative public asset.`);
  const file = path.join(root, 'public', pathname.replace(/^\//, ''));
  requireContract(
    fs.existsSync(file) && fs.statSync(file).size >= minimumBytes,
    `${label} is missing or unexpectedly small: ${pathname}`,
  );
}

const mainSource = read('src/main.js');
const sceneSource = read('src/scene/createScene.js');
const styleSource = read('src/style.css');
const chimpionSource = read('src/character/ChimpionLoader.js');
const simulationSource = read('src/halfpipe/HalfpipeSimulation.js');
const renderBlueprint = read('render.yaml');

requirePublicAsset(GAME_CONFIG.assets.background, 'Configured production background');
requirePublicAsset(GAME_CONFIG.assets.halfpipe, 'Configured halfpipe GLB');
requirePublicAsset(GAME_CONFIG.assets.skateboard, 'Configured skateboard GLB');

requireContract(
  Object.hasOwn(GRAPHICS_PRESETS, DEFAULT_GRAPHICS_PRESET),
  `Default graphics preset must exist: ${DEFAULT_GRAPHICS_PRESET}`,
);

const stageRule = styleSource.match(/#game-stage\s*\{([\s\S]*?)\}/)?.[1] || '';
requireContract(/width:\s*100vw\s*;/.test(stageRule), 'Game stage must fill viewport width.');
requireContract(/height:\s*100vh\s*;/.test(stageRule), 'Game stage must fill viewport height.');
requireContract(/max-width:\s*none\s*;/.test(stageRule), 'Game stage must not restore a fixed-width pillarbox.');
requireContract(/max-height:\s*none\s*;/.test(stageRule), 'Game stage must not restore a fixed-height letterbox.');
requireContract(!/aspect-ratio\s*:/.test(stageRule), 'Game stage must not enforce a fixed 16:9 aspect ratio.');

requireContract(
  /new THREE\.WebGLRenderer\(\{[\s\S]*?alpha:\s*true/.test(sceneSource),
  'Renderer must remain alpha-enabled so photographic map backgrounds stay visible.',
);
requireContract(
  /renderer\.setClearColor\([^,]+,\s*0\s*\)/.test(sceneSource),
  'Renderer clear alpha must remain zero for photographic maps.',
);
requireContract(
  /createBackground\(stage,[\s\S]*?GAME_CONFIG\.assets\.background/.test(mainSource),
  'Main scene must wire the configured background through createBackground.',
);

requireContract(
  !/(?:\.emissive(?:Intensity)?\s*=|\.emissive\.(?:set|setHex|setRGB|setHSL)\s*\()/.test(chimpionSource),
  'Production character loading must not force global emissive/glow values.',
);
requireContract(
  !/\.metalness\s*=/.test(chimpionSource),
  'Production character authored metalness must not be globally overwritten.',
);
requireContract(
  !/\.roughness\s*=/.test(chimpionSource),
  'Production character authored roughness must not be globally overwritten.',
);

requireContract(
  GAME_CONFIG.passivePhysics.fixedHz === 120,
  'Authoritative fixed-step physics must remain 120 Hz.',
);
requireContract(
  /constructor\(profile, options = \{\}\)/.test(simulationSource)
    && /this\.profile = profile/.test(simulationSource),
  'HalfpipeSimulation must continue to consume the authoritative HalfpipeProfile.',
);
requireContract(
  !/HalfpipeVisual|ridingSurface/.test(simulationSource),
  'Gameplay physics must not derive collision authority from presentation geometry.',
);

requireContract(
  /webglcontextlost/.test(mainSource),
  'Main runtime must handle webglcontextlost.',
);
requireContract(
  /webglcontextrestored/.test(mainSource),
  'Main runtime must expose a WebGL restoration path.',
);

requireContract(
  /autoDeployTrigger:\s*checksPass/.test(renderBlueprint),
  'Production Render service must deploy only after CI checks pass.',
);
requireContract(
  /buildCommand:\s*npm ci && npm run build/.test(renderBlueprint),
  'Render production build must use a clean npm install and production build.',
);

if (violations.length) {
  console.error('Current release contract violations:');
  for (const violation of violations) console.error('- ' + violation);
  process.exitCode = 1;
} else {
  console.log('Current release contracts passed.');
}
