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

// The Heretic is the shipped reference rider whose motion established the
// Halfpipe pose language. Other Chimpions share semantic bones but several
// were authored in different rest-axis conventions (including ~180° torso
// differences and ~90° arm differences). These model-space rest quaternions
// let us retarget local procedural rotations without changing any bind pose.
export const HERETIC_REFERENCE_MODEL_ROTATIONS = Object.freeze({
  hips: Object.freeze([-0.002588670326121751, 0.00013335733742646174, -0.003789180289061136, 0.99998946150172]),
  spine: Object.freeze([0.003413681513862717, 0.00011585736796810477, -0.0037841563713772535, 0.9999870066736614]),
  chest: Object.freeze([-0.04397841150807415, -0.00022672496893610158, -0.003778439230188941, 0.9990253106473248]),
  neck: Object.freeze([0.009421437639548218, 0.0002835040137394216, -0.0020024815469451406, 0.9999535720251872]),
  head: Object.freeze([-0.10821954772551068, 0.0005418028703247358, -0.001989118376876274, 0.9941248811632462]),
  leftShoulder: Object.freeze([-0.038948953323434024, 0.02784407403482561, -0.7400134316115107, 0.6708858377453965]),
  rightShoulder: Object.freeze([0.011293393616491206, 0.023919355164212782, 0.7318408196239086, 0.6809620681991418]),
  leftThigh: Object.freeze([0.00013338819732148385, -0.006494617650529858, 0.9998450676230435, 0.0163597952021928]),
  leftShin: Object.freeze([-0.0016690780265521162, 0.003320448876327313, 0.999710080704994, -0.023789563196032815]),
  leftFoot: Object.freeze([0.0851904698482585, 0.6176882557346906, 0.7774919323858592, -0.08191800403959795]),
  rightThigh: Object.freeze([0.000517196656690368, -0.019931572715215243, 0.999714516294154, 0.01316627614273587]),
  rightShin: Object.freeze([-0.0015113544534358753, -0.07466265062401048, 0.9969652825107169, -0.02198703769152187]),
  rightFoot: Object.freeze([-0.0036775147051843443, 0.6496478226007814, 0.7600935918060909, -0.014209599925972408]),
  leftUpperArm: Object.freeze([0.09090873107163877, -0.07823069043861999, -0.7243633465700209, 0.6789059575234025]),
  leftForearm: Object.freeze([0.05833349455496112, -0.05284561802155425, -0.7266530341929847, 0.6824807034456171]),
  rightUpperArm: Object.freeze([0.05686434637999258, 0.05224480208535381, 0.7136047451633424, 0.696279538096818]),
  rightForearm: Object.freeze([0.056681921007333436, 0.0535537059129087, 0.7270552776802951, 0.6821361919244147]),
});

