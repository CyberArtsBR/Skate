const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const PUMP_RATINGS = Object.freeze({
  PERFECT: 'PERFECT',
  GOOD: 'GOOD',
  WEAK: 'WEAK',
  EARLY: 'EARLY',
  LATE: 'LATE',
  WRONG: 'WRONG',
});

export function evaluatePumpRating({
  intent,
  desiredIntent,
  wallFraction,
  speedEligible = true,
}) {
  if (!speedEligible || !intent) return null;
  if (intent !== desiredIntent) return PUMP_RATINGS.WRONG;

  const fraction = clamp01(wallFraction);
  const idealCenter = desiredIntent > 0 ? 0.62 : 0.38;
  const error = fraction - idealCenter;
  const absoluteError = Math.abs(error);

  // V8 keeps pumping skill-based, but widens the windows enough that a bail
  // does not leave the player trapped at low speed for too long.
  if (absoluteError <= 0.11) return PUMP_RATINGS.PERFECT;
  if (absoluteError <= 0.24) return PUMP_RATINGS.GOOD;
  if (absoluteError <= 0.37) return PUMP_RATINGS.WEAK;

  return error < 0 ? PUMP_RATINGS.EARLY : PUMP_RATINGS.LATE;
}

export function pumpAccuracyWeight(rating) {
  switch (rating) {
    case PUMP_RATINGS.PERFECT: return 1;
    case PUMP_RATINGS.GOOD: return 0.81;
    case PUMP_RATINGS.WEAK: return 0.52;
    case PUMP_RATINGS.EARLY:
    case PUMP_RATINGS.LATE: return 0.22;
    default: return 0;
  }
}
