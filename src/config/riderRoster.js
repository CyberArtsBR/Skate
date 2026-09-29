export const RIDER_ROSTER = Object.freeze([
  Object.freeze({
    id: 'archon',
    name: 'The Archon',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Archon.glb',
    portraitUrl: '/images/characters/archon.gif',
  }),
  Object.freeze({
    id: 'heretic',
    name: 'The Heretic',
    tribe: 'Planeswalkers',
    modelUrl: '/models/characters/The%20Heretic.glb',
    portraitUrl: '/images/characters/heretic.gif',
  }),
  Object.freeze({
    id: 'commodore',
    name: 'The Commodore',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Commodore.glb',
    portraitUrl: '/images/characters/commodore.gif',
  }),
  Object.freeze({
    id: 'pioneer',
    name: 'The Pioneer',
    tribe: 'Future War Pack',
    modelUrl: '/models/characters/The%20Pioneer.glb',
    portraitUrl: '/images/characters/pioneer.gif',
  }),
  Object.freeze({
    id: 'punk',
    name: 'The Punk',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Punk.glb',
    portraitUrl: '/images/characters/punk.gif',
  }),
  Object.freeze({
    id: 'street-fighter',
    name: 'The Street Fighter',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Street%20Fighter.glb',
    portraitUrl: '/images/characters/street-fighter.gif',
  }),
  Object.freeze({
    id: 'bosun',
    name: 'The Bosun',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Bosun.glb',
    portraitUrl: '/images/characters/bosun.gif',
  }),
  Object.freeze({
    id: 'adolescent',
    name: 'The Adolescent',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Adolescent.glb',
    portraitUrl: '/images/characters/adolescent.gif',
  }),
  Object.freeze({
    id: 'angsty',
    name: 'The Angsty',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Angsty.glb',
    portraitUrl: '/images/characters/angsty.gif',
  }),
  Object.freeze({
    id: 'apologetic',
    name: 'The Apologetic',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Apologetic.glb',
    portraitUrl: '/images/characters/apologetic.gif',
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
