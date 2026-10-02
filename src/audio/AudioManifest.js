const generatedBed = (kind, options = {}) => Object.freeze({
  url: null,
  optional: true,
  placeholder: kind,
  generated: true,
  ...options,
});

const PIXEL_RAMPAGE = '/audio/music/Pixel%20Rampage.mp3';
const SKATE_ROLL = '/audio/skate/raw-street-roll.wav';
const SKATE_IMPACT = '/audio/skate/raw-street-impact.wav';
const SKATE_TAKEOFF = '/audio/skate/raw-street-takeoff.wav';
const recorded = (url, options = {}) => Object.freeze({ url, ...options });

export const AUDIO_MANIFEST = Object.freeze({
  version: 7,
  music: Object.freeze({
    menu: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.48 }),
    gameplay: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.72 }),
    results: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.50 }),
  }),
  continuous: Object.freeze({
    wheelRoll: recorded(SKATE_ROLL, { loop: true, gain: 1 }),
    rampTexture: generatedBed('procedural-dry-trucks', { loop: true, gain: 1 }),
    wind: generatedBed('procedural-wind', { loop: true, gain: 1 }),
  }),
  ambience: Object.freeze({
    gym: generatedBed('gym', { loop: true, gain: 0.034 }),
    japan: generatedBed('japan', { loop: true, gain: 0.042 }),
    canyon: generatedBed('canyon', { loop: true, gain: 0.050 }),
    park: generatedBed('park', { loop: true, gain: 0.046 }),
    space: generatedBed('space', { loop: true, gain: 0.024 }),
    city: generatedBed('city', { loop: true, gain: 0.035 }),
    forest: generatedBed('forest', { loop: true, gain: 0.050 }),
    cyber: generatedBed('cyber', { loop: true, gain: 0.030 }),
    outdoor: generatedBed('park', { loop: true, gain: 0.046 }),
    california: generatedBed('park', { loop: true, gain: 0.046 }),
    'tree-house': generatedBed('forest', { loop: true, gain: 0.050 }),
    'cyber-night': generatedBed('cyber', { loop: true, gain: 0.030 }),
  }),
  sfx: Object.freeze({
    // Reuse the dry recorded skate sources as a coherent physical palette.
    // Pitch/gain variation is applied by HalfpipeAudio so repeated cues do not
    // sound like identical sample retriggers.
    pumpPerfect: recorded(SKATE_TAKEOFF, { gain: 0.20, rate: 1.30 }),
    pumpGood: recorded(SKATE_TAKEOFF, { gain: 0.14, rate: 1.12 }),
    pumpWeak: recorded(SKATE_TAKEOFF, { gain: 0.08, rate: 0.94 }),
    copingHit: recorded(SKATE_IMPACT, { gain: 0.46, rate: 1.20 }),
    kickTurn: recorded(SKATE_IMPACT, { gain: 0.40, rate: 1.08 }),
    handPlant: recorded(SKATE_IMPACT, { gain: 0.32, rate: 0.92 }),
    takeoff: recorded(SKATE_TAKEOFF, { gain: 0.70 }),
    deckImpact: recorded(SKATE_IMPACT, { gain: 1 }),
    landingPerfect: recorded(SKATE_IMPACT, { gain: 0.38, rate: 1.16 }),
    landingClean: recorded(SKATE_IMPACT, { gain: 0.52, rate: 1.04 }),
    landingSketchy: recorded(SKATE_IMPACT, { gain: 0.68, rate: 0.94 }),
    landingHeavy: recorded(SKATE_IMPACT, { gain: 0.84, rate: 0.84 }),
    bailBoard: recorded(SKATE_IMPACT, { gain: 0.68, rate: 0.82 }),
    bailBody: recorded(SKATE_IMPACT, { gain: 0.46, rate: 0.72 }),
    bailRecovery: recorded(SKATE_ROLL, { gain: 0.20, rate: 0.82 }),
    scoreConfirm: recorded(SKATE_TAKEOFF, { gain: 0.17, rate: 1.42 }),
    comboTick: recorded(SKATE_TAKEOFF, { gain: 0.12, rate: 1.58 }),
    countdown: recorded(SKATE_TAKEOFF, { gain: 0.13, rate: 0.78 }),
    countdownGo: recorded(SKATE_TAKEOFF, { gain: 0.24, rate: 1.16 }),
    timerWarning: recorded(SKATE_TAKEOFF, { gain: 0.11, rate: 1.48 }),
    sessionEnd: recorded(SKATE_IMPACT, { gain: 0.28, rate: 0.76 }),
    // Crowd is intentionally synthesized as a restrained arena bed until a
    // dedicated licensed crowd recording is supplied; it is never used as a
    // body-impact or fail alarm.
    crowdCheer: generatedBed('crowd-cheer', { gain: 0.22 }),
    crowdOh: generatedBed('crowd-oh', { gain: 0.14 }),
  }),
});

export const AUDIO_ASSET_REQUIREMENTS = Object.freeze([
  'Primary menu/gameplay/results theme: public/audio/music/Pixel Rampage.mp3',
  'Recorded physical palette: raw-street-roll.wav, raw-street-impact.wav, raw-street-takeoff.wav',
  'Optional future dedicated crowd cheer/arena walla recordings may replace the generated crowd layer',
  'Optional future map-specific field ambience recordings may replace generated environment beds without changing runtime routing',
  'Bails remain board/wheel stumble only; no body slam or emergency cue',
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
