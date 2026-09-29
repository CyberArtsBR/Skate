const placeholder = (kind, options = {}) => Object.freeze({
  url: null,
  optional: true,
  placeholder: kind,
  ...options,
});

export const AUDIO_MANIFEST = Object.freeze({
  version: 1,
  music: Object.freeze({
    gameplay: placeholder('music-hook', { loop: true, gain: 0.72 }),
    results: placeholder('music-hook', { loop: true, gain: 0.66 }),
  }),
  continuous: Object.freeze({
    wheelRoll: placeholder('procedural-wheel-roll', { loop: true, gain: 1 }),
    rampTexture: placeholder('procedural-ramp-texture', { loop: true, gain: 1 }),
    wind: placeholder('procedural-wind', { loop: true, gain: 1 }),
  }),
  ambience: Object.freeze({
    california: placeholder('filtered-noise', { loop: true, gain: 0.18 }),
    city: placeholder('filtered-noise', { loop: true, gain: 0.08 }),
    crowd: placeholder('filtered-noise', { loop: true, gain: 0.06 }),
  }),
  sfx: Object.freeze({
    pumpPerfect: placeholder('pump-perfect', { gain: 0.72 }),
    pumpGood: placeholder('pump-good', { gain: 0.58 }),
    pumpWeak: placeholder('pump-weak', { gain: 0.34 }),
    copingHit: placeholder('metal-hit', { gain: 0.64 }),
    kickTurn: placeholder('metal-scrape', { gain: 0.76 }),
    handPlant: placeholder('handplant-accent', { gain: 0.82 }),
    takeoff: placeholder('takeoff-pop', { gain: 0.62 }),
    landingPerfect: placeholder('landing-perfect', { gain: 0.72 }),
    landingClean: placeholder('landing-clean', { gain: 0.66 }),
    landingSketchy: placeholder('landing-sketchy', { gain: 0.74 }),
    landingHeavy: placeholder('landing-heavy', { gain: 0.86 }),
    bailBoard: placeholder('crash-board', { gain: 0.9 }),
    bailBody: placeholder('crash-body', { gain: 0.84 }),
    bailRecovery: placeholder('recovery-accent', { gain: 0.4 }),
    scoreConfirm: placeholder('score-confirm', { gain: 0.42 }),
    comboTick: placeholder('combo-tick', { gain: 0.34 }),
    countdown: placeholder('countdown', { gain: 0.5 }),
    countdownGo: placeholder('countdown-go', { gain: 0.72 }),
    timerWarning: placeholder('timer-warning', { gain: 0.42 }),
    sessionEnd: placeholder('session-end', { gain: 0.66 }),
  }),
});

export const AUDIO_ASSET_REQUIREMENTS = Object.freeze([
  'Optional music/gameplay loop (licensed/original, seamless)',
  'Optional results music loop or sting (licensed/original)',
  'Optional California outdoor ambience loop',
  'Optional distant-city ambience loop',
  'Optional restrained crowd ambience loop',
  'Optional board/ramp wheel rolling texture loop',
  'Optional coping metal hit/scrape one-shots',
  'Optional landing impact family: perfect, clean, sketchy, heavy',
  'Optional bail layers: board, body/dust, recovery accent',
]);

export function createAudioManifest(overrides = {}) {
  return {
    ...AUDIO_MANIFEST,
    ...overrides,
    music: { ...AUDIO_MANIFEST.music, ...(overrides.music || {}) },
    ambience: { ...AUDIO_MANIFEST.ambience, ...(overrides.ambience || {}) },
    continuous: { ...AUDIO_MANIFEST.continuous, ...(overrides.continuous || {}) },
    sfx: { ...AUDIO_MANIFEST.sfx, ...(overrides.sfx || {}) },
  };
}
