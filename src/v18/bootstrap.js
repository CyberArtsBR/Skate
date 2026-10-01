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

// Portals serves the built game from a nested route. Install this before any
// runtime loaders are created so legacy/root-absolute Three.js URLs are rebased
// to Vite's configured public base instead of the host application's root.
installPortalsAssetBase();
installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installCyberEnvironmentRedirect();
installHalfpipeV18Patches();
await import('../main.js');