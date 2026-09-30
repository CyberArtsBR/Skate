import { installHalfpipeV9GameplayPatches } from './installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9RuntimePatches } from './installHalfpipeV9RuntimePatches.js';

installHalfpipeV9GameplayPatches();
installHalfpipeV9RuntimePatches();
await import('../main.js');
