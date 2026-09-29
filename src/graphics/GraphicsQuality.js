const PRESETS = Object.freeze({
  performance: Object.freeze({
    pixelRatio: 1.0,
    shadowSize: 1024,
    anisotropy: 2,
    environmentQuality: 'low',
    environmentSigma: 0.11,
    environmentIntensity: 0.74,
    toneMappingExposure: 0.98,
    fogDensity: 0.0038,
    vfxScale: 0.65,
  }),
  balanced: Object.freeze({
    pixelRatio: 1.3,
    shadowSize: 1536,
    anisotropy: 4,
    environmentQuality: 'medium',
    environmentSigma: 0.075,
    environmentIntensity: 0.79,
    toneMappingExposure: 0.99,
    fogDensity: 0.0040,
    vfxScale: 0.82,
  }),
  high: Object.freeze({
    pixelRatio: 1.6,
    shadowSize: 2048,
    anisotropy: 8,
    environmentQuality: 'high',
    environmentSigma: 0.05,
    environmentIntensity: 0.84,
    toneMappingExposure: 1.0,
    fogDensity: 0.0042,
    vfxScale: 1.0,
  }),
  ultra: Object.freeze({
    pixelRatio: 2.0,
    shadowSize: 2048,
    anisotropy: 16,
    environmentQuality: 'ultra',
    environmentSigma: 0.035,
    environmentIntensity: 0.88,
    toneMappingExposure: 1.02,
    fogDensity: 0.0043,
    vfxScale: 1.15,
  }),
});

export const GRAPHICS_PRESETS = PRESETS;
export const DEFAULT_GRAPHICS_PRESET = 'high';

export function normalizeGraphicsPreset(name = DEFAULT_GRAPHICS_PRESET) {
  const normalized = String(name).trim().toLowerCase();
  if (!Object.hasOwn(PRESETS, normalized)) {
    throw new RangeError(`Unknown graphics preset: ${name}`);
  }
  return normalized;
}

export function getGraphicsPreset(name = DEFAULT_GRAPHICS_PRESET) {
  return PRESETS[normalizeGraphicsPreset(name)];
}
