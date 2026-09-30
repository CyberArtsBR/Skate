const STANDARD_LIGHTING = Object.freeze({
  hemisphere: 1.7,
  key: 3.7,
  fill: 0.95,
  shadowRadius: 3.0,
});

const NO_POST_PROCESSING = Object.freeze({ enabled: false });

const PRESETS = Object.freeze({
  performance: Object.freeze({
    pixelRatio: 1.0,
    shadowSize: 1024,
    anisotropy: 2,
    environmentQuality: 'low',
    environmentSigma: 0.11,
    environmentIntensity: 0.74,
    frontMetalEnvMapIntensity: 1.8,
    toneMappingExposure: 0.98,
    fogDensity: 0.0038,
    vfxScale: 0.65,
    lighting: STANDARD_LIGHTING,
    postProcessing: NO_POST_PROCESSING,
  }),
  balanced: Object.freeze({
    pixelRatio: 1.3,
    shadowSize: 1536,
    anisotropy: 4,
    environmentQuality: 'medium',
    environmentSigma: 0.075,
    environmentIntensity: 0.79,
    frontMetalEnvMapIntensity: 2.0,
    toneMappingExposure: 0.99,
    fogDensity: 0.0040,
    vfxScale: 0.82,
    lighting: STANDARD_LIGHTING,
    postProcessing: NO_POST_PROCESSING,
  }),
  high: Object.freeze({
    pixelRatio: 1.6,
    shadowSize: 2048,
    anisotropy: 8,
    environmentQuality: 'high',
    environmentSigma: 0.05,
    environmentIntensity: 0.84,
    frontMetalEnvMapIntensity: 2.4,
    toneMappingExposure: 1.0,
    fogDensity: 0.0042,
    vfxScale: 1.0,
    lighting: STANDARD_LIGHTING,
    postProcessing: NO_POST_PROCESSING,
  }),
  ultra: Object.freeze({
    pixelRatio: 2.0,
    shadowSize: 2048,
    anisotropy: 16,
    environmentQuality: 'ultra',
    environmentSigma: 0.035,
    environmentIntensity: 0.88,
    frontMetalEnvMapIntensity: 2.8,
    toneMappingExposure: 1.02,
    fogDensity: 0.0043,
    vfxScale: 1.15,
    lighting: STANDARD_LIGHTING,
    postProcessing: NO_POST_PROCESSING,
  }),
  cinematic: Object.freeze({
    pixelRatio: 2.25,
    shadowSize: 4096,
    anisotropy: 16,
    environmentQuality: 'cinematic',
    environmentSigma: 0.025,
    environmentIntensity: 1.15,
    frontMetalEnvMapIntensity: 3.4,
    toneMappingExposure: 1.0,
    fogDensity: 0.0032,
    vfxScale: 1.25,
    lighting: Object.freeze({
      hemisphere: 1.25,
      key: 3.3,
      fill: 0.65,
      shadowRadius: 2.0,
    }),
    postProcessing: Object.freeze({
      enabled: true,
      bloomStrength: 0.25,
      bloomRadius: 0.30,
      bloomThreshold: 0.90,
      aoEnabled: true,
      aoBlendIntensity: 0.36,
      sharpenAmount: 0.08,
    }),
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
