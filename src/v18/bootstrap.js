import { publicAssetUrl } from '../config/publicAssetUrl.js';
import { installHalfpipeV9GameplayPatches } from '../v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from '../v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from '../v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';
import { installPortalsAssetBase } from './installPortalsAssetBase.js';
import { installCyberEnvironmentRedirect } from './installCyberEnvironmentRedirect.js';
import { installHalfpipeV18Patches } from './installHalfpipeV18Patches.js';

// V18 starts every fresh game load with all three customization axes on Random.
// Choices still remain stable while the current page/session is running.
try {
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.rider-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.board-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.map-selection', 'random');
} catch {}

// The HTML shell cannot safely know Portals' effective nested asset root when
// the preview URL has no trailing slash. Resolve the opening artwork from the
// already-loaded JS bundle location before the main game bootstrap starts.
const openingImage = document.querySelector('[data-opening-image]');
if (openingImage) {
  openingImage.src = publicAssetUrl('images/backgrounds/halfpipe-opening.jpg');
}

// Portals serves the built game from a nested route. Install this before any
// runtime loaders are created so legacy/root-absolute Three.js URLs are rebased
// to the actual built-game root instead of the host application's root.
installPortalsAssetBase();
installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installCyberEnvironmentRedirect();
installHalfpipeV18Patches();
await import('../main.js');
