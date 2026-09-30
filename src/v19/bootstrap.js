import { installHalfpipeV9GameplayPatches } from '../v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from '../v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from '../v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';
import { installCyberEnvironmentRedirect } from '../v18/installCyberEnvironmentRedirect.js';
import { installHalfpipeV18Patches } from '../v18/installHalfpipeV18Patches.js';
import { installHalfpipeV19PresentationPatches } from './installHalfpipeV19PresentationPatches.js';

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
// Load after main.js/style.css and V18 CSS so V19 remains a small, reversible
// presentation layer rather than forking the working UI/gameplay architecture.
await import('./v19.css');
