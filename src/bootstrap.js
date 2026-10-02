import { installHalfpipeV9GameplayPatches } from './v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from './v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from './v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from './v16/installHalfpipeV16Patches.js';
import { installHalfpipeV18Patches } from './v18/installHalfpipeV18Patches.js';

// Compatibility bootstrap while Phase 2 moves versioned behavior into canonical
// systems. Fresh loads intentionally start all three customization axes on
// Random; remaining patch installers are retired incrementally behind CI gates.
try {
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.rider-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.board-selection', 'random');
  globalThis.localStorage?.setItem('chimpions-halfpipe.v18.map-selection', 'random');
} catch {}

installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installHalfpipeV18Patches();

await import('./main.js');
