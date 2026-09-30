import * as THREE from 'three';

export const SKATER_IMPACT_TUNING = Object.freeze({
  headCrashMinImpactSpeed: 3.2,
  contactSlop: 0.012,
  minimumClosingSpeed: 0.06,
  simultaneousContactSeconds: 0.006,
  copingRadius: 0.07,
  topDeckWidth: 1.8,
  halfDepth: 4.15,
  headRadiusFallback: 0.34,
  torsoRadius: 0.24,
  hipsRadius: 0.20,
  legRadius: 0.10,
  shinRadius: 0.08,
  upperArmRadius: 0.085,
  forearmRadius: 0.075,
  handRadius: 0.06,
  footRadius: 0.018,
  footRadiusFallback: 0.07,
  boardRadius: 0.012,
  sweepStepLimit: 64,
  sweepRefinements: 9,
});

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const validPoint = (point) => point && [point.x, point.y, point.z ?? 0].every(Number.isFinite);
const vector = (point) => ({ x: point.x, y: point.y, z: point.z ?? 0 });
const pointAt = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

function surfaceCandidate(x, y, px, py, nx, ny, region, endpointAbove = false) {
  const dx = x - px, dy = y - py;
  const distance = Math.hypot(dx, dy);
  const sign = endpointAbove || dx * nx + dy * ny >= 0 ? 1 : -1;
  const normal = endpointAbove && distance > 1e-8
    ? { x: dx / distance, y: dy / distance, z: 0 } : { x: nx, y: ny, z: 0 };
  return { distance: distance * sign, point: { x: px, y: py, z: 0 }, normal, region };
}

function transitionCandidate(profile, x, y, side) {
  const width = profile.transitionWidth;
  const height = profile.transitionHeight;
  const localX = side * x - profile.flatHalfWidth;
  // The shipped pipe is an elliptical quarter transition (its width and
  // height differ). Find a point on that exact arc instead of approximating
  // collision with world-Y height or an unrelated circular radius.
  let theta = clamp(Math.atan2(localX / width, (height - y) / height), 0, Math.PI / 2);
  for (let iteration = 0; iteration < 7; iteration++) {
    const s = Math.sin(theta), c = Math.cos(theta);
    const dx = width * s - localX, dy = height - height * c - y;
    const derivative = dx * width * c + dy * height * s;
    const second = width * width * c * c + height * height * s * s
      - dx * width * s + dy * height * c;
    if (Math.abs(second) < 1e-8) break;
    const next = clamp(theta - clamp(derivative / second, -0.35, 0.35), 0, Math.PI / 2);
    if (Math.abs(next - theta) < 1e-6) break;
    theta = next;
  }
  let best = null;
  for (const angle of [0, theta, Math.PI / 2]) {
    const s = Math.sin(angle), c = Math.cos(angle);
    const px = side * (profile.flatHalfWidth + width * s), py = height - height * c;
    const length = Math.hypot(s / width, c / height);
    const candidate = surfaceCandidate(x, y, px, py, -side * s / width / length,
      c / height / length, side < 0 ? 'left-transition' : 'right-transition',
      angle >= Math.PI / 2 - 1e-7 && y > height);
    if (!best || Math.abs(candidate.distance) < Math.abs(best.distance)) best = candidate;
  }
  return best;
}

/** Signed sphere clearance in the same ramp space used by the simulation.
 * Positive is open air; negative is overlap. Coping and deck are actual
 * contact surfaces, and the pipe has finite depth rather than infinite walls.
 */
