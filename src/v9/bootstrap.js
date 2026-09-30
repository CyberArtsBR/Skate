import { installHalfpipeV9GameplayPatches } from './installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from './installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from './installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';

installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
await import('../main.js');
