// Approved Half Pipe stance, measured per uploaded avatar rather than filename.
export const UNREAL_SKATE_UPLOAD_PROFILE = Object.freeze({
  id: 'unreal-humanoid-skate-v1',
  stanceWidthScale: 1.2,
  straightenToeHeading: true,
});
const required = Object.freeze({
  hips: 'pelvis', leftThigh: 'thigh_l', leftShin: 'calf_l', leftFoot: 'foot_l',
  rightThigh: 'thigh_r', rightShin: 'calf_r', rightFoot: 'foot_r',
});
export function resolveSkateUploadProfile(rigAdapter) {
  const matches = rigAdapter.valid && Object.entries(required).every(([slot, name]) =>
    rigAdapter.rig[slot]?.name.split(':').pop().toLowerCase() === name);
  return matches ? UNREAL_SKATE_UPLOAD_PROFILE : null;
}
