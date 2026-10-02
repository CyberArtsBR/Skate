import { publicAssetUrl } from '../config/publicAssetUrl.js';

const placeholder = (kind, options = {}) => Object.freeze({
  url: null,
  optional: true,
  placeholder: kind,
  ...options,
});

const PIXEL_RAMPAGE = publicAssetUrl('audio/music/Pixel_Rampage.mp3');

export const AUDIO_MANIFEST = Object.freeze({
  version: 6,
  music: Object.freeze({
    // User-supplied Halfpipe theme. Browsers may require the first user gesture
    // before audible playback; once audio is unlocked this is the menu/theme
    // track and gameplay restarts it from the beginning for each new run.
    menu: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.48 }),
    gameplay: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.72 }),
    results: Object.freeze({ url: PIXEL_RAMPAGE, loop: true, gain: 0.50 }),
  }),
  continuous: Object.freeze({
    wheelRoll: Object.freeze({ url: publicAssetUrl('audio/skate/raw-street-roll.wav'), loop: true, gain: 1 }),
    rampTexture: placeholder('procedural-dry-trucks', { loop: true, gain: 1 }),
    wind: placeholder('procedural-wind', { loop: true, gain: 1 }),
  }),
  ambience: Object.freeze({
    outdoor: placeholder('outdoor', { loop: true, gain: 0.055 }),
    california: placeholder('outdoor', { loop: true, gain: 0.055 }),
    city: placeholder('city', { loop: true, gain: 0.035 }),
    'tree-house': placeholder('outdoor', { loop: true, gain: 0.055 }),
    'cyber-night': placeholder('night', { loop: true, gain: 0.035 }),
  }),
  sfx: Object.freeze({
    pumpPerfect: placeholder('pump-perfect', { gain: 0.72 }),
    pumpGood: placeholder('pump-good', { gain: 0.58 }),
    pumpWeak: placeholder('pump-weak', { gain: 0.34 }),
    copingHit: placeholder('metal-hit', { gain: 0.64 }),
    kickTurn: placeholder('metal-scrape', { gain: 0.76 }),
    handPlant: placeholder('handplant-accent', { gain: 0.82 }),
    takeoff: Object.freeze({ url: publicAssetUrl('audio/skate/raw-street-takeoff.wav'), gain: 0.7 }),
    deckImpact: Object.freeze({ url: publicAssetUrl('audio/skate/raw-street-impact.wav'), gain: 1 }),
    landingPerfect: placeholder('landing-perfect', { gain: 0.72 }),
    landingClean: placeholder('landing-clean', { gain: 0.66 }),
    landingSketchy: placeholder('landing-sketchy', { gain: 0.74 }),
    landingHeavy: placeholder('landing-heavy', { gain: 0.86 }),
    bailBoard: placeholder('crash-board', { gain: 0.9 }),
    bailBody: placeholder('crash-body', { gain: 0.84 }),
    crowdOh: placeholder('crowd-oooh', { gain: 0.86 }),
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
  'Primary menu/gameplay/results theme: public/audio/music/Pixel_Rampage.mp3',
  'Optional California outdoor ambience loop',
  'Optional distant-city ambience loop',
  'Optional restrained crowd ambience loop',
  'Preferred wheel-roll loop: 6-10 seconds, dry, seamless, no hard attack or baked fade, clean board-on-wood/concrete texture',
  'Optional coping metal hit/scrape one-shots',
  'Optional landing impact family: perfect, clean, sketchy, heavy',
  'Bails use board/wheel stumble only; no body slam or emergency cue',
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
