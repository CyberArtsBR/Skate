import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { simulationToPresentationState } from '../src/halfpipe/HalfpipeSimulationPresentation.js';
import { createRiderPresentationState } from '../src/character/RiderPresentationState.js';
import { RiderRigAdapter } from '../src/character/RiderRigAdapter.js';
import { SkatePoseController } from '../src/character/SkatePoseController.js';
import { SkateAnimationController } from '../src/character/SkateAnimationController.js';
import { TrickPoseController } from '../src/character/TrickPoseController.js';
import { HandPlantIK } from '../src/character/HandPlantIK.js';
import { SKATE_ANIMATION_STATE } from '../src/character/SkateAnimationState.js';

const loaderSource = readFileSync(new URL('../src/character/ChimpionLoader.js', import.meta.url), 'utf8');
assert.doesNotMatch(
  loaderSource,
  /material\.(?:metalness|roughness|emissive|emissiveIntensity|color)\s*=/,
  'character loader must preserve authored PBR/material values',
);

const profile = new HalfpipeProfile();
const baseSimulation = {
  mode: 'contact',
  time: 2,
  pipeX: 0,
  tangentVelocity: 8,
  pumpIntent: 0,
  pumpWindowInfluence: 0,
  surfaceTrickActive: false,
  surfaceTrickType: null,
  trickType: null,
  trickProgress: 0,
  facingTurns: 0,
  lastTrickTurnDirection: 0,
  lastTrickSide: 0,
  airSide: 0,
  airY: null,
  airVerticalVelocity: 0,
  airTurnActive: false,
  airTurnDirection: 0,
};

function wallX(fraction) {
  return -(profile.flatHalfWidth + profile.transitionWidth * fraction);
}

const crouchFractions = [0.1, 0.45, 0.78, 0.96];
const crouches = crouchFractions.map((fraction) => simulationToPresentationState(profile, {
  ...baseSimulation,
  pipeX: wallX(fraction),
  tangentVelocity: -9,
}).preloadCompression);
for (let index = 1; index < crouches.length; index += 1) {
  assert.ok(
    crouches[index] > crouches[index - 1],
    `ramp crouch must progress continuously: ${JSON.stringify(crouches)}`,
  );
}
assert.ok(crouches[3] - crouches[0] > 0.25, 'coping preload should be visibly stronger than early transition');

const heavyLanding = simulationToPresentationState(profile, {
  ...baseSimulation,
  pipeX: wallX(0.25),
  tangentVelocity: 6,
  landingImpact: 0.9,
  landingQuality: 'HEAVY',
});
assert.equal(heavyLanding.landingQuality, 'heavy');
assert.equal(heavyLanding.animationState, SKATE_ANIMATION_STATE.HEAVY_LAND);

const animation = new SkateAnimationController();
const airborne = createRiderPresentationState({
  time: 1,
  airborne: true,
  verticalVelocity: -17,
  airHeight: 0.5,
  footIKWeight: 0.3,
  dropInProgress: 1,
  animationState: SKATE_ANIMATION_STATE.AIR,
});
const airAnimated = animation.update(airborne);
assert.ok(airAnimated.footIKWeight < 0.9, 'airborne foot IK should release');
const landed = animation.update(createRiderPresentationState({
  ...airborne,
  time: 1.016,
  airborne: false,
  verticalVelocity: 0,
  landing: 0,
  landingQuality: 'none',
}));
assert.ok(landed.landing > 0.3, 'baseline airborne->contact should create a defensive landing envelope');
assert.ok(['sketchy', 'heavy'].includes(landed.landingQuality));
assert.ok([
  SKATE_ANIMATION_STATE.LAND,
  SKATE_ANIMATION_STATE.HEAVY_LAND,
].includes(landed.animationState));

