import * as THREE from 'three';

const REQUIRED_SLOTS = Object.freeze([
  'hips',
  'leftThigh',
  'rightThigh',
  'leftShin',
  'rightShin',
  'leftFoot',
  'rightFoot',
]);

const SLOT_ALIASES = Object.freeze({
  hips: ['ccbasehip', 'hips', 'pelvis'],
  spine: ['ccbasespine01', 'spine01', 'spine1', 'spine'],
  chest: ['ccbasespine02', 'spine02', 'spine2', 'chest', 'upperchest'],
  neck: ['ccbasenecktwist01', 'necktwist01', 'neck'],
  head: ['ccbasehead', 'head'],
  leftShoulder: ['ccbaselclavicle', 'leftclavicle', 'leftshoulder'],
  leftUpperArm: ['ccbaselupperarm', 'leftupperarm', 'leftarm'],
  leftForearm: ['ccbaselforearm', 'leftforearm', 'leftlowerarm'],
  leftHand: ['ccbaselhand', 'lefthand'],
  rightShoulder: ['ccbaserclavicle', 'rightclavicle', 'rightshoulder'],
  rightUpperArm: ['ccbaserupperarm', 'rightupperarm', 'rightarm'],
  rightForearm: ['ccbaserforearm', 'rightforearm', 'rightlowerarm'],
  rightHand: ['ccbaserhand', 'righthand'],
  leftThigh: ['ccbaselthigh', 'leftthigh', 'leftupleg'],
  leftShin: ['ccbaselcalf', 'leftcalf', 'leftshin', 'leftleg'],
  leftFoot: ['ccbaselfoot', 'leftfoot'],
  rightThigh: ['ccbaserthigh', 'rightthigh', 'rightupleg'],
  rightShin: ['ccbasercalf', 'rightcalf', 'rightshin', 'rightleg'],
  rightFoot: ['ccbaserfoot', 'rightfoot'],
});

function normalizeName(name = '') {
  return name.toLowerCase().replace(/mixamorig\d*/g, '').replace(/[^a-z0-9]/g, '');
}

function findBone(bones, aliases) {
  const exact = bones.find((bone) => aliases.includes(normalizeName(bone.name)));
  if (exact) return exact;
  return bones.find((bone) => {
    const name = normalizeName(bone.name);
    return !/twist|share|toe|finger|eye|breast/.test(name)
      && aliases.some((alias) => name.endsWith(alias));
  }) || null;
}

export class RiderRigAdapter {
  constructor(model) {
    this.model = model;
    this.bones = [];
    model.traverse((object) => {
      if (object.isBone) this.bones.push(object);
    });

    this.rig = {};
    for (const [slot, aliases] of Object.entries(SLOT_ALIASES)) {
      this.rig[slot] = findBone(this.bones, aliases);
    }
    this.missingRequired = REQUIRED_SLOTS.filter((slot) => !this.rig[slot]);
    this.restPose = new Map(
      this.bones.map((bone) => [bone, bone.quaternion.clone()]),
    );
  }

  get valid() {
    return this.missingRequired.length === 0;
  }

  get capabilities() {
    const has = (slot) => Boolean(this.rig[slot]);
    return {
      gameplayFoundation: this.valid,
      torso: ['hips', 'spine', 'chest'].every(has),
      gaze: ['neck', 'head'].every(has),
      leftArm: ['leftUpperArm', 'leftForearm', 'leftHand'].every(has),
      rightArm: ['rightUpperArm', 'rightForearm', 'rightHand'].every(has),
      leftLeg: ['leftThigh', 'leftShin', 'leftFoot'].every(has),
      rightLeg: ['rightThigh', 'rightShin', 'rightFoot'].every(has),
    };
  }

  resetPose() {
    for (const [bone, quaternion] of this.restPose) bone.quaternion.copy(quaternion);
  }

  applySkatePose({
    stance = 'regular',
    facingSign = 1,
    compression = 0.45,
    hipFlex = 0.14,
    kneeFlex = 0.56,
    ankleFlex = -0.12,
    torsoCounter = 0.12,
    torsoBalanceZ = 0,
    headBalanceZ = 0,
    headLook = 0.42,
    armBalance = 0.62,
    leftArmBalance = armBalance,
    rightArmBalance = armBalance,
    forearmDrop = 0.11,
    leftForearmDrop = forearmDrop,
    rightForearmDrop = forearmDrop,
    armLag = 0,
    torsoSettle = 0,
  } = {}) {
    // Every frame starts from authored rest pose. Procedural animation and IK
    // therefore cannot accumulate quaternion drift over time.
    this.resetPose();
    const rotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const apply = (slot, x = 0, y = 0, z = 0) => {
      const bone = this.rig[slot];
      if (!bone) return;
      rotation.setFromEuler(euler.set(x, y, z, 'XYZ'));
      bone.quaternion.multiply(rotation);
    };

    const stanceDirection = stance === 'goofy' ? -1 : 1;
    const facingDirection = facingSign < 0 ? -1 : 1;
    const motionDirection = stanceDirection * facingDirection;
    apply('hips', -hipFlex, 0, torsoSettle * 0.18);
    apply(
      'spine',
      -0.055 * compression + torsoSettle * 0.28,
      -torsoCounter * 0.35 * motionDirection,
      torsoBalanceZ * 0.36,
    );
    apply(
      'chest',
      -0.025 * compression + torsoSettle * 0.42,
      -torsoCounter * 0.65 * motionDirection,
      torsoBalanceZ * 0.64,
    );
    apply('neck', 0, headLook * 0.24 * motionDirection, headBalanceZ * 0.22);
    apply('head', 0, headLook * 0.34 * motionDirection, headBalanceZ * 0.42);

    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? -1 : 1;
      const footRoleSign = side === 'left' ? stanceDirection : -stanceDirection;
      const sideArmBalance = side === 'left' ? leftArmBalance : rightArmBalance;
      const sideForearmDrop = side === 'left' ? leftForearmDrop : rightForearmDrop;

      // Do not mirror local leg/foot axes for fakie. The presentation carrier
      // already owns the 180 yaw and IK remains final authority for deck contact.
      apply(`${side}Thigh`, -0.28 - compression * 0.12, sign * 0.035, footRoleSign * 0.09);
      apply(`${side}Shin`, kneeFlex, 0, 0);
      apply(`${side}Foot`, ankleFlex, sign * 0.025, -footRoleSign * 0.025);

      // Arm lag is deliberately small: it creates follow-through without
      // normal skating ever reading as ragdoll motion.
      apply(
        `${side}UpperArm`,
        -0.12,
        -torsoCounter * 0.18 * facingDirection + armLag * sign,
        sign * sideArmBalance,
      );
      apply(`${side}Forearm`, -0.16 - sideForearmDrop, 0, sign * 0.11);
    }

    this.model.updateWorldMatrix(true, true);
  }

  applyFoundationPose(options = {}) {
    const crouch = options.crouch ?? 0.55;
    this.applySkatePose({
      compression: crouch,
      torsoCounter: options.torsoTurn ?? 0.08,
    });
  }
}
