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
  return scoringConfig.aerialTurn;
}
