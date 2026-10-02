import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';
import { quality } from '../graphics/RenderQualityManager.js';
import { prepareRampSurfaceFinish } from '../graphics/RampSurfaceFinish.js';
import { ARCADE_FEEDBACK } from '../vfx/ArcadeFeedbackTuning.js';

const COPING_MATERIAL_NAME = 'Rail_Metal';

// The shipped GLB replaced the legacy rail material name. Resolve its authored
// mesh AND parent so an unrelated generic Material.002 is never a contact rail.
function isCopingMaterial(material, mesh) {
  if ((mesh.parent?.userData?.halfpipeSourceNodeName || mesh.parent?.name) !== 'halfpipe-coping.002_2'
    && mesh.parent?.name !== THREE.PropertyBinding.sanitizeNodeName('halfpipe-coping.002_2')) return false;
  if (material?.name === COPING_MATERIAL_NAME) return true;
  return (mesh?.name === 'Object_8'
    || /^Object_8(?:\.\d+)?$/.test(mesh.userData.halfpipeSourceNodeName || ''))
    && mesh.userData.halfpipeSourceMeshName === 'Object_2'
    && (material?.name === 'Material.002'
      || material?.userData?.halfpipeRole === 'coping');
}

const RIDING_SURFACE_NAMES = Object.freeze([
  'Object_4',
  'halfpipe-riding-surface',
  'halfpipe-surface',
  'riding-surface',
]);

function isVisibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function worldBounds(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const transformed = new THREE.Box3();

  object.traverse((child) => {
    if (
      !child.isMesh
      || !child.geometry
      || child.userData?.visualGlowOnly
      || !isVisibleInHierarchy(child)
    ) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    transformed.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    box.union(transformed);
  });

  return box;
}

function visibleBounds(root) {
  return worldBounds(root);
}

function hasVisibleMesh(object) {
  let found = false;
  object.traverse((child) => {
    if (found) return;
    if (
      child.isMesh
      && child.geometry
      && !child.userData?.visualGlowOnly
      && isVisibleInHierarchy(child)
    ) found = true;
  });
  return found;
}

