import * as THREE from 'three';
import { HalfpipeVisual } from '../halfpipe/HalfpipeVisual.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { ARCADE_FEEDBACK } from '../vfx/ArcadeFeedbackTuning.js';

const INSTALL_KEY = Symbol.for('chimpions.halfpipe.coping-selective-bloom-fix');
const COPING_PARENT_PATTERN = /^halfpipe-coping\.002_2(?:\.\d+)?$/i;
const COPING_SOURCE_MESH_PATTERN = /^Object_2(?:\.\d+)?$/i;
const COPING_RUNTIME_MESH_PATTERN = /^Object_8(?:\.\d+)?$/i;
const V2_COPING_MATERIAL_PATTERN = /^Material\.003(?:\.\d+)?$/i;
const FRONT_MATERIAL_PATTERN = /^FRENTE(?:\.\d+)?$/i;

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

function isV2CopingObject(object) {
  if (!object?.isMesh) return false;
  const parentName = object.parent?.userData?.halfpipeSourceNodeName
    || object.parent?.name
    || '';
  const sourceMeshName = object.userData?.halfpipeSourceMeshName || '';
  const runtimeName = object.name || '';
  return COPING_PARENT_PATTERN.test(parentName)
    && COPING_SOURCE_MESH_PATTERN.test(sourceMeshName)
    && COPING_RUNTIME_MESH_PATTERN.test(runtimeName);
}

function isPreparedCopingMaterial(material) {
  return Boolean(
    material?.userData?.halfpipeRole === 'coping'
    || /red-glow-source$/i.test(material?.name || '')
    || /^Rail_Metal(?:$|-)/.test(material?.name || '')
    || V2_COPING_MATERIAL_PATTERN.test(material?.name || ''),
  );
}

function createPhysicalCopingMaterial(source) {
  const material = new THREE.MeshStandardMaterial({
    name: `${source?.name || 'Rail_Metal'}-physical-emissive`,
    color: ARCADE_FEEDBACK.copingSourceColor,
    emissive: ARCADE_FEEDBACK.copingGlowColor,
    // Stronger than the first no-ghost pass. The glow now comes only from this
    // physical rail through selective bloom, never from a second halo mesh.
    emissiveIntensity: 2.75,
    metalness: 0.58,
    roughness: 0.24,
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

function prepareV2FrontMetal(visual) {
  const frontMetal = GAME_CONFIG.renderer.frontMetal;
  visual.model?.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    if (!source.some(material => FRONT_MATERIAL_PATTERN.test(material?.name || ''))) return;

    const prepared = source.map((material) => {
      if (!FRONT_MATERIAL_PATTERN.test(material?.name || '')) return material;
      const reflective = material.clone();
      reflective.name = `${material.name}-max-reflective-v2`;
      if ('metalness' in reflective) reflective.metalness = frontMetal.metalness;
      if ('envMapIntensity' in reflective) reflective.envMapIntensity = frontMetal.envMapIntensity;
      reflective.needsUpdate = true;
      return reflective;
    });
    object.material = Array.isArray(object.material) ? prepared : prepared[0];
    object.userData.maxReflectiveFront = true;
    object.userData.frontMetalMatch = 'v2:FRENTE';
  });
}

function convertCopingToSelectiveBloom(visual) {
  if (!visual?.model) return visual;

  // The previous implementation drew extra camera-facing translucent quads
  // around each rail. During vertical camera tracking those independent quads
  // could separate from the physical coping and read as red ghost trails.
  removeLegacyCopingHalos(visual.model);
  prepareV2FrontMetal(visual);

  visual.model.traverse((object) => {
    const isCopingObject = object?.userData?.copingContactZone || isV2CopingObject(object);
    if (!object?.isMesh || !isCopingObject || !object.material) return;

    object.userData.copingContactZone = true;
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

  // Refresh authored coping contact bounds after the presentation-only material
  // swap. V2 uses suffixed Blender/GLTF names but the physical rail geometry is
  // still the contact source.
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
