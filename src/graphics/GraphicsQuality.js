const STANDARD_LIGHTING = Object.freeze({
  // V19: keep the outdoor key readable while reducing the broad ambient wash
  // that made riders and pale ramp surfaces appear self-lit.
  hemisphere: 1.22,
  key: 3.05,
  fill: 0.58,
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
    environmentIntensity: 0.70,
    frontMetalEnvMapIntensity: 1.8,
    toneMappingExposure: 0.94,
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
    environmentIntensity: 0.76,
    frontMetalEnvMapIntensity: 2.0,
    toneMappingExposure: 0.95,
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
    environmentIntensity: 0.82,
    frontMetalEnvMapIntensity: 2.4,
    toneMappingExposure: 0.96,
    fogDensity: 0.0040,
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
    toneMappingExposure: 0.98,
    fogDensity: 0.0041,
    vfxScale: 1.10,
    lighting: STANDARD_LIGHTING,
    postProcessing: NO_POST_PROCESSING,
  }),
  cinematic: Object.freeze({
    pixelRatio: 2.25,
    shadowSize: 4096,
    anisotropy: 16,
    environmentQuality: 'cinematic',
    environmentSigma: 0.025,
    environmentIntensity: 0.95,
    frontMetalEnvMapIntensity: 3.2,
    toneMappingExposure: 0.96,
    fogDensity: 0.0030,
    vfxScale: 1.15,
    lighting: Object.freeze({
      hemisphere: 1.08,
      key: 2.85,
      fill: 0.48,
      shadowRadius: 2.0,
    }),
    // Keep the audited stable path: the experimental full-screen composer can
    // still produce a transparent base pass on some WebGL/browser combinations.
    // V19 gets its premium look from camera, IBL, materials, lighting, VFX and
    // typography rather than an unstable global post stack.
    postProcessing: NO_POST_PROCESSING,
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
