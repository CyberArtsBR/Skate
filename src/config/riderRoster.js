import { publicAssetUrl } from './publicAssetUrl.js';

export const RIDER_ROSTER = Object.freeze([
  Object.freeze({
    id: 'archon',
    name: 'The Archon',
    tribe: 'Old World Cult',
    modelUrl: publicAssetUrl('models/characters/The_Archon.glb'),
    portraitUrl: publicAssetUrl('images/characters/archon.gif'),
  }),
  Object.freeze({
    id: 'heretic',
    name: 'The Heretic',
    tribe: 'Planeswalkers',
    modelUrl: publicAssetUrl('models/characters/The_Heretic.glb'),
    portraitUrl: publicAssetUrl('images/characters/heretic.gif'),
  }),
  Object.freeze({
    id: 'commodore',
    name: 'The Commodore',
    tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/The_Commodore.glb'),
    portraitUrl: publicAssetUrl('images/characters/commodore.gif'),
  }),
  Object.freeze({
    id: 'pioneer',
    name: 'The Pioneer',
    tribe: 'Future War Pack',
    modelUrl: publicAssetUrl('models/characters/The_Pioneer.glb'),
    portraitUrl: publicAssetUrl('images/characters/pioneer.gif'),
  }),
  Object.freeze({
    id: 'punk',
    name: 'The Punk',
    tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/The_Punk.glb'),
    portraitUrl: publicAssetUrl('images/characters/punk.gif'),
  }),
  Object.freeze({
    id: 'street-fighter',
    name: 'The Street Fighter',
    tribe: 'Old World Cult',
    modelUrl: publicAssetUrl('models/characters/The_Street_Fighter.glb'),
    portraitUrl: publicAssetUrl('images/characters/street-fighter.gif'),
  }),
  Object.freeze({
    id: 'bosun',
    name: 'The Bosun',
    tribe: 'Old World Cult',
    modelUrl: publicAssetUrl('models/characters/The_Bosun.glb'),
    portraitUrl: publicAssetUrl('images/characters/bosun.gif'),
  }),
  Object.freeze({
    id: 'adolescent',
    name: 'The Adolescent',
    tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/The_Adolescent.glb'),
    portraitUrl: publicAssetUrl('images/characters/adolescent.gif'),
  }),
  Object.freeze({
    id: 'angsty',
    name: 'The Angsty',
    tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/The_Angsty.glb'),
    portraitUrl: publicAssetUrl('images/characters/angsty.gif'),
  }),
  Object.freeze({
    id: 'apologetic',
    name: 'The Apologetic',
    tribe: 'Proletariat',
    modelUrl: publicAssetUrl('models/characters/The_Apologetic.glb'),
    portraitUrl: publicAssetUrl('images/characters/apologetic.gif'),
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
  return RIDER_ROSTER.find((entry) => entry.id === id) || RIDER_ROSTER[1];
}

export function skateboardColorById(id) {
  return SKATEBOARD_COLORS.find((entry) => entry.id === id) || SKATEBOARD_COLORS[0];
}