import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { disposeObject3D } from '../core/disposeObject3D.js';
import { quality } from '../graphics/RenderQualityManager.js';

const COPING_MATERIAL_NAME = 'Rail_Metal';

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
    },
    vertexShader: `
      uniform float uExpansion;
      void main() {
        vec3 expanded = position + normalize(normal) * uExpansion;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(vec3(1.0), uOpacity);
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
    material?.name === COPING_MATERIAL_NAME
      ? createGlowMaterial(expansion, opacity)
      : createSilentMaterial()
  ));
  const shell = new THREE.Mesh(
    mesh.geometry,
    Array.isArray(mesh.material) ? glowMaterials : glowMaterials[0],
  );
  shell.name = `${mesh.name || 'coping'}-selective-glow`;
  shell.userData.visualGlowOnly = true;
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.frustumCulled = mesh.frustumCulled;
  shell.renderOrder = mesh.renderOrder + 1;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

function findRidingSurface(root) {
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
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'halfpipe-visual-root';
    this.model = null;
    this.hiddenGroundNodes = [];
    this.bounds = new THREE.Box3();
    this.ridingSurface = null;
    this.ridingSurfaceBounds = new THREE.Box3();
    this.alignment = null;
    this._surfaceRaycaster = new THREE.Raycaster();
    this._unregisterQuality = null;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.url);
    this.model = gltf.scene;
    this.model.name = 'halfpipe-source-visual';

    this.model.traverse((object) => {
      if (/ground/i.test(object.name)) {
        object.visible = false;
        this.hiddenGroundNodes.push(object.name);
      }
      if (object.isMesh && !object.userData?.visualGlowOnly) {
        object.castShadow = true;
        object.receiveShadow = true;

        const sourceMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const frontMetal = GAME_CONFIG.renderer.frontMetal;
        let preparedMaterials = sourceMaterials;

        if (
          isAuditedFrontMetalObject(object, frontMetal)
          && sourceMaterials.some((material) => material?.name === frontMetal.materialName)
        ) {
          preparedMaterials = sourceMaterials.map((material) => {
            if (material?.name !== frontMetal.materialName) return material;

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
          (material) => material?.name === COPING_MATERIAL_NAME,
        );

        if (hasCopingMaterial) {
          object.userData.copingContactZone = true;
          preparedMaterials = preparedMaterials.map((material) => {
            if (material?.name !== COPING_MATERIAL_NAME) return material;

            const coping = material.clone();
            coping.name = `${material.name}-soft-emissive`;
            if (coping.emissive?.set) {
              coping.emissive.set(0xffffff);
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

    this.root.add(this.model);
    this.root.updateWorldMatrix(true, true);

    const fullBoxBeforeAlignment = visibleBounds(this.root);
    const fullCenter = fullBoxBeforeAlignment.getCenter(new THREE.Vector3());
    const authoredPositionX = this.model.position.x;

    this.ridingSurface = findRidingSurface(this.model);
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

    return {
      separation: hit.distance - padding,
      point: hit.point.clone(),
      distance: hit.distance,
    };
  }

  dispose() {
    this._unregisterQuality?.();
    this._unregisterQuality = null;
    disposeObject3D(this.model);
    this.root.removeFromParent();
  }
}
