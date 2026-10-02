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
  if (!/^halfpipe-coping\.002_2(?:\.\d+)?$/.test(mesh.parent?.userData?.halfpipeSourceNodeName || mesh.parent?.name || '')) return false;
  if (material?.name === COPING_MATERIAL_NAME) return true;
  return (mesh?.name === 'Object_8'
    || /^Object_8(?:\.\d+)?$/.test(mesh.userData.halfpipeSourceNodeName || ''))
    && /^Object_2(?:\.\d+)?$/.test(mesh.userData.halfpipeSourceMeshName || '')
    && (material?.name === 'Material.002' || material?.name === 'Material.003'
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

function createGlowMaterial(start, end, radius, sourceRadius, opacity) {
  return new THREE.ShaderMaterial({
    name: 'coping-local-red-glow',
    uniforms: {
      uStart: { value: start },
      uEnd: { value: end },
      uRadius: { value: radius },
      uSourceRadius: { value: sourceRadius },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(ARCADE_FEEDBACK.copingGlowColor) },
    },
    vertexShader: `
      uniform vec3 uStart;
      uniform vec3 uEnd;
      uniform float uRadius;
      uniform float uSourceRadius;
      uniform vec2 uResolution;
      varying vec2 vPixelStart;
      varying vec2 vPixelEnd;
      varying vec2 vRailDepth;
      varying float vRadius;
      void main() {
        vec3 start = (modelViewMatrix * vec4(uStart, 1.0)).xyz;
        vec3 end = (modelViewMatrix * vec4(uEnd, 1.0)).xyz;
        float scale = max(length(modelViewMatrix[0].xyz),
          max(length(modelViewMatrix[1].xyz), length(modelViewMatrix[2].xyz)));
        vec4 startClip = projectionMatrix * vec4(start, 1.0);
        vec4 endClip = projectionMatrix * vec4(end, 1.0);
        vec4 frontStartClip = projectionMatrix * vec4(start + vec3(0.0, 0.0, uSourceRadius * scale), 1.0);
        vec4 frontEndClip = projectionMatrix * vec4(end + vec3(0.0, 0.0, uSourceRadius * scale), 1.0);
        vRailDepth = vec2(frontStartClip.z / frontStartClip.w, frontEndClip.z / frontEndClip.w) * 0.5 + 0.5;
        vPixelStart = (startClip.xy / startClip.w * 0.5 + 0.5) * uResolution;
        vPixelEnd = (endClip.xy / endClip.w * 0.5 + 0.5) * uResolution;
        vec2 span = vPixelEnd - vPixelStart;
        float spanLength = length(span);
        vec2 tangent = spanLength > 0.00001 ? span / spanLength : vec2(1.0, 0.0);
        vec2 transverse = vec2(-tangent.y, tangent.x);
        vRadius = uRadius * scale * projectionMatrix[1][1] * uResolution.y
          / max(startClip.w + endClip.w, 0.00001);
        vec2 pixelPosition = mix(vPixelStart, vPixelEnd, position.x * 0.5 + 0.5)
          + tangent * position.x * vRadius + transverse * position.y * vRadius;
        vec4 viewPosition = vec4(mix(start, end, position.x * 0.5 + 0.5), 1.0);
        // Place the translucent halo at the front surface of its rail. Scene
        // depth still hides it behind the rider and other foreground geometry.
        viewPosition.z += uSourceRadius * scale;
        gl_Position = projectionMatrix * viewPosition;
        gl_Position.xy = (pixelPosition / uResolution * 2.0 - 1.0) * gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vPixelStart;
      varying vec2 vPixelEnd;
      varying vec2 vRailDepth;
      varying float vRadius;
      void main() {
        // Screen pixel distance avoids perspective warping across the two
        // triangles of the quad, particularly along rails aimed at the camera.
        vec2 span = vPixelEnd - vPixelStart;
        float along = clamp(dot(gl_FragCoord.xy - vPixelStart, span) / max(dot(span, span), 0.00001), 0.0, 1.0);
        float distance = length(gl_FragCoord.xy - (vPixelStart + span * along)) / max(vRadius, 0.00001);
        float falloff = exp(-4.5 * distance * distance) * (1.0 - smoothstep(0.72, 1.0, distance));
        float alpha = uOpacity * falloff;
        if (alpha < 0.001) discard;
        // Test depth against the closest rail point, not the billboard's
        // artificial triangle plane. This avoids diagonal occlusion seams.
        gl_FragDepth = mix(vRailDepth.x, vRailDepth.y, along);
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    // Alpha compositing retains the saturated red on bright backgrounds.
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
}

function createCopingGlow(mesh, sourceMaterials) {
  if (mesh.isSkinnedMesh || !mesh.geometry) return;
  const positions = mesh.geometry.getAttribute('position');
  if (!positions) return;
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const spans = { left: new THREE.Box3(), right: new THREE.Box3() };
  const groups = mesh.geometry.groups.length ? mesh.geometry.groups
    : [{ start: 0, count: mesh.geometry.index?.count || positions.count, materialIndex: 0 }];
  mesh.updateWorldMatrix(true, false);
  // The authored coping mesh holds both rails. Gather only approved material
  // groups and measure each side separately, never draw a halo across the pipe.
  for (const group of groups) {
    if (!isCopingMaterial(sourceMaterials[group.materialIndex], mesh)) continue;
    const end = Math.min(group.start + group.count, mesh.geometry.index?.count || positions.count);
    for (let vertex = group.start; vertex < end; vertex += 1) {
      const index = mesh.geometry.index ? mesh.geometry.index.getX(vertex) : vertex;
      local.fromBufferAttribute(positions, index);
      world.copy(local).applyMatrix4(mesh.matrixWorld);
      spans[world.x < 0 ? 'left' : 'right'].expandByPoint(local);
    }
  }

  const glow = GAME_CONFIG.renderer.copingGlow;
  for (const [side, bounds] of Object.entries(spans)) {
    if (bounds.isEmpty()) continue;
    const size = bounds.getSize(new THREE.Vector3());
    const axis = ['x', 'y', 'z'].reduce((longest, current) => size[current] > size[longest] ? current : longest, 'x');
    const sourceRadius = Math.max(...['x', 'y', 'z'].filter(current => current !== axis).map(current => size[current])) * 0.5;
    const start = bounds.getCenter(new THREE.Vector3());
    const end = start.clone();
    start[axis] = bounds.min[axis];
    end[axis] = bounds.max[axis];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    ], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const halo = new THREE.Mesh(geometry, createGlowMaterial(
      start, end, sourceRadius + glow.haloWidth, sourceRadius, glow.haloOpacity,
    ));
    halo.name = `coping-${side}-local-red-glow`;
    halo.userData.visualGlowOnly = true;
    halo.userData.bloomExclude = true;
    halo.frustumCulled = false; // Vertices are expanded from rail endpoints in the shader.
    halo.castShadow = false;
    halo.receiveShadow = false;
    halo.renderOrder = mesh.renderOrder + 1;
    halo.raycast = () => {};
    const viewport = new THREE.Vector4();
    halo.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(viewport);
      halo.material.uniforms.uResolution.value.set(viewport.z, viewport.w);
    };
    mesh.add(halo);
  }
}

export function prepareCopingVisual(mesh, sourceMaterials, preparedMaterials = sourceMaterials) {
  // The bar uses a local red glow, not the screen-space bloom pass.
  mesh.userData.emissiveBloom = false;
  mesh.userData.copingContactZone = true;
  const materials = preparedMaterials.map((material) => {
    if (!isCopingMaterial(material, mesh)) return material;
    const coping = new THREE.MeshBasicMaterial({
      name: `${material.name}-red-glow-source`,
      color: ARCADE_FEEDBACK.copingSourceColor,
      side: material.side,
      toneMapped: false,
    });
    coping.userData = { ...material.userData, halfpipeRole: 'coping' };
    // Keep a rounded red highlight across the authored cylinder instead of
    // flattening its surface into a uniformly painted strip.
    coping.onBeforeCompile = (shader) => {
      const varyings = 'varying vec3 vCopingNormal; varying vec3 vCopingViewDirection;\n';
      shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vCopingNormal = normalize(normalMatrix * normal);
        vCopingViewDirection = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
      `);
      shader.fragmentShader = varyings + shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );', `
          vec4 diffuseColor = vec4( diffuse, opacity );
          float copingFacing = abs(dot(normalize(vCopingNormal), normalize(vCopingViewDirection)));
          diffuseColor.rgb *= 0.45 + 0.55 * pow(copingFacing, 0.55);
        `,
      );
    };
    coping.customProgramCacheKey = () => 'coping-rounded-red-source-v1';
    return coping;
  });
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
  createCopingGlow(mesh, sourceMaterials);
  return materials;
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
    // Full arenas retain their scenery/animations, but never render the embedded
    // v1 ramp. Import the same v2 asset used by the photographic maps.
    if (this.fullMap) {
      let embeddedRamp = null;
      this.model.traverse(object => {
        if (object.userData.halfpipeSourceNodeName === 'halfpipe.001_Baked_0') embeddedRamp = object;
      });
      const embeddedGroup = embeddedRamp?.parent?.parent?.parent;
      if (!embeddedGroup) throw new Error('Full map is missing its embedded ramp group.');
      embeddedGroup.visible = false;
      const replacement = await new GLTFLoader().loadAsync(GAME_CONFIG.assets.halfpipe);
      this.replacementRamp = replacement.scene;
      this.replacementRamp.traverse(object => {
        const association = replacement.parser.associations.get(object);
        const node = replacement.parser.json.nodes?.[association?.nodes];
        const mesh = replacement.parser.json.meshes?.[association?.meshes];
        if (node?.name) object.userData.halfpipeSourceNodeName = node.name;
        if (mesh?.name) object.userData.halfpipeSourceMeshName = mesh.name;
      });
      this.model.add(this.replacementRamp);
    }
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
        if (!isVisibleInHierarchy(object)) return;
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
          && sourceMaterials.some(material => /^FRENTE(?:\.\d+)?$/.test(material?.name || ''));
        let preparedMaterials = sourceMaterials;

        if (
          (isAuditedFrontMetalObject(object, frontMetal)
          && sourceMaterials.some((material) => material?.name === frontMetal.materialName))
          || isCurrentFront
        ) {
          preparedMaterials = sourceMaterials.map((material) => {
            if (material?.name !== frontMetal.materialName && !/^FRENTE(?:\.\d+)?$/.test(material?.name || '')) return material;

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
          prepareCopingVisual(object, sourceMaterials, preparedMaterials);
        }
      }
    });

    // The reviewed mask is sampled once into the packed finish texture. It does
    // not need its own GPU allocation or a reference after material preparation.
    paintMask?.dispose();

    this.root.add(this.model);
    this.root.updateWorldMatrix(true, true);

    const alignmentRoot = this.fullMap
      ? this.replacementRamp
      : this.root;
    if (!alignmentRoot) throw new Error('Full map is missing its authored halfpipe.');
    const fullBoxBeforeAlignment = visibleBounds(alignmentRoot);
    const fullCenter = fullBoxBeforeAlignment.getCenter(new THREE.Vector3());
    const authoredPositionX = this.model.position.x;

    this.ridingSurface = findRidingSurface(this.replacementRamp || this.model);
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
