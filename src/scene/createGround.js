import * as THREE from 'three';

export function createGround(scene) {
  const geometry = new THREE.PlaneGeometry(72, 56);
  const material = new THREE.MeshStandardMaterial({
    color: 0x68706f,
    roughness: 0.94,
    metalness: 0.01,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'replacement-ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(54, 18, 0x8b9490, 0x78817e);
  grid.name = 'replacement-ground-grid';
  grid.position.y = -0.022;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
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
