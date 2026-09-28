import { GAME_CONFIG } from '../config/gameConfig.js';

function orientedTangent(sample) {
  const tangent = sample.tangent.clone();
  if (tangent.x < 0) tangent.multiplyScalar(-1);
  return tangent;
}

export function simulationToPresentationState(profile, simulationState) {
  const sample = profile.sample(simulationState.pipeX);
  const tangent = orientedTangent(sample);
  const airborne = simulationState.mode === 'airborne';
  const verticalVelocity = airborne
    ? simulationState.airVerticalVelocity
    : simulationState.tangentVelocity * tangent.y;
  const surfaceAngle = Math.atan2(tangent.y, tangent.x);
  const threshold = GAME_CONFIG.passivePhysics.presentationVerticalEpsilon;
  const speedReference = GAME_CONFIG.passivePhysics.presentationSpeedReference;

  return {
    pipeX: simulationState.pipeX,
    tangentVelocity: simulationState.tangentVelocity,
    ascending: verticalVelocity > threshold,
    descending: verticalVelocity < -threshold,
    pumpCompression: simulationState.pumpIntent < 0
      ? simulationState.pumpWindowInfluence
      : 0,
    airborne,
    verticalVelocity,
    worldY: airborne ? simulationState.airY : null,
    surfaceAngle,
    rotation: 0,
    landing: 0,
    landingQuality: 'none',
    trickType: simulationState.trickType || null,
    trickProgress: simulationState.trickProgress || 0,
    speedNormalized: Math.min(
      1,
      Math.abs(airborne ? simulationState.airVerticalVelocity : simulationState.tangentVelocity)
        / Math.max(0.001, speedReference),
    ),
  };
}