// A bail must immediately restore full deck contact even when airborne IK was
// previously released. The impact expression belongs in the body pose, not in
// a visually detached foot.
const bailAnimation = new SkateAnimationController();
const bailAir = bailAnimation.update(createRiderPresentationState({
  time: 2,
  airborne: true,
  verticalVelocity: -18,
  airHeight: 0.45,
  footIKWeight: 0.3,
  dropInProgress: 1,
  animationState: SKATE_ANIMATION_STATE.AIR,
}));
assert.ok(bailAir.footIKWeight < 0.9);
const bailContact = bailAnimation.update(createRiderPresentationState({
  ...bailAir,
  time: 2.016,
  airborne: false,
  verticalVelocity: 0,
  landing: 1,
  landingQuality: 'bail',
  wallSide: -1,
}));
assert.equal(
  bailContact.footIKWeight,
  1,
  'bail contact must snap both feet to full-strength deck IK',
);
assert.equal(bailContact.animationState, SKATE_ANIMATION_STATE.BAIL);

const trickPose = new TrickPoseController({ stance: 'regular', stanceHalfLength: 0.24 });
const kickMid = trickPose.evaluate({
  trickVisualActive: true,
  trickType: 'kick-turn',
  trickProgress: 0.5,
  turnDirection: 1,
});
assert.ok(Math.abs(kickMid.boardRoll) > 0.1, 'kick turn needs a visible rear-truck nose lift');
const kickSettled = trickPose.evaluate({
  trickVisualActive: true,
  trickType: 'kick-turn',
  trickProgress: 1,
  turnDirection: 1,
});
assert.ok(Math.abs(kickSettled.boardRoll) < 1e-8, 'kick-turn carrier must return to neutral');
assert.ok(Math.abs(kickSettled.boardYaw) < 1e-8, 'kick-turn board yaw must return to neutral');

const bailCarrier = trickPose.evaluate({
  landing: 1,
  landingQuality: 'bail',
  wallSide: -1,
  turnDirection: 1,
});
assert.ok(
  Math.abs(bailCarrier.boardYaw) <= 0.04,
  'bail deck yaw must stay small enough for both feet to remain reachable',
);
assert.ok(
  Math.abs(bailCarrier.boardRoll) <= 0.05,
  'bail deck wobble must remain restrained',
);
assert.ok(
  Math.abs(bailCarrier.bodyX) <= 0.015,
  'bail body carrier must not slide away from deck targets',
);
assert.ok(
  Math.abs(bailCarrier.bodyRoll) >= 0.05,
  'bail should still read visually through a restrained body reaction',
);

const poseController = new SkatePoseController();
const bailPose = poseController.evaluate(createRiderPresentationState({
  landing: 1,
  landingQuality: 'bail',
  wallSide: -1,
  facingYaw: 0,
  preloadCompression: 0.35,
  dropInProgress: 1,
}));
assert.ok(bailPose.kneeFlex > 0.75, 'bail should absorb impact through the knees');
assert.ok(
  Math.abs(bailPose.torsoBalanceZ) > 0.1,
  'bail should communicate instability through torso lean',
);
assert.ok(
  bailPose.leftArmBalance > 0.8 && bailPose.rightArmBalance > 0.8,
  'bail should use both arms for recovery instead of detaching a foot',
);
const fakiePose = poseController.evaluate(createRiderPresentationState({
  facingYaw: Math.PI,
  speedNormalized: 0.5,
  preloadCompression: 0.45,
  dropInProgress: 1,
}));
assert.equal(fakiePose.facingSign, -1, 'fakie presentation must remain supported');

const clampedHigh = createRiderPresentationState({ footIKWeight: 99 });
const clampedLow = createRiderPresentationState({ footIKWeight: -99 });
assert.equal(clampedHigh.footIKWeight, 1);
assert.equal(clampedLow.footIKWeight, 0);

function makeBone(name, parent, x = 0, y = 0, z = 0) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  parent.add(bone);
  return bone;
}

