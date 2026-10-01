// Resolve files from Vite's configured base instead of the host root.
// Portals serves the game from a nested route (for example /g/<slug>/), so
// root-absolute URLs like /models/foo.glb point outside the game bundle.
const BASE_URL = import.meta.env?.BASE_URL || './';

export function publicAssetUrl(pathname) {
  const value = String(pathname || '').trim();
  if (!value) return value;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return value;
  const clean = value.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}
