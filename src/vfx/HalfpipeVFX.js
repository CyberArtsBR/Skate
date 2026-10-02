import * as THREE from 'three';
import { HalfpipeVFX as HalfpipeVFXCore } from './HalfpipeVFXCore.js';

function eventPosition(event, fallback) {
  return event?.contactPosition
    || event?.worldPosition
    || event?.position
    || fallback;
}

function accentForTrick(trick) {
  const name = String(trick || '').toLowerCase();
  if (name.includes('backflip')) return 0xff77d9;
  if (name.includes('hand')) return 0xffd166;
  if (name.includes('kick')) return 0x7ee8ff;
  return 0x8dffb3;
}

/**
 * Phase 6 presentation extension. The Phase-5/earlier VFX coordinator remains
 * untouched in HalfpipeVFXCore; this layer only adds non-physical celebration
 * accents and never changes camera/gameplay state.
 */
export class HalfpipeVFX extends HalfpipeVFXCore {
  handleEvent(event = {}) {
    const result = super.handleEvent(event) || { handled: false, cameraImpact: null };
    const type = String(event.type || '').trim().toUpperCase();

    if (type === 'TRICK_COMPLETED') {
      const points = Math.max(0, Number(event.points ?? event.scoreDelta ?? event.value) || 0);
      const combo = Math.max(1, Number(event.combo ?? event.multiplier) || 1);
      const intensity = THREE.MathUtils.clamp(0.28 + points / 1800 + (combo - 1) * 0.07, 0.25, 1);
      this.impact.celebration({
        position: eventPosition(event, this.lastAirState.position),
        velocity: event.worldVelocity || event.velocity || this.lastAirState.velocity,
        intensity,
        color: accentForTrick(event.trick || event.trickType),
      });
    } else if (type === 'COMBO_CHANGED') {
      const combo = Math.max(1, Number(event.combo ?? event.count ?? event.multiplier) || 1);
      if (combo >= 4) {
        this.impact.celebration({
          position: eventPosition(event, this.lastAirState.position),
          velocity: event.worldVelocity || event.velocity || this.lastAirState.velocity,
          intensity: THREE.MathUtils.clamp(0.22 + combo * 0.07, 0.25, 0.75),
          color: 0x7ee8ff,
        });
      }
    }

    return result;
  }
}
