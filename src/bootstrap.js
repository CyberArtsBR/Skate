import { publicAssetUrl } from './config/publicAssetUrl.js';
import { installHalfpipeV9GameplayPatches } from './v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from './v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from './v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from './v16/installHalfpipeV16Patches.js';
import { installPortalsAssetBase } from './v18/installPortalsAssetBase.js';
import { installHalfpipeV18Patches } from './v18/installHalfpipeV18Patches.js';

// The four-character roster starts on Heretic; board and map can still start on Random.
// Choices still remain stable while the current page/session is running.
try {
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.rider-selection', 'heretic');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.board-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.map-selection', 'random');
} catch {}

const openingArtworkUrl = publicAssetUrl('images/backgrounds/halfpipe-opening.jpg');

// The HTML shell cannot safely know Portals' effective nested asset root when
// the preview URL has no trailing slash. Resolve the opening artwork from the
// already-loaded JS bundle location before the main game bootstrap starts.
const openingImage = document.querySelector('[data-opening-image]');
if (openingImage) openingImage.src = openingArtworkUrl;

// Portals serves the built game from a nested route. Install this before any
// runtime loaders are created so legacy/root-absolute Three.js URLs are rebased
// to the actual built-game root instead of the host application's root.
installPortalsAssetBase();
installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installHalfpipeV18Patches();

// V16 creates the title-screen artwork dynamically and still assigns its
// historical root-absolute /images/... URL. Three.js' URL modifier cannot
// affect a regular DOM <img>, so Portals would show the boot artwork correctly
// and then go black as soon as the loading cover is removed. Watch for the
// dynamically-created title image and rebase it to the same verified artwork
// URL used by the boot cover.
function repairTitleArtwork() {
  const art = document.querySelector('.v16-title-art');
  if (!art) return false;
  if (art.src !== openingArtworkUrl) art.src = openingArtworkUrl;
  art.dataset.portalsAssetFixed = '1';
  return true;
}

let titleArtworkObserver = null;
if (!repairTitleArtwork() && globalThis.MutationObserver) {
  titleArtworkObserver = new MutationObserver(() => {
    if (!repairTitleArtwork()) return;
    titleArtworkObserver?.disconnect();
    titleArtworkObserver = null;
  });
  titleArtworkObserver.observe(document.documentElement, { childList: true, subtree: true });
}

await import('./main.js');

// The title screen is normally created during main.js module evaluation. Run
// one final synchronous repair in case it appeared between observer callbacks.
repairTitleArtwork();
titleArtworkObserver?.disconnect();
