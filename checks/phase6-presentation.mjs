import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARENA_PRESENTATION_PROFILES,
  resolveArenaPresentationProfile,
} from '../src/presentation/ArenaPresentationProfiles.js';
import { AUDIO_MANIFEST } from '../src/audio/AudioManifest.js';

const expectedMaps = [
  'the-gym', 'japan', 'canyon-session', 'skate-park',
  'space', 'city', 'tree-house', 'cyber-night',
];

assert.deepEqual(Object.keys(ARENA_PRESENTATION_PROFILES).sort(), [...expectedMaps].sort());
assert.equal(new Set(expectedMaps.map(id => resolveArenaPresentationProfile(id).audioEnvironment)).size, 8,
  'every production arena must resolve to its own atmosphere route');

for (const id of expectedMaps) {
  const profile = resolveArenaPresentationProfile(id);
  assert.equal(profile.id, id);
  assert.ok(profile.audioEnvironment, `${id} needs an audio environment`);
  assert.ok(profile.crowdScale >= 0 && profile.crowdScale <= 1, `${id} crowdScale out of range`);
  assert.ok(Number.isInteger(profile.accent) && profile.accent >= 0, `${id} needs a valid accent`);
  assert.ok(AUDIO_MANIFEST.ambience[profile.audioEnvironment], `${id} ambience is missing from manifest`);
}

for (const key of [
  'landingPerfect', 'landingClean', 'landingSketchy', 'landingHeavy',
  'scoreConfirm', 'comboTick', 'countdown', 'countdownGo', 'timerWarning', 'sessionEnd',
]) {
  assert.match(AUDIO_MANIFEST.sfx[key]?.url || '', /^\/audio\/skate\//,
    `${key} must use the coherent recorded skate palette`);
}

const audioSource = fs.readFileSync('src/audio/HalfpipeAudio.js', 'utf8');
const vfxSource = fs.readFileSync('src/vfx/HalfpipeVFX.js', 'utf8');
const impactSource = fs.readFileSync('src/vfx/ImpactVFX.js', 'utf8');
const soundSource = fs.readFileSync('src/audio/SkateSoundDesign.js', 'utf8');
const combined = [audioSource, vfxSource, impactSource, soundSource].join('\n');

assert.doesNotMatch(combined, /HalfpipeSimulation|HalfpipeMotionSolver|LandingResolver|ComboSystem/,
  'Phase 6 presentation code must not depend on authoritative simulation systems');
assert.match(audioSource, /resolveArenaPresentationProfile/);
assert.match(audioSource, /_arenaReaction\(/);
assert.match(vfxSource, /TRICK_COMPLETED/);
assert.match(impactSource, /halfpipe-vfx-trick-accent/);
assert.match(soundSource, /ENVIRONMENT_SHAPES/);
assert.doesNotMatch(impactSource, /this\.sparks\.emit[\s\S]*celebration/,
  'celebration accents must stay separate from physical metal sparks');

console.log('Phase 6 presentation contracts passed: eight atmospheres, recorded cue palette, crowd reactions and separate trick accents.');