export function sampleHalfpipeClearance(profile, point, radius = 0, options = {}) {
  const tuning = { ...SKATER_IMPACT_TUNING, ...options };
  const sphereRadius = Math.max(0, Number(radius) || 0);
  if (!profile || !validPoint(point)) return { clearance: Infinity, distance: Infinity, normal: { x: 0, y: 1, z: 0 }, point: vector(point || { x: 0, y: 0 }), region: 'outside' };
  const { x, y } = point;
  const z = point.z ?? 0;
  const edgeDistance = Math.max(0, Math.abs(z) - tuning.halfDepth);
  if (edgeDistance > sphereRadius + tuning.contactSlop) return { clearance: Infinity, distance: Infinity, normal: { x: 0, y: 1, z: 0 }, point: vector(point), region: 'outside-depth' };
  const candidates = [surfaceCandidate(x, y, clamp(x, -profile.flatHalfWidth, profile.flatHalfWidth), 0, 0, 1, 'flat-bottom')];
  for (const side of [-1, 1]) {
    candidates.push(transitionCandidate(profile, x, y, side));
    const lip = side * (profile.flatHalfWidth + profile.transitionWidth);
    const deckX = side * clamp(side * x, Math.abs(lip), Math.abs(lip) + tuning.topDeckWidth);
    // The deck is finite. Its inner edge must not extend an invisible
    // downward half-space across the open interior of the pipe.
    candidates.push(surfaceCandidate(x, y, deckX, profile.transitionHeight, 0, 1,
      side < 0 ? 'left-deck' : 'right-deck', Math.abs(deckX - x) > 1e-7));
    const dx = x - lip, dy = y - profile.transitionHeight;
    const distance = Math.hypot(dx, dy);
    const nx = distance > 1e-8 ? dx / distance : -side;
    const ny = distance > 1e-8 ? dy / distance : 0;
    candidates.push({ distance: distance - tuning.copingRadius,
      point: { x: lip + nx * tuning.copingRadius, y: profile.transitionHeight + ny * tuning.copingRadius, z: 0 },
      normal: { x: nx, y: ny, z: 0 }, region: side < 0 ? 'left-coping' : 'right-coping' });
  }
  let closest = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(candidate.distance) < Math.abs(closest.distance)) closest = candidate;
  }
  closest.point.z = clamp(z, -tuning.halfDepth, tuning.halfDepth);
  if (edgeDistance > 0) {
    const planarDistance = Math.abs(closest.distance);
    const distance = Math.hypot(planarDistance, edgeDistance);
    closest.distance = distance;
    closest.normal = { x: closest.normal.x * planarDistance / Math.max(distance, 1e-8),
      y: closest.normal.y * planarDistance / Math.max(distance, 1e-8),
      z: Math.sign(z) * edgeDistance / Math.max(distance, 1e-8) };
  }
  return { ...closest, clearance: closest.distance - sphereRadius };
}

const headCalibrations = new WeakMap();
const scratch = new THREE.Vector3();

function isHeadBone(bone, head) {
  for (let node = bone; node; node = node.parent) if (node === head) return true;
  return false;
}

function calibratedHead(rider, tuning) {
  const root = rider.chimpion.root;
  if (headCalibrations.has(root)) return headCalibrations.get(root);
  const head = rider.chimpion.rigAdapter.rig.head;
  const calibration = { offset: new THREE.Vector3(), radius: tuning.headRadiusFallback };
  if (head) {
    const bounds = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
      if (!position || !skinIndex || !skinWeight) return;
      const indices = new Set(mesh.skeleton.bones.flatMap((bone, index) => isHeadBone(bone, head) ? [index] : []));
      if (!indices.size) return;
      mesh.skeleton.update();
      for (let index = 0; index < position.count; index++) {
        let weight = 0;
        for (let component = 0; component < 4; component++) {
          if (indices.has(skinIndex.getComponent(index, component))) weight += skinWeight.getComponent(index, component);
        }
        if (weight < 0.6) continue;
        mesh.getVertexPosition(index, scratch);
        scratch.applyMatrix4(mesh.matrixWorld);
        head.worldToLocal(scratch);
        bounds.expandByPoint(scratch);
      }
    });
    if (!bounds.isEmpty()) {
      bounds.getCenter(calibration.offset);
      const size = bounds.getSize(new THREE.Vector3());
      const worldScale = head.getWorldScale(new THREE.Vector3());
      // Cartoon heads are broad. Measuring their skinned geometry avoids
      // placing the collider at the neck pivot or using human proportions.
      calibration.radius = clamp(Math.max(Math.abs(size.x * worldScale.x),
        Math.abs(size.y * worldScale.y), Math.abs(size.z * worldScale.z)) * 0.46, 0.18, 0.65);
    }
  }
  headCalibrations.set(root, calibration);
  return calibration;
}

