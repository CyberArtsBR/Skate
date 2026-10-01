import * as THREE from 'three';
import { collectSkaterImpactProbes, sampleHalfpipeClearance } from '../gameplay/SkaterImpactContacts.js';
import { HANDPLANT_CLEARANCE as TUNING } from '../gameplay/CrashPresentationTuning.js';

const CORRECTION_RESPONSE = 32;
const CONSTRAINT_PASSES = 8;
const CLEARANCE_EPSILON = 0.002;
const correction = new THREE.Vector3(), local = new THREE.Vector3(), origin = new THREE.Vector3();

function reachError(reach, offset) {
  if (!reach) return 0;
  const distance = reach.shoulder.clone().add(offset).distanceTo(reach.target);
  return Math.max(0, distance - reach.maximum, reach.minimum - distance);
}

function projectReach(offset, reach) {
  if (!reach || reach.weight < 0.001) return 0;
  const shoulder = reach.shoulder.clone().add(offset);
  const direction = shoulder.sub(reach.target);
  const distance = direction.length();
  if (distance < 1e-7) return 0;
  const initialDistance = reach.shoulder.distanceTo(reach.target);
  // Blend the constraint boundary once. Multiplying every projection by the
  // stage weight would compound it across passes and pop into a full hold.
  const maximum = Math.max(reach.maximum, THREE.MathUtils.lerp(initialDistance, reach.maximum, reach.weight));
  const minimum = Math.min(reach.minimum, THREE.MathUtils.lerp(initialDistance, reach.minimum, reach.weight));
  const validDistance = THREE.MathUtils.clamp(distance, minimum, maximum);
  offset.addScaledVector(direction, (validDistance - distance) / distance);
  return Math.abs(validDistance - distance);
}

function plantedArmProbe(probe, side) {
  // These probes still describe the pre-IK balancing pose. The planted arm
  // is subsequently solved inside the open pipe with its original lengths.
  // Its wrist may touch the coping; it must not push the supporting assembly
  // away from that deliberate contact.
  return side && [side + 'Hand', side + 'Forearm', side + '-forearm-mid', side + '-upperarm-mid'].includes(probe.id);
}

function projectClearance(offset, probes, rider, state, reach, hold) {
  let deepest = CLEARANCE_EPSILON;
  const displacement = new THREE.Vector3();
  let minimum = Infinity;
  const side = Math.sign(state.wallSide) || 1;
  for (const probe of probes) {
    if (plantedArmProbe(probe, reach?.side)) continue;
    const position = new THREE.Vector3(probe.position.x, probe.position.y, probe.position.z).add(offset);
    const surface = sampleHalfpipeClearance(rider.rampProfile, position, probe.radius);
    minimum = Math.min(minimum, surface.clearance);
    const depth = TUNING.surfaceMargin - surface.clearance;
    if (depth > deepest && Number.isFinite(depth)) {
      deepest = depth;
      displacement.set(surface.normal.x, surface.normal.y, surface.normal.z).multiplyScalar(depth);
    }
    if (probe.type !== 'HEAD' || hold < 0.001) continue;
    // The cartoon head must clear the lip either above or into the open
    // interior. Choose the feasible escape that keeps the supporting arm
    // within reach; forcing only an upward lift can leave the wrist floating.
    const margin = TUNING.headCopingMargin * hold;
    const missingHeight = state.copingWorldPoint.y + probe.radius + margin - position.y;
    const missingInward = side * position.x - (side * state.copingWorldPoint.x - probe.radius - margin);
    if (missingHeight > 0 && missingInward > 0) {
      const above = new THREE.Vector3(0, missingHeight, 0);
      const inside = new THREE.Vector3(-side * missingInward, 0, 0);
      const aboveCost = above.length() + reachError(reach, offset.clone().add(above)) * 4;
      const insideCost = inside.length() + reachError(reach, offset.clone().add(inside)) * 4;
      const escape = aboveCost < insideCost ? above : inside;
      if (escape.length() > deepest) {
        deepest = escape.length();
        displacement.copy(escape);
      }
    }
  }
  // Apply the deepest constraint, rather than summing dozens of identical
  // shoe/wheel normals into an excessive jump. Later passes resolve others.
  offset.add(displacement);
  offset.clampLength(0, TUNING.maxCorrection);
  return { minimum, depth: deepest };
}

/** Solve shared visual placement against both contact and arm reach.
 * Authoritative root/contact physics and the board/feet relationship stay
 * intact: only the common presentation carrier receives the displacement.
 */
export function correctHandPlantClearance(rider, state) {
  if (!rider.rampProfile || !state.copingWorldPoint) return null;
  const t = THREE.MathUtils.clamp(state.trickProgress, 0, 1);
  const old = rider._handPlantClearanceState;
  const isNewPlant = !old || t < old.progress || state.time < old.time;
  // RiderController chooses the nearest arm in the incoming riding pose.
  // Never reselect here after the carrier has already become inverted.
  rider.root.updateMatrixWorld(true);
  const reach = rider.handPlantIK?.getReachConstraint({ copingWorldPoint: state.copingWorldPoint,
    side: state.wallSide, progress: t });
  const hold = reach?.weight ?? (THREE.MathUtils.smoothstep(t / TUNING.enterEnd, 0, 1)
    * (1 - THREE.MathUtils.smoothstep((t - TUNING.releaseStart) / (1 - TUNING.releaseStart), 0, 1)));
  const probes = collectSkaterImpactProbes(rider);
  const desired = new THREE.Vector3();
  for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
    const reachMovement = projectReach(desired, reach);
    const clearance = projectClearance(desired, probes, rider, state, reach, hold);
    if (reachMovement < CLEARANCE_EPSILON && clearance.depth <= CLEARANCE_EPSILON) break;
  }
  const dt = old && !isNewPlant ? THREE.MathUtils.clamp(state.time - old.time, 0, 0.05) : 0;
  correction.copy(isNewPlant ? desired : old.offset);
  correction.lerp(desired, dt > 0 ? 1 - Math.exp(-CORRECTION_RESPONSE * dt) : 1);
  // Short blends soften optional margin changes. Actual clearance wins over
  // smoothing, and at the planted hold the reachable wrist remains anchored.
  for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
    const reachMovement = projectReach(correction, reach);
    const clearance = projectClearance(correction, probes, rider, state, reach, hold);
    if (reachMovement < CLEARANCE_EPSILON && clearance.depth <= CLEARANCE_EPSILON) break;
  }
  rider.trickCarrier.parent.getWorldPosition(origin);
  local.copy(origin).add(correction);
  rider.trickCarrier.parent.worldToLocal(local);
  rider.trickCarrier.position.add(local);
  rider.root.updateMatrixWorld(true);
  let minimumClearance = Infinity;
  for (const probe of probes) {
    if (plantedArmProbe(probe, reach?.side)) continue;
    const position = new THREE.Vector3(probe.position.x, probe.position.y, probe.position.z).add(correction);
    minimumClearance = Math.min(minimumClearance, sampleHalfpipeClearance(rider.rampProfile, position, probe.radius).clearance);
  }
  rider._handPlantClearanceState = { progress: t, time: state.time, offset: correction.clone() };
  const error = reachError(reach, correction);
  return { hold, stage: t < TUNING.enterEnd ? 'enter' : t < TUNING.releaseStart ? 'hold' : 'release',
    correction: correction.toArray(), minimumClearance, selectedPlantHand: reach?.side ?? null,
    reachError: error, degraded: error > 0.035 || minimumClearance < -CLEARANCE_EPSILON };
}
