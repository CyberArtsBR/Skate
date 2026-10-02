import * as THREE from 'three';
import { HalfpipeVisual } from '../halfpipe/HalfpipeVisual.js';
import { ARCADE_FEEDBACK } from '../vfx/ArcadeFeedbackTuning.js';

const INSTALL_KEY = Symbol.for('chimpions.halfpipe.coping-selective-bloom-fix');

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const entry of material) entry?.dispose?.();
    return;
  }
  material.dispose?.();
}

function removeLegacyCopingHalos(root) {
  const removals = [];
  root?.traverse?.((object) => {
    if (
      object?.userData?.visualGlowOnly
      || /^coping-(?:left|right)-local-red-glow$/i.test(object?.name || '')
    ) removals.push(object);
  });

  for (const object of removals) {
    object.removeFromParent();
    object.geometry?.dispose?.();
    disposeMaterial(object.material);
  }
}

function isPreparedCopingMaterial(material) {
  return Boolean(
    material?.userData?.halfpipeRole === 'coping'
    || /red-glow-source$/i.test(material?.name || '')
    || /^Rail_Metal(?:$|-)/.test(material?.name || ''),
  );
}

function createPhysicalCopingMaterial(source) {
  const material = new THREE.MeshStandardMaterial({
    name: `${source?.name || 'Rail_Metal'}-physical-emissive`,
    color: ARCADE_FEEDBACK.copingSourceColor,
    emissive: ARCADE_FEEDBACK.copingGlowColor,
    emissiveIntensity: 1.15,
    metalness: 0.58,
    roughness: 0.28,
    side: source?.side ?? THREE.FrontSide,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    toneMapped: true,
  });

  material.userData = {
    ...(source?.userData || {}),
    halfpipeRole: 'coping',
    selectiveBloomSource: true,
  };
  return material;
}

function convertCopingToSelectiveBloom(visual) {
  if (!visual?.model) return visual;

  // The previous implementation drew extra camera-facing translucent quads
  // around each rail. During vertical camera tracking those independent quads
  // could separate from the physical coping and read as red ghost trails.
  removeLegacyCopingHalos(visual.model);

  visual.model.traverse((object) => {
    if (!object?.isMesh || !object.userData?.copingContactZone || !object.material) return;

    // CinematicPostProcessing already supports per-material selective bloom.
    // Mark only the authored coping mesh as eligible; its non-coping slots are
    // automatically replaced with black during the bloom-only render pass.
    object.userData.emissiveBloom = true;
    object.userData.bloomExclude = false;

    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const replaced = [];
    const prepared = sourceMaterials.map((source) => {
      if (!isPreparedCopingMaterial(source)) return source;
      const next = createPhysicalCopingMaterial(source);
      replaced.push(source);
      return next;
    });

    object.material = Array.isArray(object.material) ? prepared : prepared[0];
    for (const source of replaced) source?.dispose?.();
  });

  // Geometry is unchanged, but refresh authored coping contact bounds after the
  // presentation-only material swap so gameplay/contact helpers stay current.
  visual._measureCopingContacts?.();
  return visual;
}

export function installCopingSelectiveBloomFix() {
  const prototype = HalfpipeVisual.prototype;
  if (prototype[INSTALL_KEY]) return;
  prototype[INSTALL_KEY] = true;

  const originalLoad = prototype.load;
  prototype.load = async function loadWithPhysicalCoping(...args) {
    const result = await originalLoad.apply(this, args);
    convertCopingToSelectiveBloom(this);
    return result;
  };
}
