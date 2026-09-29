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
  if (type === 'kick-turn') return scoringConfig.kickTurn;
  if (type === 'hand-plant') return scoringConfig.handPlant;
  if (type === 'backflip') return scoringConfig.backflip || scoringConfig.aerialTurn;
  if (type === 'double-backflip') {
    return scoringConfig.doubleBackflip || scoringConfig.backflip || scoringConfig.aerialTurn;
  }

  const aerialMatch = /^aerial-(180|360|540|720|900)$/.exec(String(type || ''));
  if (aerialMatch) {
    const key = 'aerial' + aerialMatch[1];
    return scoringConfig[key] || scoringConfig.aerialTurn;
  }

  return scoringConfig.aerialTurn;
}
