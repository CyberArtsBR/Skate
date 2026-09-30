import { installHalfpipeV9GameplayPatches } from '../v9/installHalfpipeV9GameplayPatches.js';
import { installHalfpipeV9EventPatches } from '../v9/installHalfpipeV9EventPatches.js';
import { installHalfpipeV9RuntimePatches } from '../v9/installHalfpipeV9RuntimePatches.js';
import { installHalfpipeV16Patches } from '../v16/installHalfpipeV16Patches.js';
import { installCyberEnvironmentRedirect } from './installCyberEnvironmentRedirect.js';
import { installHalfpipeV18Patches } from './installHalfpipeV18Patches.js';

installHalfpipeV9GameplayPatches();
installHalfpipeV9EventPatches();
installHalfpipeV9RuntimePatches();
installHalfpipeV16Patches();
installCyberEnvironmentRedirect();
installHalfpipeV18Patches();
await import('../main.js');