/** Read posed bones and existing measured wheel/sole points. Never moves rig. */
export function collectSkaterImpactProbes(rider, { worldToProfile = null, tuning: options = {} } = {}) {
  if (!rider?.chimpion?.rigAdapter?.rig || !rider.skateboard?.root) return [];
  const tuning = { ...SKATER_IMPACT_TUNING, ...options };
  const rig = rider.chimpion.rigAdapter.rig;
  const probes = [];
  rider.root.updateMatrixWorld(true);
  const add = (id, type, worldPoint, radius) => {
    const position = worldToProfile ? worldToProfile(worldPoint.clone()) : worldPoint;
    if (validPoint(position)) probes.push({ id, type, position: vector(position), radius });
  };
  if (rig.head) {
    const head = calibratedHead(rider, tuning);
    add('head', 'HEAD', rig.head.localToWorld(head.offset.clone()), head.radius);
  }
  for (const [slot, radius] of [['chest', tuning.torsoRadius], ['spine', tuning.torsoRadius],
    ['hips', tuning.hipsRadius], ['leftThigh', tuning.legRadius], ['rightThigh', tuning.legRadius],
    ['leftShin', tuning.legRadius], ['rightShin', tuning.legRadius],
    ['leftForearm', tuning.forearmRadius], ['rightForearm', tuning.forearmRadius],
    ['leftHand', tuning.handRadius], ['rightHand', tuning.handRadius]]) {
    if (rig[slot]) add(slot, 'BODY', rig[slot].getWorldPosition(new THREE.Vector3()), radius);
  }
  for (const side of ['left', 'right']) {
    for (const [start, end, radius] of [['Thigh', 'Shin', tuning.legRadius],
      ['Shin', 'Foot', tuning.shinRadius], ['UpperArm', 'Forearm', tuning.upperArmRadius],
      ['Forearm', 'Hand', tuning.forearmRadius]]) {
      const a = rig[`${side}${start}`], b = rig[`${side}${end}`];
      if (a && b) add(`${side}-${start.toLowerCase()}-mid`, 'BODY',
        a.getWorldPosition(new THREE.Vector3()).lerp(b.getWorldPosition(new THREE.Vector3()), 0.5), radius);
    }
    const sole = rider.footIK?.soleProbes?.[side] || [];
    if (sole.length) {
      // Reuse the sparse shoe probes already calibrated by foot IK.
      for (let index = 0; index < sole.length; index++) {
        const entry = sole[index];
        entry.mesh.getVertexPosition(entry.index, scratch);
        scratch.applyMatrix4(entry.mesh.matrixWorld);
        add(`${side}-sole-${index}`, 'FOOT', scratch.clone(), tuning.footRadius);
      }
    } else if (rig[`${side}Foot`]) {
      add(`${side}-foot`, 'FOOT', rig[`${side}Foot`].getWorldPosition(new THREE.Vector3()), tuning.footRadiusFallback);
    }
  }
  for (const support of rider.skateboard.surfaceSupportPoints || []) {
    add(support.name, 'BOARD', rider.skateboard.root.localToWorld(support.position.clone()), tuning.boardRadius);
  }
  return probes;
}

function snapshots(probes) {
  return new Map((probes || []).filter((probe) => validPoint(probe.position)).map((probe) => [probe.id,
    { ...probe, position: vector(probe.position), radius: Math.max(0, Number(probe.radius) || 0) }]));
}

export class SkaterImpactContacts {
  constructor({ profile, tuning = {} }) {
    this.profile = profile;
    this.tuning = { ...SKATER_IMPACT_TUNING, ...tuning };
    this.reset();
  }

  reset() {
    this.active = false;
    this.episodeId = null;
    this.firstImpact = null;
    this.previous = new Map();
    this.previousTime = null;
    this.probes = [];
    this.contacts = [];
  }

  begin({ probes = [], time = 0, episodeId = null } = {}) {
    this.reset();
    this.active = true;
    this.episodeId = episodeId;
    this.previous = snapshots(probes);
    this.previousTime = time;
    this.probes = probes;
    return this;
  }

  end() { this.active = false; }

