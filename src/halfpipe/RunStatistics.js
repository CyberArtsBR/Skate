export const RUN_STAT_KEYS = Object.freeze([
  'score',
  'bestTrick',
  'bestTrickPoints',
  'runMaxAirY',
  'highestAir',
  'bestCombo',
  'tricksAttempted',
  'tricksLanded',
  'perfectLandings',
  'cleanLandings',
  'crashes',
  'pumpAccuracy',
]);

/**
 * Read-only run summary extracted from HalfpipeSimulation state.
 *
 * Keeping this pure makes results/reporting independent from presentation and
 * lets HalfpipeSimulation delegate statistics without changing authoritative
 * simulation state ownership.
 */
export function snapshotRunStatistics(state = {}) {
  const stats = {};
  for (const key of RUN_STAT_KEYS) stats[key] = state[key] ?? null;
  return stats;
}
