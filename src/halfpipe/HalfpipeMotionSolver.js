import { PHASE4_GAMEPLAY_CONFIG } from '../gameplay/phase4GameplayConfig.js';

export function signWithEpsilon(value, epsilon) {
  if (value > epsilon) return 1;
  if (value < -epsilon) return -1;
  return 0;
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function nearestRotationTarget(rotationDegrees, stepDegrees, maximumDegrees) {
  const rotation = Math.max(0, Math.abs(Number(rotationDegrees) || 0));
  const step = Math.max(1, Math.abs(Number(stepDegrees) || 180));
  const maximum = Math.max(step, Math.abs(Number(maximumDegrees) || step));
  const target = Math.max(step, Math.min(maximum, Math.round(rotation / step) * step));
  return {
    rotation,
    target,
    error: Math.abs(rotation - target),
  };
}

export function rotationQualityFromDegrees(rotationDegrees, targetDegrees = 180) {
  const error = Math.abs(
    Math.abs(Number(rotationDegrees) || 0)
    - Math.abs(Number(targetDegrees) || 180),
  );
  return clamp01(1 - error / 70);
}

/**
 * Pure geometry/kinematics boundary for HalfpipeSimulation.
 *
 * Phase 3 intentionally copies the already-shipped formulas first instead of
 * redesigning them. HalfpipeSimulation remains the authoritative coordinator;
 * later Phase-3 slices can delegate motion work here one responsibility at a
 * time while the characterization gate proves the results stay identical.
 */
export class HalfpipeMotionSolver {
  constructor(profile, {
    velocityEpsilon,
    airLaunchMinimumSpeed,
    airMaximumVerticalVelocity,
    airGravity,
    launchConfig = PHASE4_GAMEPLAY_CONFIG.launch,
  } = {}) {
    if (!profile?.sample) throw new TypeError('HalfpipeMotionSolver requires a HalfpipeProfile-like object');
    this.profile = profile;
    this.velocityEpsilon = Math.max(0, Number(velocityEpsilon) || 0);
    this.airLaunchMinimumSpeed = Math.max(0, Number(airLaunchMinimumSpeed) || 0);
    this.airMaximumVerticalVelocity = Math.max(0, Number(airMaximumVerticalVelocity) || 0);
    this.airGravity = Math.max(0, Number(airGravity) || 0);
    this.launchConfig = launchConfig;
  }

  sampleIncreasingX(x) {
    const sample = this.profile.sample(x);
    const tangent = sample.tangent.clone();
    const normal = sample.normal.clone();

    if (tangent.x < 0) tangent.multiplyScalar(-1);
    if (normal.y < 0) normal.multiplyScalar(-1);

    return { ...sample, tangent, normal };
  }

  wallFraction(x) {
    const absoluteX = Math.abs(x);
    if (absoluteX <= this.profile.flatHalfWidth) return 0;
    return Math.max(0, Math.min(
      1,
      (absoluteX - this.profile.flatHalfWidth) / this.profile.transitionWidth,
    ));
  }

  computeLaunchVelocity(incomingSpeed) {
    const speed = Math.max(0, Math.abs(Number(incomingSpeed) || 0));
    if (speed < this.airLaunchMinimumSpeed) return 0;

    const normalized = clamp01(
      (speed - this.airLaunchMinimumSpeed)
      / Math.max(1e-4, this.launchConfig.speedForMaximumVelocity - this.airLaunchMinimumSpeed),
    );
    const curved = smoothstep01(normalized);
    return Math.min(
      this.airMaximumVerticalVelocity,
      this.launchConfig.visiblePopVelocity
        + (this.airMaximumVerticalVelocity - this.launchConfig.visiblePopVelocity) * curved,
    );
  }

  integrateAirStep({ y, verticalVelocity, dt }) {
    const safeDt = Math.max(0, Number(dt) || 0);
    const previousVerticalVelocity = Number(verticalVelocity) || 0;
    const nextVerticalVelocity = previousVerticalVelocity - this.airGravity * safeDt;
    return {
      previousVerticalVelocity,
      verticalVelocity: nextVerticalVelocity,
      y: (Number(y) || 0) + nextVerticalVelocity * safeDt,
      crossedApex: previousVerticalVelocity > 0 && nextVerticalVelocity <= 0,
    };
  }

  integrateSurfaceX({ x, tangentVelocity, tangentX, dt }) {
    const safeDt = Math.max(0, Number(dt) || 0);
    return (Number(x) || 0)
      + (Number(tangentVelocity) || 0) * (Number(tangentX) || 0) * safeDt;
  }
}
