import { installHalfpipeV9GameplayPatches } from '../v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from '../v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from '../v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';
import { installCyberEnvironmentRedirect } from './installCyberEnvironmentRedirect.js';
import { installHalfpipeV18Patches } from './installHalfpipeV18Patches.js';
import { installCopingSelectiveBloomFix } from './installCopingSelectiveBloomFix.js';

// V18 starts every fresh game load with all three customization axes on Random.
// Choices still remain stable while the current page/session is running.
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
installCopingSelectiveBloomFix();
await import('../main.js');
