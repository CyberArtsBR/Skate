import * as THREE from 'three';
import { quality } from '../graphics/RenderQualityManager.js';
import { disposeObject3D } from '../core/disposeObject3D.js';

const MAP_FINISHES = Object.freeze({
  'canyon-session': { concrete: 0xa2947e, metal: 0x6c6a61, edge: 0x947050 },
  city: { concrete: 0x968e7c, metal: 0x5a6260, edge: 0x655743 },
  'tree-house': { concrete: 0x847c67, metal: 0x525a48, edge: 0x705a3d },
  'cyber-night': { concrete: 0x6b7277, metal: 0x454d57, edge: 0x665c54 },
});

// The approved map artwork remains the distant vista. All geometry here lives
// outside the riding surface, uses the existing lights, and has no collision.
export class ParkForeground {
  constructor(scene, ramp) {
    this.root = new THREE.Group();
    this.root.name = 'park-edge-presentation';
    this.root.userData.visualOnly = true;
    const bounds = ramp.bounds;
    const width = bounds.max.x - bounds.min.x;
    const centerX = (bounds.max.x + bounds.min.x) * 0.5;
    this.materials = {
      concrete: new THREE.MeshStandardMaterial({ color: 0x968e7c, roughness: 0.91 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x5a6260, roughness: 0.57, metalness: 0.65 }),
      edge: new THREE.MeshStandardMaterial({ color: 0x655743, roughness: 0.8 }),
    };
    const apron = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.12, 0.75), this.materials.concrete);
    apron.name = 'front-concrete-apron';
    apron.position.set(centerX, -0.07, bounds.max.z + 0.375);
    apron.receiveShadow = true;
    this.root.add(apron);

    // One instanced draw for four restrained supports, set beyond the authored
    // deck/glass edges rather than duplicating objects painted in the vistas.
    const supports = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.05, 0.65, 8),
      this.materials.metal, 4);
    supports.name = 'apron-edge-supports';
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (const x of [bounds.min.x - 0.25, bounds.max.x + 0.25]) {
      for (const z of [bounds.max.z + 0.12, bounds.max.z + 0.67]) {
        matrix.makeTranslation(x, 0.26, z);
        supports.setMatrixAt(index++, matrix);
      }
    }
    supports.castShadow = true;
    supports.receiveShadow = true;
    this.root.add(supports);

    const strip = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.035, 0.07), this.materials.edge);
    strip.name = 'apron-expansion-edge';
    strip.position.set(centerX, 0.0025, bounds.max.z + 0.74);
    strip.receiveShadow = true;
    this.root.add(strip);
    scene.add(this.root);
    this.unregisterQuality = quality.registerObject(this.root);
  }

  setMap(mapId) {
    const finish = MAP_FINISHES[mapId] || MAP_FINISHES.city;
    for (const [name, color] of Object.entries(finish)) this.materials[name].color.setHex(color);
  }

  dispose() {
    this.unregisterQuality?.();
    this.unregisterQuality = null;
    this.root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    disposeObject3D(this.root);
    this.root.removeFromParent();
  }
}
