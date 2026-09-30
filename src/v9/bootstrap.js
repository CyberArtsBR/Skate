import { installHalfpipeV9GameplayPatches } from './installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from './installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from './installHalfpipeV9RuntimePatches.js';

installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
await import('../main.js');
