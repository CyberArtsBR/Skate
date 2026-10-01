export function comboMultiplierForCount(comboCount) {
  const count = Math.max(0, Math.trunc(comboCount) || 0);
  if (count >= 5) return 3;
  if (count === 4) return 2;
  if (count === 3) return 1.5;
  if (count === 2) return 1.25;
  return 1;
}

export function repetitionMultiplier(repeatCount) {
  const count = Math.max(1, Math.trunc(repeatCount) || 1);
  if (count <= 1) return 1;
  if (count === 2) return 0.78;
  return 0.58;
}

export function scoreRangeForTrick(scoringConfig, type) {
  const normalizedType = String(type || '');
  const fakie = normalizedType.startsWith('fakie-');
  const baseType = fakie ? normalizedType.slice('fakie-'.length) : normalizedType;
  const fakieMultiplier = fakie
    ? Math.max(1, Number(scoringConfig.fakieAerialMultiplier) || 1.1)
    : 1;
  const applyFakie = range => ({
    min: Math.round(range.min * fakieMultiplier),
    max: Math.round(range.max * fakieMultiplier),
  });
  const combined = /^aerial-(180|360|540|720)-(backflip|double-backflip)$/.exec(baseType);
  if (combined) {
    const aerial = scoreRangeForTrick(scoringConfig, 'aerial-' + combined[1]);
    const flip = scoreRangeForTrick(scoringConfig, combined[2]);
    const difficulty = Math.max(1, Number(scoringConfig.airCombinationMultiplier) || 1.1);
    return applyFakie({
      min: Math.round((aerial.min + flip.min) * difficulty),
      max: Math.round((aerial.max + flip.max) * difficulty),
    });
  }
  if (baseType === 'kick-turn') return scoringConfig.kickTurn;
  if (baseType === 'hand-plant') return scoringConfig.handPlant;
  if (baseType === 'backflip') return scoringConfig.backflip || scoringConfig.aerialTurn;
  if (baseType === 'double-backflip') {
    return scoringConfig.doubleBackflip || scoringConfig.backflip || scoringConfig.aerialTurn;
  }

  const aerialMatch = /^aerial-(180|360|540|720|900)$/.exec(baseType);
  if (aerialMatch) {
    const key = 'aerial' + aerialMatch[1];
    return applyFakie(scoringConfig[key] || scoringConfig.aerialTurn);
  }

  return scoringConfig.aerialTurn;
}

// Read-only explanation of the shipped score formula. Execution quality
// already includes height, completed rotation, hold timing and landing.
// Exposing this does not award points or change the established balance.
export function describeTrickScore(config, state, event, flowMultiplier = 1) {
  const range = scoreRangeForTrick(config, event.trick);
  const quality = Math.max(0, Math.min(1, Number(event.quality) || 0));
  return Object.freeze({
    basePoints: Math.round(range.min + (range.max - range.min) * quality),
    quality,
    airHeight: /backflip|aerial/.test(event.trick)
      ? Math.max(0, (Number(state.currentAirPeakY) || 0) - (Number(state.currentAirBaseY) || 0)) : 0,
    rotationDegrees: /backflip/.test(event.trick)
      ? Math.abs(Number(state.backflipRotationDegrees) || 0)
      : Math.abs(Number(state.airRotationDegrees) || 0),
    aerialRotationDegrees: Math.abs(Number(state.airRotationDegrees) || 0),
    backflipRotationDegrees: Math.abs(Number(state.backflipRotationDegrees) || 0),
    combinedTrick: /^(?:fakie-)?aerial-\d+-(?:double-)?backflip$/.test(event.trick),
    fakieTakeoff: /^fakie-aerial-/.test(event.trick),
    landingMultiplier: Number(event.landingScoreMultiplier) || 1,
    comboMultiplier: Number(event.comboMultiplier) || 1,
    varietyMultiplier: Number(event.varietyMultiplier) || 1,
    rhythmMultiplier: 1 + (Number(state.comboPumpBoost) || 0),
    flowMultiplier,
    finalPoints: Number(event.points) || 0,
  });
}
