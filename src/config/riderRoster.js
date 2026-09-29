export const RIDER_ROSTER = Object.freeze([
  Object.freeze({
    id: 'archon',
    name: 'The Archon',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Archon.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/5jsHyN5yHpmkT-usm3w--BwC9fZKqFeZ2QGY9Nj4xrE',
  }),
  Object.freeze({
    id: 'heretic',
    name: 'The Heretic',
    tribe: 'Planeswalkers',
    modelUrl: '/models/characters/The%20Heretic.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/-o3xO43MWMUll7FBIrJ2j6rK8Nq4K4YPENdzecPOCdE',
  }),
  Object.freeze({
    id: 'commodore',
    name: 'The Commodore',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Commodore.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/Lbpd42IUkDzfy2uarQjP2JDeAn4qzpFfO6GUfAeW2bc',
  }),
  Object.freeze({
    id: 'pioneer',
    name: 'The Pioneer',
    tribe: 'Future War Pack',
    modelUrl: '/models/characters/The%20Pioneer.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/VA0_0h2MzW6ilZsE_iAW0Ppk70fm0k_PN205MF3vD6s',
  }),
  Object.freeze({
    id: 'punk',
    name: 'The Punk',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Punk.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/Of2DMtt0q9hpAyXVzK-M24rvi_CymCcFi2RLrVnu-sc',
  }),
  Object.freeze({
    id: 'street-fighter',
    name: 'The Street Fighter',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Street%20Fighter.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/yRhvGxxkyDkwQwQmxnORL3vacyGI3ERvMugkLkDvjK8',
  }),
  Object.freeze({
    id: 'bosun',
    name: 'The Bosun',
    tribe: 'Old World Cult',
    modelUrl: '/models/characters/The%20Bosun.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/Xct_-Q1nQaFfhHKQfUhyMr2c1KcoCaCTJQpcr9mqdbs',
  }),
  Object.freeze({
    id: 'adolescent',
    name: 'The Adolescent',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Adolescent.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/HGBlJxXb_X0yTwtHQyKPKPvFbJh9r3Ch4-XbZyNoLaI',
  }),
  Object.freeze({
    id: 'angsty',
    name: 'The Angsty',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Angsty.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/tInLoI8PpzOmaE6Ju9H1pWaVCUNpFkYk1pXc8Ha8ASM',
  }),
  Object.freeze({
    id: 'apologetic',
    name: 'The Apologetic',
    tribe: 'Proletariat',
    modelUrl: '/models/characters/The%20Apologetic.glb',
    portraitUrl: 'https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/GKX1TmFqdV9USvPPP96ugeP7LDajDsg3Fc_LWwahXDs',
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
