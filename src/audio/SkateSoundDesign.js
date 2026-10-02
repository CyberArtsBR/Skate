import { createEnvironmentBed as createCoreEnvironmentBed } from './SkateSoundDesignCore.js';

export {
  SKATE_SOUND,
  createSkateTexture,
  createDeckImpactBank,
  createVariedRollBuffer,
  createRecordedImpactBank,
  createPhysicalContactBank,
} from './SkateSoundDesignCore.js';

const ENVIRONMENT_SHAPES = Object.freeze({
  gym: Object.freeze({ base: 'city', level: 0.72, pulse: 0.035, cycles: 5, tone: 0.010, toneCycles: 13 }),
  japan: Object.freeze({ base: 'outdoor', level: 0.88, pulse: 0.055, cycles: 3, tone: 0.006, toneCycles: 17 }),
  canyon: Object.freeze({ base: 'outdoor', level: 1.06, pulse: 0.12, cycles: 2, tone: 0.002, toneCycles: 7 }),
  park: Object.freeze({ base: 'outdoor', level: 0.94, pulse: 0.075, cycles: 4, tone: 0.004, toneCycles: 19 }),
  space: Object.freeze({ base: 'night', level: 0.42, pulse: 0.025, cycles: 2, tone: 0.012, toneCycles: 5 }),
  city: Object.freeze({ base: 'city', level: 0.92, pulse: 0.065, cycles: 3, tone: 0.004, toneCycles: 11 }),
  forest: Object.freeze({ base: 'outdoor', level: 1.00, pulse: 0.095, cycles: 2, tone: 0.003, toneCycles: 23 }),
  cyber: Object.freeze({ base: 'night', level: 0.72, pulse: 0.055, cycles: 4, tone: 0.014, toneCycles: 9 }),
});

function resolveShape(kind) {
  const name = String(kind || 'park').toLowerCase();
  if (ENVIRONMENT_SHAPES[name]) return ENVIRONMENT_SHAPES[name];
  if (name === 'night' || name === 'cyber-night') return ENVIRONMENT_SHAPES.cyber;
  if (name === 'outdoor' || name === 'california' || name === 'tree-house') return ENVIRONMENT_SHAPES.park;
  return ENVIRONMENT_SHAPES.city;
}

/**
 * Phase 6 keeps the proven low-memory procedural beds but treats them as final
 * authored atmosphere rather than placeholders. Each arena gets a deterministic
 * amplitude/room-tone shape with integer loop cycles, preserving seamlessness.
 */
export function createEnvironmentBed(context, kind = 'park') {
  const shape = resolveShape(kind);
  const source = createCoreEnvironmentBed(context, shape.base);
  const output = context.createBuffer(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );

  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const samples = output.getChannelData(channel);
    const phaseOffset = channel * Math.PI * 0.37;
    for (let i = 0; i < source.length; i++) {
      const phase = i / source.length * Math.PI * 2;
      const movement = 1 + Math.sin(phase * shape.cycles + phaseOffset) * shape.pulse;
      const roomTone = Math.sin(phase * shape.toneCycles + phaseOffset * 0.5) * shape.tone;
      samples[i] = input[i] * shape.level * movement + roomTone;
    }
  }

  return output;
}