const rigModel = new THREE.Group();
const hips = makeBone('CC_Base_Hip', rigModel);
makeBone('CC_Base_L_Thigh', hips, 0.1, -0.2, 0);
makeBone('CC_Base_L_Calf', hips, 0.1, -0.6, 0);
makeBone('CC_Base_L_Foot', hips, 0.1, -1.0, 0);
makeBone('CC_Base_R_Thigh', hips, -0.1, -0.2, 0);
makeBone('CC_Base_R_Calf', hips, -0.1, -0.6, 0);
makeBone('CC_Base_R_Foot', hips, -0.1, -1.0, 0);
const rigAdapter = new RiderRigAdapter(rigModel);
assert.equal(rigAdapter.valid, true);
rigAdapter.applySkatePose({ compression: 0.66, torsoCounter: 0.18 });
const hipOnce = hips.quaternion.clone();
rigAdapter.applySkatePose({ compression: 0.66, torsoCounter: 0.18 });
assert.ok(hipOnce.angleTo(hips.quaternion) < 1e-9, 'repeated pose evaluation must not accumulate bone rotation drift');

const noArmIK = new HandPlantIK({ rigAdapter, riderRoot: rigModel });
const degraded = noArmIK.update({
  active: true,
  progress: 0.5,
  side: -1,
  copingWorldPoint: { x: -1, y: 1, z: 0 },
});
assert.equal(degraded.active, false);
assert.equal(degraded.degraded, true, 'rig without a hand chain must fail gracefully');

const armRoot = new THREE.Group();
const shoulder = makeBone('Shoulder', armRoot, 0, 1, 0);
const upperArm = makeBone('UpperArm', shoulder, 0.25, 0, 0);
const forearm = makeBone('Forearm', upperArm, 0.35, 0, 0);
const hand = makeBone('Hand', forearm, 0.3, 0, 0);
const armRig = {
  capabilities: { leftArm: true, rightArm: false },
  rig: {
    leftShoulder: shoulder,
    leftUpperArm: upperArm,
    leftForearm: forearm,
    leftHand: hand,
  },
};
const handIK = new HandPlantIK({ rigAdapter: armRig, riderRoot: armRoot });
const planted = handIK.update({
  active: true,
  progress: 0.5,
  side: -1,
  copingWorldPoint: { x: 0.45, y: 1.25, z: 0 },
  facingYaw: 0,
});
assert.equal(planted.active, true);
assert.equal(planted.side, 'left');
assert.ok(Number.isFinite(planted.error));
const released = handIK.update({ active: false });
assert.equal(released.active, false, 'hand plant IK must deactivate safely');

const airBase = {
  ...baseSimulation,
  mode: 'airborne',
  pipeX: profile.leftLip + 0.02,
  airSide: -1,
  airY: profile.sample(profile.leftLip).y + 1.5,
  airVerticalVelocity: 1,
  airTurnActive: true,
  trickType: 'aerial-turn',
  trickProgress: 0.5,
  facingTurns: 1,
};
const ccw = simulationToPresentationState(profile, { ...airBase, airTurnDirection: 1 });
const cw = simulationToPresentationState(profile, { ...airBase, airTurnDirection: -1 });
assert.ok(ccw.facingYaw > cw.facingYaw, 'aerial presentation must honor provided turn direction rather than forcing one visual spin');
assert.equal(ccw.trickProgress, 0.5, 'aerial presentation must follow gameplay trick progress');

console.log(JSON.stringify({
  materialsAuthored: true,
  continuousCrouch: crouches,
  landing: {
    explicit: heavyLanding.animationState,
    fallbackQuality: landed.landingQuality,
  },
  handPlantIK: {
    usableRigActive: planted.active,
    degradedWithoutArms: degraded.degraded,
  },
  kickTurnNeutral: {
    boardRoll: kickSettled.boardRoll,
    boardYaw: kickSettled.boardYaw,
  },
  bailRecovery: {
    footIKWeight: bailContact.footIKWeight,
    boardYaw: bailCarrier.boardYaw,
    boardRoll: bailCarrier.boardRoll,
    kneeFlex: bailPose.kneeFlex,
  },
  fakieFacingSign: fakiePose.facingSign,
  aerialDirection: {
    positive: ccw.facingYaw,
    negative: cw.facingYaw,
  },
}, null, 2));