function createGlowMaterial(expansion, opacity) {
  return new THREE.ShaderMaterial({
    name: 'coping-selective-glow',
    uniforms: {
      uExpansion: { value: expansion },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(ARCADE_FEEDBACK.copingGlowColor) },
    },
    vertexShader: `
      uniform float uExpansion;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      void main() {
        vec3 expanded = position + normalize(normal) * uExpansion;
        vec4 viewPosition = modelViewMatrix * vec4(expanded, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(vViewDirection))), 1.6);
        gl_FragColor = vec4(uColor, uOpacity * (0.18 + rim * 0.82));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
}

function createSilentMaterial() {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
  material.colorWrite = false;
  return material;
}

function createCopingGlowShell(mesh, sourceMaterials, expansion, opacity) {
  if (mesh.isSkinnedMesh || !mesh.geometry?.getAttribute('normal')) return null;

  const glowMaterials = sourceMaterials.map((material) => (
    isCopingMaterial(material, mesh)
      ? createGlowMaterial(expansion, opacity)
      : createSilentMaterial()
  ));
  const shell = new THREE.Mesh(
    mesh.geometry,
    Array.isArray(mesh.material) ? glowMaterials : glowMaterials[0],
  );
  shell.name = `${mesh.name || 'coping'}-selective-glow`;
  shell.userData.visualGlowOnly = true;
  // These expanded, transparent shells are a subtle direct-render fallback.
  // In the selective pass an untagged shell becomes opaque black, writes
  // depth in front of its own rail and suppresses all of that rail's bloom.
  // Hide only the decoration there; the role-tagged source coping remains
  // the HDR emission source, with the ramp/rider still providing occlusion.
  shell.userData.bloomExclude = true;
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.frustumCulled = mesh.frustumCulled;
  shell.renderOrder = mesh.renderOrder + 1;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

function findRidingSurface(root) {
  let authoredSurface = null;
  root.traverse(object => {
    if (/^Object_4(?:\.\d+)?$/.test(object.userData.halfpipeSourceNodeName || '')
      && hasVisibleMesh(object)) authoredSurface = object;
  });
  if (authoredSurface) return authoredSurface;
  for (const name of RIDING_SURFACE_NAMES) {
    const exact = root.getObjectByName(name);
    if (exact && hasVisibleMesh(exact)) return exact;
  }

  const namedCandidates = [];
  root.traverse((object) => {
    if (
      !object.isMesh
      || !object.geometry
      || object.userData?.visualGlowOnly
      || !isVisibleInHierarchy(object)
    ) return;
    if (/ground/i.test(object.name)) return;
    if (/(half.?pipe|riding|ride|ramp|surface)/i.test(object.name)) namedCandidates.push(object);
  });
  if (namedCandidates.length) {
    namedCandidates.sort((a, b) => {
      const aSize = worldBounds(a).getSize(new THREE.Vector3());
      const bSize = worldBounds(b).getSize(new THREE.Vector3());
      return (bSize.x * bSize.y) - (aSize.x * aSize.y);
    });
    return namedCandidates[0];
  }

  const candidates = [];
  root.traverse((object) => {
    if (
      !object.isMesh
      || !object.geometry
      || object.userData?.visualGlowOnly
      || !isVisibleInHierarchy(object)
    ) return;
    if (/ground/i.test(object.name)) return;
    const box = worldBounds(object);
    const size = box.getSize(new THREE.Vector3());
    candidates.push({
      object,
      score: Math.max(0, size.x) * Math.max(0, size.y),
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.object || null;
}

function isAuditedFrontMetalObject(object, frontMetal) {
  return Boolean(
    frontMetal?.nodeName
    && frontMetal?.materialName
    && object?.name === frontMetal.nodeName,
  );
}

export class HalfpipeVisual {
  constructor(url, { fullMap = false } = {}) {
    this.fullMap = fullMap;
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-visual-root';
    this.model = null;
    this.animationMixer = null;
    this.hiddenGroundNodes = [];
    this.bounds = new THREE.Box3();
    this.ridingSurface = null;
    this.ridingSurfaceBounds = new THREE.Box3();
    this.alignment = null;
    this._surfaceRaycaster = new THREE.Raycaster();
    this._surfaceNormalMatrix = new THREE.Matrix3();
    this._unregisterQuality = null;
    this.copingBounds = { left: new THREE.Box3(), right: new THREE.Box3() };
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    // GLTFLoader sanitizes names for animation bindings. Retain authored names
    // separately for semantic lookups, without renaming animated nodes.
    this.model.traverse(object => {
      const association = gltf.parser?.associations?.get(object);
      const sourceNode = gltf.parser?.json?.nodes?.[association?.nodes];
      if (sourceNode?.name) object.userData.halfpipeSourceNodeName = sourceNode.name;
    });
    this.model.name = 'halfpipe-source-visual';
    const paintMask = await new THREE.TextureLoader()
      .loadAsync('/images/materials/halfpipe-paint-mask.png')
      .catch(() => null);

    this.model.traverse((object) => {
      if (!this.fullMap && /ground/i.test(object.name)) {
        object.visible = false;
        this.hiddenGroundNodes.push(object.name);
      }
      if (object.isMesh && !object.userData?.visualGlowOnly) {
        const association = gltf.parser?.associations?.get(object);
        const sourceMesh = gltf.parser?.json?.meshes?.[association?.meshes];
        if (sourceMesh?.name) object.userData.halfpipeSourceMeshName = sourceMesh.name;
        object.castShadow = true;
        object.receiveShadow = true;

        const sourceMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        if (!this.fullMap || (/^Object_4(?:\.\d+)?$/.test(object.parent?.userData?.halfpipeSourceNodeName || '')
          || object.parent?.name === 'Object_4')) {
          for (const material of sourceMaterials) prepareRampSurfaceFinish(material, paintMask);
        }
        const frontMetal = GAME_CONFIG.renderer.frontMetal;
        // The current shipped GLB splits Object_4 into named material meshes.
        // Retain the legacy audit match, and recognize its actual FRENTE face.
        const isCurrentFront = object.name.startsWith('Object_4_')
          && sourceMaterials.some(material => material?.name === 'FRENTE');
        let preparedMaterials = sourceMaterials;

        if (
          (isAuditedFrontMetalObject(object, frontMetal)
          && sourceMaterials.some((material) => material?.name === frontMetal.materialName))
          || isCurrentFront
        ) {
          preparedMaterials = sourceMaterials.map((material) => {
            if (material?.name !== frontMetal.materialName && material?.name !== 'FRENTE') return material;

            // V9 audit maps Material -> source mesh Object_0 -> runtime node
            // Object_4 uniquely. Preserve authored roughness/maps exactly and
            // adjust only approved metallic/environment response.
            const reflective = material.clone();
            reflective.name = `${material.name}-max-reflective`;
            if ('metalness' in reflective) reflective.metalness = frontMetal.metalness;
            if ('envMapIntensity' in reflective) {
              reflective.envMapIntensity = frontMetal.envMapIntensity;
            }
            reflective.needsUpdate = true;
            return reflective;
          });

          object.material = Array.isArray(object.material)
            ? preparedMaterials
            : preparedMaterials[0];
          object.userData.maxReflectiveFront = true;
          object.userData.frontMetalMatch = `${frontMetal.nodeName}:${frontMetal.materialName}`;
        }

        const hasCopingMaterial = sourceMaterials.some(
          (material) => isCopingMaterial(material, object),
        );

        if (hasCopingMaterial) {
          object.userData.emissiveBloom = true;
          object.userData.copingContactZone = true;
          preparedMaterials = preparedMaterials.map((material) => {
            if (!isCopingMaterial(material, object)) return material;

            const coping = material.clone();
            coping.name = `${material.name}-soft-emissive`;
            coping.userData.halfpipeRole = 'coping';
            if (coping.emissive?.set) {
              coping.emissive.setHex(ARCADE_FEEDBACK.copingEmissiveColor);
              coping.emissiveIntensity = GAME_CONFIG.renderer.copingGlow.emissiveIntensity;
            }
            coping.needsUpdate = true;
            return coping;
          });

          object.material = Array.isArray(object.material)
            ? preparedMaterials
            : preparedMaterials[0];

          const glow = GAME_CONFIG.renderer.copingGlow;
          createCopingGlowShell(
            object,
            sourceMaterials,
            glow.innerExpansion,
            glow.innerOpacity,
          );
          createCopingGlowShell(
            object,
            sourceMaterials,
            glow.outerExpansion,
            glow.outerOpacity,
          );
        }
      }
    });

    // The reviewed mask is sampled once into the packed finish texture. It does
    // not need its own GPU allocation or a reference after material preparation.
    paintMask?.dispose();

    this.root.add(this.model);
    this.root.updateWorldMatrix(true, true);

    let authoredRamp = null;
    if (this.fullMap) this.model.traverse(object => {
      if (object.userData.halfpipeSourceNodeName === 'halfpipe.001_Baked_0'
        || object.name === THREE.PropertyBinding.sanitizeNodeName('halfpipe.001_Baked_0')) {
        authoredRamp = object;
      }
    });
    const alignmentRoot = this.fullMap
      ? authoredRamp?.parent?.parent?.parent
      : this.root;
    if (!alignmentRoot) throw new Error('Full map is missing its authored halfpipe.');
    const fullBoxBeforeAlignment = visibleBounds(alignmentRoot);
    const fullCenter = fullBoxBeforeAlignment.getCenter(new THREE.Vector3());
    const authoredPositionX = this.model.position.x;

    this.ridingSurface = findRidingSurface(this.fullMap ? authoredRamp : this.model);
    if (!this.ridingSurface) {
      throw new Error('Halfpipe riding surface could not be identified for visual alignment.');
    }
    this.ridingSurface.userData.halfpipeSurfaceRole = 'riding-surface';
    this.ridingSurface.userData.wearZoneCandidate = true;

    const ridingBoxBeforeAlignment = worldBounds(this.ridingSurface);
    const ridingBoundsCenterBefore = ridingBoxBeforeAlignment.getCenter(new THREE.Vector3());

    this.model.position.x = authoredPositionX;
    this.model.position.z -= fullCenter.z;
    this.model.position.y -= fullBoxBeforeAlignment.min.y;

    this.root.updateWorldMatrix(true, true);
    const box = visibleBounds(this.root);
    this.bounds.copy(box);
    this.ridingSurfaceBounds.copy(worldBounds(this.ridingSurface));
    this._measureCopingContacts();

    const alignedRidingBoundsCenter = this.ridingSurfaceBounds.getCenter(new THREE.Vector3());
    this.alignment = Object.freeze({
      source: 'authored-riding-origin',
      ridingSurfaceName: this.ridingSurface.name,
      authoredPositionX,
      ridingBoundsCenterBeforeX: ridingBoundsCenterBefore.x,
      ridingBoundsCenterAfterX: alignedRidingBoundsCenter.x,
      fullModelCenterX: fullCenter.x,
      appliedX: this.model.position.x,
    });

    this.root.userData.visualOnly = true;
    this.root.userData.hiddenSourceGround = [...this.hiddenGroundNodes];
    this.root.userData.ridingSurfaceName = this.ridingSurface.name;
    this.root.userData.ridingSurfaceCenterX = alignedRidingBoundsCenter.x;
    this.root.userData.alignmentSource = this.alignment.source;
    this.root.userData.graphicsQualityManaged = true;
    this._unregisterQuality?.();
    this._unregisterQuality = quality.registerObject(this.model);
    if (this.fullMap && gltf.animations?.length) {
      this.animationMixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) this.animationMixer.clipAction(clip).play();
    }
    return this;
  }

  measureRidingSurfaceSeparation(worldPoint, worldNormal, options = {}) {
    if (!this.ridingSurface) return null;

    const padding = Math.max(0.01, Number(options.padding) || 3);
    const far = Math.max(padding + 0.01, Number(options.far) || 8);
    const normal = worldNormal.clone().normalize();
    const origin = worldPoint.clone().addScaledVector(normal, padding);

    this.root.updateWorldMatrix(true, true);
    this._surfaceRaycaster.set(origin, normal.clone().negate());
    this._surfaceRaycaster.far = far;

    const hit = this._surfaceRaycaster.intersectObject(this.ridingSurface, true)[0];
    if (!hit) return null;

    const hitNormal = hit.face?.normal
      ? hit.face.normal.clone().applyNormalMatrix(
        this._surfaceNormalMatrix.getNormalMatrix(hit.object.matrixWorld),
      )
      : normal.clone();
    if (hitNormal.dot(normal) < 0) hitNormal.negate();

    return {
      separation: hit.distance - padding,
      point: hit.point.clone(),
      normal: hitNormal,
      distance: hit.distance,
    };
  }

  _measureCopingContacts() {
    this.copingBounds.left.makeEmpty();
    this.copingBounds.right.makeEmpty();
    const point = new THREE.Vector3();
    this.model.traverse(object => {
      if (!object.isMesh || !object.userData.copingContactZone || !object.geometry) return;
      const geometry = object.geometry;
      const positions = geometry.getAttribute('position');
      if (!positions) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count || positions.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex];
        if (material?.userData?.halfpipeRole !== 'coping'
          && !String(material?.name || '').startsWith(COPING_MATERIAL_NAME)) continue;
        const end = Math.min(group.start + group.count, geometry.index?.count || positions.count);
        for (let vertex = group.start; vertex < end; vertex += 1) {
          const index = geometry.index ? geometry.index.getX(vertex) : vertex;
          point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
          this.copingBounds[point.x < 0 ? 'left' : 'right'].expandByPoint(point);
        }
      }
    });
  }

  getCopingContactPoint(side, z = 0) {
    const right = Number(side) > 0 || side === 'right';
    const box = this.copingBounds[right ? 'right' : 'left'];
    if (box.isEmpty()) return null;
    // Use the actual inner edge and top of the authored rail. The contact
    // target remains on its span instead of an approximate physics lip.
    return new THREE.Vector3(
      right ? box.min.x : box.max.x,
      box.max.y + 0.015,
      THREE.MathUtils.clamp(Number(z) || 0, box.min.z, box.max.z),
    );
  }

  updateAnimation(dt) {
    if (this.root.visible) this.animationMixer?.update(Math.max(0, Math.min(0.1, dt)));
  }

  dispose() {
    this.animationMixer?.stopAllAction();
    if (this.animationMixer && this.model) this.animationMixer.uncacheRoot(this.model);
    this.animationMixer = null;
    this._unregisterQuality?.();
    this._unregisterQuality = null;
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