export const SLOT_ALIASES = Object.freeze({
  hips: ['ccbasehip', 'hips', 'hip', 'pelvis'],
  spine: ['ccbasespine01', 'spine01', 'spine1', 'spine'],
  chest: ['ccbasespine02', 'spine02', 'spine2', 'chest', 'upperchest'],
  neck: ['ccbasenecktwist01', 'necktwist01', 'neck', 'neck01', 'neck1'],
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

const SEMANTIC_ALIASES = Object.freeze({
  hips: ['hips', 'hip', 'pelvis'],
  spine: ['spine', 'spine0', 'spine1', 'spine01'],
  chest: ['chest', 'upperchest', 'spine2', 'spine02', 'spine3'],
  neck: ['neck', 'neck01', 'neck1', 'necktwist01'],
  head: ['head'],
  Shoulder: ['shoulder', 'clavicle', 'collar'],
  UpperArm: ['upperarm', 'arm', 'uparm'],
  Forearm: ['forearm', 'lowerarm', 'elbow'],
  Hand: ['hand', 'wrist'],
  Thigh: ['thigh', 'upleg', 'upperleg'],
  Shin: ['shin', 'calf', 'leg', 'lowerleg', 'knee'],
  Foot: ['foot', 'ankle'],
});

function nameParts(name = '') {
  let source = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/mixamorig\d*[:_ ]*/g, '')
    .replace(/cc[_ ]*base[_ ]*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const words = source.split(/\s+/).filter(Boolean);
  let side = words.includes('left') || words.includes('l')
    ? 'left'
    : words.includes('right') || words.includes('r')
      ? 'right'
      : '';
  let core = words
    .filter((word) => ![
      'left', 'right', 'l', 'r', 'bone', 'def', 'bip', 'bip001',
    ].includes(word))
    .join('');

  if (!side && /^(left|right)/.test(core)) {
    side = core.startsWith('left') ? 'left' : 'right';
    core = core.slice(side.length);
  }

  if (!side && /(left|right)$/.test(core)) {
    side = core.endsWith('left') ? 'left' : 'right';
    core = core.slice(0, -side.length);
  }

  return { side, core };
}

function isDescendant(child, ancestor) {
  for (let parent = child?.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
}

function semanticSlot(slot = '') {
  if (slot.startsWith('left')) {
    return { side: 'left', kind: slot.slice(4) };
  }
  if (slot.startsWith('right')) {
    return { side: 'right', kind: slot.slice(5) };
  }
  return { side: '', kind: slot };
}

function findSemanticBone(bones, slot) {
  const { side, kind } = semanticSlot(slot);
  const aliases = SEMANTIC_ALIASES[kind] || [];
  if (!aliases.length) return null;

  let matches = bones.filter((bone) => {
    const parts = nameParts(bone.name);
    return parts.side === side && aliases.includes(parts.core);
  });

  if (matches.length > 1 && slot === 'hips') {
    const hierarchical = matches.filter((candidate) => (
      matches.every((other) => other === candidate || isDescendant(other, candidate))
    ));
    if (hierarchical.length === 1) matches = hierarchical;
  }

  if (matches.length > 1 && (slot === 'spine' || slot === 'chest')) {
    const hierarchical = matches.filter((candidate) => (
      matches.every((other) => (
        other === candidate
        || (slot === 'spine'
          ? isDescendant(other, candidate)
          : isDescendant(candidate, other))
      ))
    ));
    if (hierarchical.length === 1) matches = hierarchical;
  }

  return matches.length === 1 ? matches[0] : null;
}

function normalizeName(name = '') {
  return name.toLowerCase().replace(/mixamorig\d*/g, '').replace(/[^a-z0-9]/g, '');
}

function findBone(bones, aliases, slot = '') {
  // Alias order is semantic priority, not just a list of acceptable names.
  // This matters for rigs that contain both "Hip" (master body root) and
  // "Pelvis" (leg branch). Picking by node order made torso and legs animate
  // from different roots on Commodore/Punk/Bosun.
  for (const alias of aliases) {
    const exact = bones.find((bone) => normalizeName(bone.name) === alias);
    if (exact) return exact;
  }

  for (const alias of aliases) {
    const suffix = bones.find((bone) => {
      const name = normalizeName(bone.name);
      return !/twist|share|toe|finger|eye|breast/.test(name)
        && name.endsWith(alias);
    });
    if (suffix) return suffix;
  }

  return findSemanticBone(bones, slot);
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
      this.rig[slot] = findBone(this.bones, aliases, slot);
    }
    this.missingRequired = REQUIRED_SLOTS.filter((slot) => !this.rig[slot]);
    this.restPose = new Map(
      this.bones.map((bone) => [bone, bone.quaternion.clone()]),
    );

    // Capture each semantic bone's authored rest orientation relative to the
    // Chimpion model root, then build the basis change that maps Heretic's
    // procedural local axes into this character's local axes.
    this.model.updateWorldMatrix(true, true);
    const modelWorld = this.model.getWorldQuaternion(new THREE.Quaternion());
    const inverseModelWorld = modelWorld.clone().invert();
    this.restModelRotations = {};
    this.retargetBases = {};

    for (const [slot, bone] of Object.entries(this.rig)) {
      if (!bone) continue;
      const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
      const targetRest = inverseModelWorld.clone().multiply(boneWorld).normalize();
      this.restModelRotations[slot] = targetRest;

      const referenceValues = HERETIC_REFERENCE_MODEL_ROTATIONS[slot];
      if (!referenceValues) continue;
      const referenceRest = new THREE.Quaternion(...referenceValues).normalize();
      const toReference = targetRest.clone().invert().multiply(referenceRest).normalize();
      this.retargetBases[slot] = {
        toReference,
        fromReference: toReference.clone().invert(),
      };
    }
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
      hereticAxisRetarget: Object.keys(this.retargetBases).length > 0,
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
    aerialCrouch = 0,
    torsoForwardLean = 0,
  } = {}) {
    // Every frame starts from authored rest pose. Procedural animation and IK
    // therefore cannot accumulate quaternion drift over time.
    this.resetPose();
    const rotation = new THREE.Quaternion();
    const mappedRotation = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const apply = (slot, x = 0, y = 0, z = 0) => {
      const bone = this.rig[slot];
      if (!bone) return;

      rotation.setFromEuler(euler.set(x, y, z, 'XYZ'));
      const basis = this.retargetBases[slot];
      if (basis) {
        // R_target = (Q_target^-1 * Q_heretic)
        //          * R_heretic
        //          * inverse(Q_target^-1 * Q_heretic)
        //
        // The authored rest pose stays intact; only the animation delta is
        // expressed in the target skeleton's local axes.
        mappedRotation.copy(basis.toReference)
          .multiply(rotation)
          .multiply(basis.fromReference)
          .normalize();
        bone.quaternion.multiply(mappedRotation);
      } else {
        bone.quaternion.multiply(rotation);
      }
    };

    const stanceDirection = stance === 'goofy' ? -1 : 1;
    // This is a presentation weight, not a stance/physics flag. Retain the
    // intermediate values supplied by pose blending during aerial yaw.
    const facingDirection = THREE.MathUtils.clamp(
      Number.isFinite(Number(facingSign)) ? Number(facingSign) : 1, -1, 1,
    );
    const motionDirection = stanceDirection * facingDirection;
    const tuck = THREE.MathUtils.clamp(Number(aerialCrouch) || 0, 0, 1);
    // The avatar faces +Z, the same direction as the knee bend pole. Fold
    // toward those knees in aerial tricks instead of arching away from them.
    apply('hips', THREE.MathUtils.lerp(-hipFlex, hipFlex, tuck), 0, torsoSettle * 0.18);
    apply(
      'spine',
      -0.055 * compression + torsoSettle * 0.28 + torsoForwardLean * 0.55,
      -torsoCounter * 0.35 * motionDirection,
      torsoBalanceZ * 0.36,
    );
    apply(
      'chest',
      -0.025 * compression + torsoSettle * 0.42 + torsoForwardLean * 0.45,
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

  getModelSpacePoseSignature(slots = Object.keys(this.rig)) {
    this.model.updateWorldMatrix(true, true);
    const modelWorld = this.model.getWorldQuaternion(new THREE.Quaternion());
    const inverseModelWorld = modelWorld.clone().invert();
    const signature = {};

    for (const slot of slots) {
      const bone = this.rig[slot];
      const rest = this.restModelRotations[slot];
      if (!bone || !rest) continue;

      const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
      const currentModel = inverseModelWorld.clone().multiply(boneWorld).normalize();
      const delta = currentModel.multiply(rest.clone().invert()).normalize();
      signature[slot] = delta.toArray();
    }

    return signature;
  }

  applyFoundationPose(options = {}) {
    const crouch = options.crouch ?? 0.55;
    this.applySkatePose({
      compression: crouch,
      torsoCounter: options.torsoTurn ?? 0.08,
    });
  }
}
