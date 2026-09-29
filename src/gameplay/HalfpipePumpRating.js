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
  const idealCenter = desiredIntent < 0 ? 0.48 : 0.28;
  const error = fraction - idealCenter;
  const absoluteError = Math.abs(error);

  if (absoluteError <= 0.12) return PUMP_RATINGS.PERFECT;
  if (absoluteError <= 0.24) return PUMP_RATINGS.GOOD;
  if (absoluteError <= 0.40) return PUMP_RATINGS.WEAK;

  return error < 0 ? PUMP_RATINGS.EARLY : PUMP_RATINGS.LATE;
}

export function pumpAccuracyWeight(rating) {
  switch (rating) {
    case PUMP_RATINGS.PERFECT: return 1;
    case PUMP_RATINGS.GOOD: return 0.8;
    case PUMP_RATINGS.WEAK: return 0.55;
    case PUMP_RATINGS.EARLY:
    case PUMP_RATINGS.LATE: return 0.25;
    default: return 0;
  }
}
