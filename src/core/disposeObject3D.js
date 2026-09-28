export function disposeObject3D(root) {
  if (!root) return;

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();

  root.traverse((object) => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    if (object.skeleton?.dispose) skeletons.add(object.skeleton);

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of objectMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.dispose) textures.add(value);
      }
      for (const uniform of Object.values(material.uniforms || {})) {
        if (uniform?.value?.isTexture && uniform.value.dispose) {
          textures.add(uniform.value);
        }
      }
    }
  });

  for (const skeleton of skeletons) skeleton.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
