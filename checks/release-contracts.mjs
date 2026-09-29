import fs from 'node:fs';
import path from 'node:path';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const violations = [];
const requireContract = (condition, message) => {
  if (!condition) violations.push(message);
};

const mainSource = read('src/main.js');
const sceneSource = read('src/scene/createScene.js');
const styleSource = read('src/style.css');
const chimpionSource = read('src/character/ChimpionLoader.js');
const halfpipeSource = read('src/halfpipe/HalfpipeVisual.js');
const simulationSource = read('src/halfpipe/HalfpipeSimulation.js');

const approvedBackground = '/images/backgrounds/halfpipe-chimpions-merch.jpg';
const backgroundPath = path.join(
  root,
  'public',
  approvedBackground.replace(/^\//, ''),
);

requireContract(
  GAME_CONFIG.assets.background === approvedBackground,
  'Approved production background changed. Update the release contract only after explicit art approval.',
);
requireContract(
  fs.existsSync(backgroundPath) && fs.statSync(backgroundPath).size > 1024,
  'Approved background asset is missing or empty.',
);

const stageRule = styleSource.match(/#game-stage\s*\{([\s\S]*?)\}/)?.[1] || '';
requireContract(/width:\s*100vw\s*;/.test(stageRule), 'Game stage must fill viewport width.');
requireContract(/height:\s*100vh\s*;/.test(stageRule), 'Game stage must fill viewport height.');
requireContract(/max-width:\s*none\s*;/.test(stageRule), 'Game stage must not restore a fixed-width pillarbox.');
requireContract(/max-height:\s*none\s*;/.test(stageRule), 'Game stage must not restore a fixed-height letterbox.');
requireContract(!/aspect-ratio\s*:/.test(stageRule), 'Game stage must not enforce a fixed 16:9 aspect ratio.');

requireContract(
  /new THREE\.WebGLRenderer\(\{[\s\S]*?alpha:\s*true/.test(sceneSource),
  'Renderer must remain alpha-enabled so the DOM background stays visible.',
);
requireContract(
  /renderer\.setClearColor\([^,]+,\s*0\s*\)/.test(sceneSource),
  'Renderer clear alpha must remain zero.',
);
requireContract(
  /createBackground\(stage,[\s\S]*?GAME_CONFIG\.assets\.background/.test(mainSource),
  'Main scene must wire the configured approved background through createBackground.',
);

requireContract(
  !/\.emissive(?:Intensity)?\s*=/.test(chimpionSource),
  'Production character must not receive forced emissive/glow in ChimpionLoader.',
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
  /const COPING_MATERIAL_NAME\s*=\s*'Rail_Metal'/.test(halfpipeSource),
  'Coping glow must remain anchored to the approved Rail_Metal material.',
);
requireContract(
  /material\?\.name !== COPING_MATERIAL_NAME\) return material/.test(halfpipeSource),
  'Coping emissive must remain selective instead of affecting unrelated halfpipe materials.',
);
requireContract(
  /visualGlowOnly/.test(halfpipeSource),
  'Selective coping glow shells must remain explicitly marked visual-only.',
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
  'Gameplay physics must not derive collision/profile authority from presentation geometry.',
);

requireContract(
  /webglcontextlost/.test(mainSource),
  'Integration requirement: main runtime must handle webglcontextlost and prevent destructive default behavior.',
);
requireContract(
  /webglcontextrestored/.test(mainSource),
  'Integration requirement: main runtime must expose a webglcontextrestored recovery or reload path.',
);

if (violations.length) {
  console.error('Release contract violations:');
  for (const violation of violations) console.error('- ' + violation);
  process.exitCode = 1;
} else {
  console.log('Release contracts passed.');
}
