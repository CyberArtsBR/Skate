// Resolve files from the built Vite bundle location rather than from the host
// document URL. Portals can serve the HTML at a nested route that does not end
// in '/', so document-relative paths such as ./images/foo.jpg can resolve one
// level too high even though ./assets/index-*.js loaded successfully.
const BASE_URL = import.meta.env?.BASE_URL || '/';
const IS_PRODUCTION = Boolean(import.meta.env?.PROD);

function productionBundleRoot() {
  try {
    const moduleUrl = new URL(import.meta.url);
    const marker = '/assets/';
    const markerIndex = moduleUrl.pathname.lastIndexOf(marker);
    if (markerIndex < 0) return null;
    moduleUrl.pathname = moduleUrl.pathname.slice(0, markerIndex + 1);
    moduleUrl.search = '';
    moduleUrl.hash = '';
    return moduleUrl;
  } catch {
    return null;
  }
}

export function publicAssetUrl(pathname) {
  const value = String(pathname || '').trim();
  if (!value) return value;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) return value;

  const clean = value.replace(/^\.\//, '').replace(/^\/+/, '');

  if (IS_PRODUCTION) {
    const bundleRoot = productionBundleRoot();
    if (bundleRoot) return new URL(clean, bundleRoot).href;
  }

  try {
    const origin = globalThis.location?.origin || 'http://localhost';
    const base = new URL(BASE_URL, `${origin}/`);
    return new URL(clean, base).href;
  } catch {
    return `${BASE_URL}${clean}`;
  }
}
