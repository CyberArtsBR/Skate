import { HalfpipeAudio as HalfpipeAudioCore } from './HalfpipeAudioCore.js';
import { resolveArenaPresentationProfile } from '../presentation/ArenaPresentationProfiles.js';

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function valueFrom(event, ...keys) {
  for (const key of keys) {
    if (event?.[key] !== undefined) return event[key];
    if (event?.data?.[key] !== undefined) return event.data[key];
    if (event?.detail?.[key] !== undefined) return event.detail[key];
  }
  return undefined;
}

function label(value) {
  return String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

/**
 * Phase 6 presentation layer.
 *
 * The proven audio core remains intact in HalfpipeAudioCore. This subclass only
 * adds presentation policy: per-map ambience selection, manifest-authored sample
 * rates and restrained arena reaction beds. It never reads or mutates gameplay
 * simulation state.
 */
export class HalfpipeAudio extends HalfpipeAudioCore {
  constructor(options = {}) {
    super(options);
    this.arenaProfile = resolveArenaPresentationProfile('city');
  }

  _assetOr(key, fallback, options = {}) {
    const descriptor = key.split('.').reduce(
      (value, part) => value?.[part],
      this.manifest,
    );

    const voice = this._playBuffer(key, options.busName || 'SFX', {
      gain: (descriptor?.gain ?? 1) * (options.gain ?? 1),
      rate: options.rate ?? descriptor?.rate ?? 1,
      loop: Boolean(options.loop ?? descriptor?.loop),
      delay: options.delay ?? 0,
    });

    return voice || fallback?.() || null;
  }

  async setEnvironment(mapId = 'city') {
    const profile = resolveArenaPresentationProfile(mapId);
    const name = profile.audioEnvironment;
    this.arenaProfile = profile;

    if (name !== this.environment) {
      this.environment = name;
      this.environmentGeneration += 1;
      for (const active of this.ambienceVoices.keys()) {
        this.stopAmbience(active, { fadeSeconds: 0.65 });
      }
    }

    return this.playAmbience(name);
  }

  _arenaReaction(kind = 'cheer', intensity = 0.5) {
    if (!this.isReady) return false;
    const crowdScale = clamp01(this.arenaProfile?.crowdScale ?? 0.5);
    const strength = clamp01(intensity) * crowdScale;
    if (strength < 0.08 || !this._allowed('arena-reaction', 0.42)) return false;

    // Restrained, filtered walla rather than a cartoon vocal sample. This keeps
    // crowd response contextual and avoids turning a missed trick into a fail alarm.
    const surprised = kind === 'oh';
    this._noiseBurst({
      duration: 0.16 + strength * 0.22,
      gain: (surprised ? 0.018 : 0.014) + strength * 0.035,
      frequency: surprised ? 520 : 760,
      type: 'bandpass',
      q: surprised ? 0.55 : 0.42,
      busName: 'AMBIENCE',
    });
    this._noiseBurst({
      duration: 0.12 + strength * 0.18,
      gain: 0.008 + strength * 0.018,
      frequency: surprised ? 980 : 1320,
      type: 'bandpass',
      q: 0.35,
      delay: 0.025,
      busName: 'AMBIENCE',
    });
    return true;
  }

  _pumpCue(event) {
    if (!this._allowed('pump', 0.085)) return;
    const rating = label(valueFrom(event, 'rating', 'qualityLabel', 'grade'));
    if (!['PERFECT', 'GOOD', 'WEAK'].includes(rating)) return;

    const key = rating === 'PERFECT'
      ? 'sfx.pumpPerfect'
      : rating === 'GOOD' ? 'sfx.pumpGood' : 'sfx.pumpWeak';
    this._assetOr(key, null, { gain: rating === 'PERFECT' ? 0.48 : rating === 'GOOD' ? 0.38 : 0.25 });
    this._haptic({
      weakMagnitude: rating === 'PERFECT' ? 0.22 : rating === 'GOOD' ? 0.14 : 0.08,
      strongMagnitude: rating === 'PERFECT' ? 0.06 : 0.03,
      durationMs: 35,
      reason: 'pump-contact',
    });
  }

  _landingCue(event) {
    const rating = label(valueFrom(event, 'rating', 'quality', 'grade')) || 'CLEAN';
    super._landingCue(event);
    if (rating === 'PERFECT') this._arenaReaction('cheer', 0.42);
  }

  _scoreCue(event) {
    super._scoreCue(event);
    const points = Math.max(0, Number(valueFrom(event, 'points', 'scoreDelta', 'value')) || 0);
    if (points >= 700) this._arenaReaction('cheer', 0.45 + clamp01(points / 2400) * 0.4);
  }

  _comboCue(event) {
    const before = this.lastComboMultiplier;
    const multiplier = Math.max(1, Number(valueFrom(event, 'multiplier', 'combo', 'value')) || 1);
    super._comboCue(event);
    if (multiplier > before && multiplier >= 3) {
      this._arenaReaction('cheer', 0.30 + clamp01((multiplier - 2) / 5) * 0.45);
    }
  }

  _bailCue(event, options = {}) {
    super._bailCue(event, options);
    // The rider does not physically fall in this game. Keep the miss readable
    // without adding a body-slam sound; a tiny arena intake is the maximum cue.
    this._arenaReaction('oh', 0.20);
  }

  _sessionEndCue() {
    super._sessionEndCue();
    this._arenaReaction('cheer', 0.55);
  }
}
