import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import {
  normalizeLandingQuality,
  resolveSkateAnimationState,
} from '../character/SkateAnimationState.js';

function orientedTangent(sample) {
  const tangent = sample.tangent.clone();
  if (tangent.x < 0) tangent.multiplyScalar(-1);
  return tangent;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeInOut(value) {
  const t = clamp01(value);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function explicitLanding(simulationState) {
  return clamp01(
    simulationState.landing
    ?? simulationState.landingImpact
    ?? simulationState.landingProgress
    ?? 0,
  );
}

function explicitLandingQuality(simulationState) {
  return normalizeLandingQuality(
    simulationState.landingQuality
    ?? simulationState.lastLandingQuality
    ?? simulationState.landingResult
    ?? 'none',
  );
}

function visualTurnDirection(simulationState, side, finalFacingYaw) {
  const provided = Number(
    simulationState.airTurnDirection
    || simulationState.lastTrickTurnDirection,
  );
  if (provided) return Math.sign(provided);

  // Fallback for future/alternate gameplay cores that do not provide an
  // explicit turn direction. Mirror from wall, facing and stance rather than
  // assuming every maneuver rotates the same way.
  const stanceSign = GAME_CONFIG.rider.stance === 'goofy' ? -1 : 1;
  const facingSign = Math.cos(finalFacingYaw) < 0 ? -1 : 1;
  return Math.sign((side || 1) * stanceSign * facingSign) || 1;
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
  const wallFraction = Math.max(
    0,
    Math.min(
      1,
      (Math.abs(simulationState.pipeX) - profile.flatHalfWidth)
        / profile.transitionWidth,
    ),
  );
  const distanceFromCoping = 1 - wallFraction;
  const rampAscending = Boolean(
    !airborne
    && wallFraction > 0.02
    && simulationState.pipeX * simulationState.tangentVelocity > threshold
    && !simulationState.surfaceTrickActive
  );
  const speedReference = GAME_CONFIG.passivePhysics.presentationSpeedReference;
  const trickConfig = GAME_CONFIG.trickPresentation;
  const speedNormalized = Math.min(
    1,
    Math.abs(airborne ? simulationState.airVerticalVelocity : simulationState.tangentVelocity)
      / Math.max(0.001, speedReference),
  );

  // Continuous ramp preload: neutral at the flat, progressive through the
  // transition, strongest only near coping. Speed, upward phase and pump timing
  // all contribute without an upright -> deep-crouch binary snap.
  const wallCurve = smoothstep01((wallFraction - 0.04) / 0.96);
  const upperCurve = smoothstep01((wallFraction - 0.5) / 0.5);
  const copingCurve = smoothstep01((wallFraction - 0.82) / 0.18);
  const pumpCompression = simulationState.pumpIntent < 0
    ? clamp01(simulationState.pumpWindowInfluence)
    : 0;
  const upwardFactor = rampAscending
    ? clamp01(0.45 + Math.abs(verticalVelocity) / Math.max(0.001, speedReference))
    : 0;
  const preloadCompression = clamp01(
    0.28
    + (rampAscending ? 1 : 0) * (
      wallCurve * 0.16
      + upperCurve * 0.24
      + copingCurve * 0.12
      + speedNormalized * 0.08
      + pumpCompression * 0.08
      + upwardFactor * 0.05
    )
    + (!airborne && verticalVelocity < -threshold ? (1 - wallFraction) * 0.06 : 0),
  );

  const finalFacingYaw = (Number(simulationState.facingTurns) || 0) * Math.PI;
  let facingYaw = finalFacingYaw;
  let trickType = simulationState.trickType || null;
  let trickProgress = clamp01(simulationState.trickProgress);
  let trickRoll = 0;
  let trickPitch = 0;
  let trickOffsetX = 0;
  let trickOffsetY = 0;
  let trickVisualActive = false;

  const dropTime = Math.max(0, Number(simulationState.time) || 0);
  const dropDuration = Math.max(0.001, trickConfig.dropInDuration);
  const dropInProgress = clamp01(dropTime / dropDuration);
  const dropInRoll = (
    !airborne
    && !simulationState.surfaceTrickActive
    && dropTime < dropDuration
  )
    ? trickConfig.dropInNoseLift * (1 - easeInOut(dropInProgress))
    : 0;

  const currentSide = Number(simulationState.airSide)
    || Number(simulationState.lastTrickSide)
    || Math.sign(simulationState.pipeX)
    || 1;
  const turnDirection = visualTurnDirection(
    simulationState,
    currentSide,
    finalFacingYaw,
  );

  if (
    airborne
    && (
      simulationState.backflipAttempted
      || simulationState.backflipActive
      || trickType === 'backflip'
    )
  ) {
    const flipDegrees = Math.max(0, Number(simulationState.backflipRotationDegrees) || 0);
    const flipRadians = THREE.MathUtils.degToRad(flipDegrees);
    const segment = (flipDegrees % 360) / 360;
    trickPitch = -flipRadians;
    trickRoll = -currentSide * 0.05 * Math.sin(Math.PI * segment);
    trickProgress = segment;
    trickVisualActive = flipDegrees > 0;
    trickType = 'backflip';
  } else if (
    airborne
    && (
      simulationState.airTurnAttempted
      || simulationState.airTurnActive
      || trickType === 'aerial-turn'
    )
  ) {
    const explicitRotation = Math.max(0, Number(simulationState.airRotationDegrees) || 0);
    const rotationDegrees = explicitRotation > 0
      ? explicitRotation
      : clamp01(simulationState.trickProgress) * 180;
    const segment = (rotationDegrees % 180) / 180;
    facingYaw = finalFacingYaw
      + turnDirection * THREE.MathUtils.degToRad(rotationDegrees);
    trickRoll = -currentSide
      * trickConfig.aerialRoll
      * Math.sin(Math.PI * segment);
    trickProgress = segment;
    trickVisualActive = rotationDegrees > 0;
    trickType = 'aerial-turn';
  } else if (
    !airborne
    && simulationState.surfaceTrickActive
    && simulationState.surfaceTrickType
  ) {
    const isHandPlant = simulationState.surfaceTrickType === 'hand-plant';
    const side = Number(simulationState.lastTrickSide) || currentSide;
    const envelope = Math.sin(Math.PI * trickProgress);

    trickType = simulationState.surfaceTrickType;
    // finalFacingYaw contains the completed 180. Start from the previous facing
    // and honor the gameplay-provided direction when present.
    facingYaw = finalFacingYaw
      - turnDirection * Math.PI * (1 - trickProgress);

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

  const copingX = currentSide < 0 ? profile.leftLip : profile.rightLip;
  const copingSample = profile.sample(copingX);
  const lipY = Number(copingSample?.y) || 0;
  const worldY = airborne ? Number(simulationState.airY) : null;
  const airHeight = airborne && Number.isFinite(worldY)
    ? Math.max(0, worldY - lipY)
    : 0;
  const landingAnticipation = airborne && verticalVelocity < 0
    ? clamp01(1 - airHeight / 2.2)
    : 0;
  const baseAirTuck = airborne
    ? clamp01(smoothstep01(airHeight / 3.2) * (1 - landingAnticipation * 0.45))
    : 0;
  const airTuck = airborne && trickType === 'backflip'
    ? Math.max(0.82, baseAirTuck)
    : baseAirTuck;
  const landing = explicitLanding(simulationState);
  const landingQuality = explicitLandingQuality(simulationState);

  const presentation = {
    time: dropTime,
    pipeX: simulationState.pipeX,
    tangentVelocity: simulationState.tangentVelocity,
    ascending: verticalVelocity > threshold,
    descending: verticalVelocity < -threshold,
    rampAscending,
    pumpCompression,
    airborne,
    verticalVelocity,
    worldY,
    surfaceAngle,
    wallFraction,
    distanceFromCoping,
    wallSide: currentSide,
    rotation: 0,
    facingYaw,
    turnDirection,
    trickRoll,
    trickPitch,
    trickOffsetX,
    trickOffsetY,
    trickVisualActive,
    dropInRoll,
    dropInProgress,
    landing,
    landingQuality,
    landingAnticipation,
    recovery: 0,
    trickType,
    trickProgress,
    speedNormalized,
    preloadCompression,
    airHeight,
    airTuck,
    footIKWeight: airborne ? 0.3 + landingAnticipation * 0.6 : 1,
    secondaryLag: 0,
    copingWorldPoint: {
      x: Number(copingSample?.x ?? copingX),
      y: lipY,
      z: 0,
    },
  };
  presentation.animationState = resolveSkateAnimationState(presentation);
  presentation.animationBlend = 1;
  presentation.stateTime = 0;
  return presentation;
}
