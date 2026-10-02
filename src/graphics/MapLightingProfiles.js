// Intensity factors compose with the player's graphics preset. Distant painted
// backgrounds remain approved artwork; these profiles light the actual 3D park.
export const MAP_LIGHTING_PROFILES = Object.freeze({
  'the-gym': Object.freeze({
    skyColor: 0xdce8f5, groundColor: 0x65616a,
    keyColor: 0xfff0dc, fillColor: 0xc3d9ef,
    keyPosition: [-8, 16, 10], fillPosition: [10, 10, -8],
    hemisphereFactor: 0.85, keyFactor: 0.85, fillFactor: 1.15,
    environmentFactor: 0.8, exposureFactor: 0.98,
    environmentRotationY: 0, fogColor: 0x202933, fogFactor: 0.18,
  }),
  japan: Object.freeze({
    skyColor: 0xe5c5b5, groundColor: 0x80716b,
    keyColor: 0xffd0a0, fillColor: 0xc4cee7,
    keyPosition: [-12, 18, 12], fillPosition: [12, 10, -8],
    hemisphereFactor: 1.05, keyFactor: 0.95, fillFactor: 1.2,
    environmentFactor: 1, environmentIntensity: 1.0, exposureFactor: 1,
    environmentRotationY: 0.5, fogColor: 0xb9d6e9, fogFactor: 0.12,
  }),
  'canyon-session': Object.freeze({
    skyColor: 0xd9edff, groundColor: 0x987052,
    keyColor: 0xffdfb4, fillColor: 0xbfd8f0,
    keyPosition: [12, 18, 14], fillPosition: [-12, 9, 8],
    hemisphereFactor: 1, keyFactor: 0.92, fillFactor: 1.05,
    environmentFactor: 1, exposureFactor: 1,
    environmentRotationY: 0.35, fogColor: 0xd3c2a8, fogFactor: 0.6,
  }),
  city: Object.freeze({
    skyColor: 0xdaf0ff, groundColor: 0x6b5140,
    keyColor: 0xffe5bd, fillColor: 0xb7d3e0,
    keyPosition: [-10, 20, 14], fillPosition: [12, 8, -12],
    hemisphereFactor: 1, keyFactor: 1, fillFactor: 1,
    environmentFactor: 1, exposureFactor: 1,
    environmentRotationY: 0, fogColor: 0xc4d7d4, fogFactor: 1,
  }),
  'tree-house': Object.freeze({
    skyColor: 0xd8ebdf, groundColor: 0x66503a,
    keyColor: 0xffddb0, fillColor: 0xb0cddd,
    keyPosition: [12, 16, 10], fillPosition: [-12, 8, -10],
    hemisphereFactor: 0.84, keyFactor: 1.05, fillFactor: 0.88,
    environmentFactor: 0.92, exposureFactor: 0.99,
    environmentRotationY: -0.7, fogColor: 0xbbcbb8, fogFactor: 1.05,
  }),
  'cyber-night': Object.freeze({
    skyColor: 0x899bc8, groundColor: 0x34273b,
    keyColor: 0xffd9bd, fillColor: 0x92bce9,
    keyPosition: [-12, 13, 14], fillPosition: [14, 10, 6],
    hemisphereFactor: 0.42, keyFactor: 0.52, fillFactor: 1.12,
    environmentFactor: 0.72, exposureFactor: 0.97,
    environmentRotationY: 0.5, fogColor: 0x414760, fogFactor: 0.68,
  }),
});

export function getMapLightingProfile(mapId = 'city') {
  return MAP_LIGHTING_PROFILES[mapId] || MAP_LIGHTING_PROFILES.city;
}
