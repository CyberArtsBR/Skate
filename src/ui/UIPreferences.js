import './ui-theme.css';

// The HUD and menus share the existing player settings. Keep this on their
// common stage so newly created result/podium elements inherit it immediately.
export function applyGameUIPreferences(stage, {
  highContrast = false,
  uiScale = 1,
  reducedMotion = false,
} = {}) {
  const preferences = {
    highContrast: Boolean(highContrast),
    uiScale: Math.max(0.85, Math.min(1.5, Number(uiScale) || 1)),
    reducedMotion: Boolean(reducedMotion),
  };
  stage?.style?.setProperty('--menu-ui-scale', String(preferences.uiScale));
  stage?.classList?.toggle('is-ui-high-contrast', preferences.highContrast);
  stage?.classList?.toggle('is-ui-reduced-motion', preferences.reducedMotion);
  return preferences;
}
