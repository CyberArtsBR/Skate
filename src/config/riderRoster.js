import { publicAssetUrl } from './publicAssetUrl.js';

export const RIDER_ROSTER = Object.freeze([
  Object.freeze({
    id: 'heretic', name: 'The Heretic', tribe: 'Planeswalkers',
    modelUrl: publicAssetUrl('models/characters/heretic_new.glb'),
    portraitUrl: publicAssetUrl('images/characters/heretic.gif'),
  }),
  Object.freeze({
    id: 'adolescent', name: 'The Adolescent', tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/adolescent_new.glb'),
    portraitUrl: publicAssetUrl('images/characters/adolescent.gif'),
  }),
  Object.freeze({
    id: 'archon', name: 'The Archon', tribe: 'Old World Cult',
    modelUrl: publicAssetUrl('models/characters/anchor_new.glb'),
    portraitUrl: publicAssetUrl('images/characters/archon.gif'),
  }),
  Object.freeze({
    id: 'tuxr', name: 'Tuxr', tribe: 'Chimpions',
    modelUrl: publicAssetUrl('models/characters/tuxr_new.glb'),
    portraitUrl: null,
  }),
]);

export const SKATEBOARD_COLORS = Object.freeze([
  Object.freeze({ id: 'original', name: 'Original', color: null }),
  Object.freeze({ id: 'red', name: 'Crimson', color: 0xc91f37 }),
  Object.freeze({ id: 'blue', name: 'Electric Blue', color: 0x1d6cff }),
  Object.freeze({ id: 'cyan', name: 'Cyan', color: 0x16d9e8 }),
  Object.freeze({ id: 'green', name: 'Lime', color: 0x64d93a }),
  Object.freeze({ id: 'yellow', name: 'Gold', color: 0xf3c744 }),
  Object.freeze({ id: 'purple', name: 'Purple', color: 0x8c4dff }),
  Object.freeze({ id: 'black', name: 'Black', color: 0x151515 }),
  Object.freeze({ id: 'white', name: 'White', color: 0xf4f4f0 }),
]);

export function riderById(id) {
  return RIDER_ROSTER.find((entry) => entry.id === id) || RIDER_ROSTER[0];
}

export function skateboardColorById(id) {
  return SKATEBOARD_COLORS.find((entry) => entry.id === id) || SKATEBOARD_COLORS[0];
}
