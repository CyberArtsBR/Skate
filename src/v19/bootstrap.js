import { installHalfpipeV9GameplayPatches } from '../v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from '../v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from '../v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';
import { installCyberEnvironmentRedirect } from '../v18/installCyberEnvironmentRedirect.js';
import { installHalfpipeV18Patches } from '../v18/installHalfpipeV18Patches.js';
import { installHalfpipeV19PresentationPatches } from './installHalfpipeV19PresentationPatches.js';

const CYBER_BACKGROUND_ALIAS = '/images/maps/cyber-night.jpg';
const CYBER_BACKGROUND_ASSET = '/images/maps/cyber-night.png';

function installCyberBackgroundAlias() {
  const foundation = globalThis.window?.__HALFPIPE_FOUNDATION__;
  const background = foundation?.background;
  if (!background?.setImage || background.__halfpipeV19CyberAliasInstalled) return false;
  background.__halfpipeV19CyberAliasInstalled = true;

  const originalSetImage = background.setImage;
  background.setImage = async (url = '', position) => {
    const logicalUrl = String(url || '');
    const resolvedUrl = logicalUrl === CYBER_BACKGROUND_ALIAS
      ? CYBER_BACKGROUND_ASSET
      : logicalUrl;
    const result = await originalSetImage(resolvedUrl, position);

    // Keep the V18 logical map descriptor stable for compatibility while the
    // browser loads the actual shipped PNG. The visible CSS plate always points
    // at the real file, so there is no missing request or black-background frame.
    if (logicalUrl === CYBER_BACKGROUND_ALIAS) {
      background.element.dataset.assetUrl = CYBER_BACKGROUND_ALIAS;
      background.state.imageUrl = CYBER_BACKGROUND_ALIAS;
      return { ...result, imageUrl: CYBER_BACKGROUND_ALIAS };
    }
    return result;
  };

  // The map picker is created during main initialization, before this runtime
  // alias can wrap the background API. Repair its preview once so Cyber Night
  // uses the real shipped image instead of requesting the absent .jpg alias.
  const cyberPreview = document.querySelector('.map-card[data-map-id="cyber-night"] img');
  if (cyberPreview) cyberPreview.src = CYBER_BACKGROUND_ASSET;
  return true;
}

// Preserve the V18 customization behavior: fresh loads begin with Random on
// rider, board and map, while a resolved choice remains stable for the session.
try {
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.rider-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.board-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.map-selection', 'random');
} catch {}

installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installCyberEnvironmentRedirect();
installHalfpipeV18Patches();
installHalfpipeV19PresentationPatches();

await import('../main.js');
installCyberBackgroundAlias();
// Load after main.js/style.css and V18 CSS so V19 remains a small, reversible
// presentation layer rather than forking the working UI/gameplay architecture.
await import('./v19.css');
await import('./v19-motion.css');
