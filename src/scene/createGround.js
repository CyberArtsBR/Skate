import * as THREE from 'three';

export function createGround(scene) {
  const geometry = new THREE.PlaneGeometry(58, 42);
  const material = new THREE.ShadowMaterial({
    color: 0x241810,
    opacity: 0.2,
  });
  material.depthWrite = false;
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'replacement-ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(42, 14, 0xb49c84, 0x8f8172);
  grid.name = 'replacement-ground-grid';
  grid.position.y = -0.022;
  grid.material.transparent = true;
  grid.material.opacity = 0.045;
  grid.visible = false;
  scene.add(grid);

  return {
    ground,
    grid,
    dispose() {
      scene.remove(ground, grid);
      geometry.dispose();
      material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
    },
  };
}
