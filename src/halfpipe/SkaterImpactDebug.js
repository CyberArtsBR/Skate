import * as THREE from 'three';

export class SkaterImpactDebug {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'skater-impact-proxy-debug';
    this.root.visible = false;
    this.geometry = new THREE.SphereGeometry(1, 10, 7);
    this.materials = Object.fromEntries(Object.entries({ HEAD: 0xff5f48,
      BODY: 0xffd46c, FOOT: 0x6de4ed, BOARD: 0xe8f2ff }).map(([type, color]) =>
      [type, new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false, transparent: true, opacity: 0.7 })]));
    this.meshes = [];
    scene.add(this.root);
  }

  update(probes = [], visible = false) {
    this.root.visible = visible;
    if (!visible) return;
    probes.forEach((probe, index) => {
      if (!this.meshes[index]) {
        const mesh = new THREE.Mesh(this.geometry, this.materials.BODY);
        mesh.renderOrder = 100;
        this.root.add(mesh);
        this.meshes.push(mesh);
      }
      const mesh = this.meshes[index];
      mesh.visible = true;
      mesh.material = this.materials[probe.type] || this.materials.BODY;
      mesh.position.set(probe.position.x, probe.position.y, probe.position.z);
      mesh.scale.setScalar(Math.max(0.025, probe.radius));
    });
    for (let index = probes.length; index < this.meshes.length; index++) this.meshes[index].visible = false;
  }

  dispose() {
    this.root.removeFromParent();
    this.geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