  _sweep(previous, current, dt, velocity) {
    const tuning = this.tuning;
    const delta = { x: current.position.x - previous.position.x,
      y: current.position.y - previous.position.y, z: current.position.z - previous.position.z };
    const travel = Math.hypot(delta.x, delta.y, delta.z);
    const steps = clamp(Math.ceil(travel / Math.max(0.025, current.radius * 0.4)), 2, tuning.sweepStepLimit);
    let previousT = 0;
    let previousSample = sampleHalfpipeClearance(this.profile, previous.position, previous.radius, tuning);
    // An episode can begin on the first airborne frame. Contacts already
    // present are only meaningful when their proxy is actually moving inward.
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const position = pointAt(previous.position, current.position, t);
      let surface = step ? sampleHalfpipeClearance(this.profile, position, current.radius, tuning) : previousSample;
      const crossed = surface.clearance <= tuning.contactSlop;
      if (crossed) {
        let lo = previousT, hi = t;
        if (step && previousSample.clearance > tuning.contactSlop) {
          for (let refine = 0; refine < tuning.sweepRefinements; refine++) {
            const mid = (lo + hi) * 0.5;
            const hit = sampleHalfpipeClearance(this.profile, pointAt(previous.position, current.position, mid), current.radius, tuning);
            if (hit.clearance <= tuning.contactSlop) hi = mid; else lo = mid;
          }
        }
        const fraction = hi;
        surface = sampleHalfpipeClearance(this.profile, pointAt(previous.position, current.position, fraction), current.radius, tuning);
        const normal = surface.normal;
        const measured = dt > 1e-6 ? { x: delta.x / dt, y: delta.y / dt, z: delta.z / dt } : velocity || { x: 0, y: 0, z: 0 };
        const incomingSpeed = Math.max(0, -(measured.x * normal.x + measured.y * normal.y + (measured.z || 0) * normal.z));
        if (incomingSpeed >= tuning.minimumClosingSpeed) return {
          type: current.type, probeId: current.id, fraction, incomingSpeed,
          position: pointAt(previous.position, current.position, fraction),
          contactPoint: surface.point, normal, region: surface.region, clearance: surface.clearance,
        };
      }
      previousT = t;
      previousSample = surface;
    }
    return null;
  }

  sample({ probes = [], time = null, dt = null, velocity = null } = {}) {
    const current = snapshots(probes);
    const duration = Math.max(0, Number.isFinite(dt) ? dt : Number.isFinite(time) && Number.isFinite(this.previousTime) ? time - this.previousTime : 0);
    this.contacts = [];
    let severeHeadImpact = null;
    if (this.active && !this.firstImpact && duration > 1e-6) {
      for (const [id, probe] of current) {
        const previous = this.previous.get(id);
        if (!previous) continue;
        const hit = this._sweep(previous, probe, duration, velocity);
        if (hit) this.contacts.push(hit);
      }
      this.contacts.sort((a, b) => a.fraction - b.fraction);
      if (this.contacts.length) {
        const earliest = this.contacts[0];
        // Contact order is swept time of impact. Head loses a near-simultaneous
        // tie to a board/foot/body hit; later head contact cannot overwrite it.
        const simultaneous = this.contacts.filter((hit) => (hit.fraction - earliest.fraction) * duration <= this.tuning.simultaneousContactSeconds);
        const winner = simultaneous.find((hit) => hit.type !== 'HEAD') || earliest;
        this.firstImpact = { ...winner, time: (Number.isFinite(this.previousTime) ? this.previousTime : 0) + winner.fraction * duration,
          episodeId: this.episodeId,
          severe: winner.type === 'HEAD' && winner.incomingSpeed >= this.tuning.headCrashMinImpactSpeed };
        // Even a light head touch locks the episode as a minor first contact.
        if (this.firstImpact.severe) severeHeadImpact = this.firstImpact;
      }
    }
    this.previous = current;
    this.previousTime = Number.isFinite(time) ? time : (this.previousTime ?? 0) + duration;
    this.probes = probes;
    return { active: this.active, episodeId: this.episodeId, firstImpact: this.firstImpact,
      severeHeadImpact, contacts: this.contacts };
  }

  getDiagnostics() {
    return { active: this.active, episodeId: this.episodeId, firstImpact: this.firstImpact,
      probes: this.probes, contacts: this.contacts };
  }
}
