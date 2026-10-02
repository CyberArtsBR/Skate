// Every park uses The Gym's approved lighting, including reflection orientation
// and exposure. Intensity factors still compose with the player's quality preset.
// Painted backgrounds and map-specific fog remain atmosphere, not light sources.
const GYM_LIGHTING = Object.freeze({
  skyColor: 0xdce8f5, groundColor: 0x65616a,
  keyColor: 0xfff0dc, fillColor: 0xc3d9ef,
  // A centered noon key preserves symmetric left/right ramp shadows.
  keyPosition: Object.freeze([0, 20, 0]),
  fillPosition: Object.freeze([10, 10, -8]),
  hemisphereFactor: 0.85, keyFactor: 0.85, fillFactor: 1.15,
  environmentFactor: 0.8, exposureFactor: 0.98,
  environmentRotationY: 0,
});

function gymLightingWithAtmosphere(fogColor, fogFactor) {
  return Object.freeze({ ...GYM_LIGHTING, fogColor, fogFactor });
}

export const MAP_LIGHTING_PROFILES = Object.freeze({
  'the-gym': gymLightingWithAtmosphere(0x202933, 0.18),
  japan: gymLightingWithAtmosphere(0xb9d6e9, 0.12),
  'canyon-session': gymLightingWithAtmosphere(0xd3c2a8, 0.6),
  'skate-park': gymLightingWithAtmosphere(0xc7dce8, 0.7),
  space: gymLightingWithAtmosphere(0x343e60, 0.2),
  city: gymLightingWithAtmosphere(0xc4d7d4, 1),
  'tree-house': gymLightingWithAtmosphere(0xbbcbb8, 1.05),
  'cyber-night': gymLightingWithAtmosphere(0x414760, 0.68),
});

export function getMapLightingProfile(mapId = 'city') {
  return MAP_LIGHTING_PROFILES[mapId] || MAP_LIGHTING_PROFILES.city;
}
