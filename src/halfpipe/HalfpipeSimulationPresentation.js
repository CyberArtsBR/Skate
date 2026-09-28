import { GAME_CONFIG } from '../config/gameConfig.js';

function orientedTangent(sample) {
  const tangent = sample.tangent.clone();
  if (tangent.x < 0) tangent.multiplyScalar(-1);
  return tangent;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function easeInOut(value) {
  const t = clamp01(value);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  const trickConfig = GAME_CONFIG.trickPresentation;

  const finalFacingYaw = (Number(simulationState.facingTurns) || 0) * Math.PI;
  let facingYaw = finalFacingYaw;
  let trickType = simulationState.trickType || null;
  let trickProgress = clamp01(simulationState.trickProgress);
  let trickRoll = 0;
  let trickOffsetX = 0;
  let trickOffsetY = 0;
  let trickVisualActive = false;

  const currentSide = Number(simulationState.airSide)
    || Number(simulationState.lastTrickSide)
    || Math.sign(simulationState.pipeX)
    || 1;

  if (airborne && trickType === 'aerial-turn') {
    const direction = Number(simulationState.airTurnDirection)
      || (currentSide < 0 ? 1 : -1);
    const eased = easeInOut(trickProgress);
    facingYaw = finalFacingYaw + direction * Math.PI * eased;
    trickRoll = -currentSide
      * trickConfig.aerialRoll
      * Math.sin(Math.PI * trickProgress);
    trickVisualActive = trickProgress > 0;
  } else if (
    !airborne
    && simulationState.lastTrickTime !== null
    && (simulationState.lastTrick === 'kick-turn'
      || simulationState.lastTrick === 'hand-plant')
  ) {
    const isHandPlant = simulationState.lastTrick === 'hand-plant';
    const duration = isHandPlant
      ? trickConfig.handPlantDuration
      : trickConfig.kickTurnDuration;
    const age = Math.max(
      0,
      (Number(simulationState.time) || 0)
        - (Number(simulationState.lastTrickTime) || 0),
    );

    if (age <= duration) {
      trickType = simulationState.lastTrick;
      trickProgress = clamp01(age / Math.max(duration, 1e-4));
      const eased = easeInOut(trickProgress);
      const envelope = Math.sin(Math.PI * trickProgress);
      const direction = Number(simulationState.lastTrickTurnDirection) || 0;
      const side = Number(simulationState.lastTrickSide) || currentSide;

      facingYaw = finalFacingYaw
        - direction * Math.PI * (1 - eased);

      if (isHandPlant) {
        trickRoll = -side * trickConfig.handPlantRoll * envelope;
        trickOffsetX = -side * trickConfig.handPlantShift * envelope;
        trickOffsetY = trickConfig.handPlantLift * envelope;
      } else {
        trickRoll = -side * trickConfig.kickTurnRoll * envelope;
        trickOffsetY = trickConfig.kickTurnLift * envelope;
      }
      trickVisualActive = true;
    } else {
      trickType = null;
      trickProgress = 0;
    }
  }

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
    facingYaw,
    trickRoll,
    trickOffsetX,
    trickOffsetY,
    trickVisualActive,
    landing: 0,
    landingQuality: 'none',
    trickType,
    trickProgress,
    speedNormalized: Math.min(
      1,
      Math.abs(airborne ? simulationState.airVerticalVelocity : simulationState.tangentVelocity)
        / Math.max(0.001, speedReference),
    ),
  };
}
