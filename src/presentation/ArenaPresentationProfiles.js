const profile = (id, audioEnvironment, crowdScale, accent, atmosphere) => Object.freeze({
  id,
  audioEnvironment,
  crowdScale,
  accent,
  atmosphere,
});

export const ARENA_PRESENTATION_PROFILES = Object.freeze({
  'the-gym': profile('the-gym', 'gym', 0.95, 0xffd166, 'indoor-arena'),
  japan: profile('japan', 'japan', 0.72, 0xff8fa3, 'sunset-urban'),
  'canyon-session': profile('canyon-session', 'canyon', 0.38, 0xffb05c, 'open-canyon'),
  'skate-park': profile('skate-park', 'park', 0.78, 0x69d2ff, 'outdoor-park'),
  space: profile('space', 'space', 0.18, 0x9a8cff, 'low-air-space'),
  city: profile('city', 'city', 0.82, 0x57d7ff, 'street-city'),
  'tree-house': profile('tree-house', 'forest', 0.42, 0x8be28b, 'forest-canopy'),
  'cyber-night': profile('cyber-night', 'cyber', 0.88, 0xff4fd8, 'neon-night'),
});

export const DEFAULT_ARENA_PRESENTATION_PROFILE = ARENA_PRESENTATION_PROFILES.city;

export function resolveArenaPresentationProfile(mapId = 'city') {
  const id = String(mapId || 'city').trim().toLowerCase();
  return ARENA_PRESENTATION_PROFILES[id] || DEFAULT_ARENA_PRESENTATION_PROFILE;
}
