# Phase 1 Asset Audit

Audit date: 2026-09-28
Method: static GLB inspection with `@gltf-transform/core` 4.5.0 and bounds evaluation with Three.js 0.180.0. The source GLBs were not modified. The specialized `game-dev` CLI was not available on this machine, so no Blender/GPU-import claim is made by this static audit.

## `skateboard.glb`

- Source size: 3,690,988 bytes (about 3.52 MiB).
- Scene: `Sketchfab_Scene`.
- Content: 55 nodes, 25 meshes/primitives, 1 material, 3 embedded textures, no skin, no animation.
- World bounding box:
  - min: `[-4.88576, -1.09464, -1.30981]`
  - max: `[4.71131, 0.19210, 1.22734]`
  - dimensions: `[9.59706, 1.28674, 2.53716]`
  - center: `[-0.08723, -0.45127, -0.04123]`
- Root orientation: `Sketchfab_model` has a -90 degree X rotation and its FBX child has the corresponding +90 degree X rotation. Their effective transform restores a Y-up asset.
- Long/rolling axis: X. The deck is about 9.60 source units long on X and 2.54 source units wide on Z. Runtime scale is `0.095`, producing an approximately 0.91-unit board.
- Pivot/origin: the authored origin is not at the geometric center or wheel contact plane. The runtime wrapper recenters X/Z and lifts the lowest bound to local Y=0 without editing the GLB.

### Hierarchy and parts

Condensed hierarchy:

```text
Sketchfab_model
└─ 39aa9f2a764d40c1be4cbca7fa4ca616.fbx
   └─ RootNode
      ├─ group4
      │  ├─ group8
      │  │  └─ first axle assembly meshes
      │  └─ second axle assembly meshes
      └─ Board1
         └─ Board1_StingrayPBS1_0
```

- Deck: separate mesh `Board1_StingrayPBS1_0`.
- Wheel geometry: four distinct mesh instances. The wheel meshes use the duplicated names `pPipe9_StingrayPBS1_0` and `pPipe13_StingrayPBS1_0`, once per axle. Their bounds are about `0.759 × 0.759 × 0.453`, with centers near X `+2.462` and `-2.687`, Z `+/-0.935`.
- Individual wheel rotation: technically possible because the four wheel objects are separate. Names are duplicated, so runtime discovery uses all matching objects instead of `getObjectByName()`.
- Trucks: composed of separate pipes/cylinders/cubes, but the authored hierarchy is asymmetric. One axle is under `group8`; the other is directly under `group4`, which also owns `group8`. There is no safe independent rear-truck transform. Phase 1 therefore exposes the four wheels and contact helpers but deliberately leaves `frontTruck` and `rearTruck` as `null` rather than returning misleading mutable transforms.
- Contact points: generated from the bottom-center of each discovered wheel bound and exposed by `SkateboardVisual`.

### Materials and textures

- One shared, double-sided opaque material: `StingrayPBS1`.
- Embedded PNG textures:
  - base color: 1,350,057 bytes
  - metallic/roughness: 696,893 bytes
  - normal: 1,133,802 bytes
- The asset uses a conventional PBR texture set. It does not depend on baked scene lighting.

## `halfpipe_skatepark_ramp_-_low_poly_baked.glb`

- Source size: 1,393,944 bytes (about 1.33 MiB).
- Scene content: 11 nodes, 4 meshes/primitives, 4 materials, 3 embedded textures, no skin, no animation.
- Full source bounding box:
  - min: `[-18.12430, 0, -14.57572]`
  - max: `[18.12430, 8.64292, 14.57572]`
  - dimensions: `[36.24860, 8.64292, 29.15144]`
  - center: `[0, 4.32146, 0]`
- Root orientation: the outer `Sketchfab_model` has a -90 degree X rotation; `GLTF_SceneRootNode` has the corresponding +90 degree X rotation. Effective presentation is Y-up.
- The authored origin sits on the ground plane at Y=0. The runtime wrapper hides the source ground, then centers only visible ramp content on X/Z and places its lowest visible bound at Y=0.

### Hierarchy and identified components

```text
Sketchfab_model
└─ root
   └─ GLTF_SceneRootNode
      ├─ halfpipe.001_Baked_0
      │  └─ Object_4        main ramp/structure
      ├─ halfpipe-ground_Baked_1
      │  └─ Object_6        source ground plane
      ├─ halfpipe-coping.002_2
      │  └─ Object_8        coping/rail mesh
      └─ halfpipe-ramp.glass.002_3
         └─ Object_10       transparent glass/rail structure
```

Component bounds:

| Component | Dimensions | Center | Interpretation |
| --- | --- | --- | --- |
| `Object_4` | `21.8793 × 6.6429 × 16.4610` | `[1.0000, 3.3215, 0.6192]` | Baked main halfpipe, riding surface, platforms and opaque supports |
| `Object_6` | `36.2486 × 0 × 29.1514` | `[0, 0, 0]` | Flat source ground only |
| `Object_8` | `15.9386 × 0.1553 × 16.4696` | `[-0.0008, 6.6223, 0.6485]` | Coping/rail element |
| `Object_10` | `21.8793 × 8.6429 × 16.4610` | `[1.0000, 4.3215, 0.6192]` | Transparent glass/rail structure; not safe to hide without visual review |

- Safe hide decision: only the named parent `halfpipe-ground_Baked_1` is hidden. This is a dedicated zero-thickness ground mesh and can be excluded without damaging the ramp.
- Riding surface: baked into `halfpipe.001_Baked_0`; it is not an independent semantic mesh.
- Platforms/supports: also appear baked into the main opaque mesh, with additional transparent rail/glass geometry in `halfpipe-ramp.glass.002_3`. They are preserved.
- Coping: independently named and preserved.

### Materials, textures and baked-lighting assumptions

- `halfpipe.001_Baked`: double-sided opaque, one embedded JPEG base-color texture (778,234 bytes).
- `halfpipe-ground_Baked`: double-sided opaque, one embedded JPEG base-color texture (595,308 bytes).
- `Rail_Metal`: double-sided opaque, no texture; despite its name, the authored metallic factor is 0.
- `Glass`: single-sided alpha-blended, one tiny embedded PNG (235 bytes).
- The `_Baked` naming and base-color-only ramp/ground materials strongly indicate baked shading/detail in the albedo. Runtime lights are intentionally broad and restrained so they do not fight the baked look. There are no normal or metallic/roughness textures on the ramp.

## Representative Chimpion: `The Heretic.glb`

- Donor: `CyberArtsBR/Chimpions-Ski`, `main` at inspected commit `2b681bbeed8857ad7787d60f4242628b8dc9804c`.
- File size: 1,604,068 bytes (about 1.53 MiB).
- Bounds: `0.86584 × 0.99786 × 0.63390` source units.
- Content: 78 nodes, 6 meshes, 3 materials, 1 embedded JPEG texture, 1 skin with 72 joints, no animation clips.
- Rig: CC-style humanoid names (`CC_Base_Hip`, `CC_Base_Spine01`, `CC_Base_L_Thigh`, `CC_Base_R_Foot`, and so on). All Phase 1 required hips/leg/foot slots resolve successfully through `RiderRigAdapter`.
- Runtime fitting: scaled to 2.15 world units, centered on X/Z, and aligned to local floor Y=0.
- Presentation orientation: the game travel axis is X while the Chimpion source faces +Z. Keeping +Z facing produces the required sideways skate stance without rotating gameplay axes.

## Phase 1 limitations

- Static inspection does not prove Blender import, GPU rendering, artistic correctness or physical dimensions.
- Skate truck hierarchy is not suitable for independent truck transforms without introducing wrapper pivots or re-authoring the model.
- The halfpipe riding surface is not semantically separated from platforms/supports; it must remain visual-only.
- The glass component needs browser visual validation before any future decision to hide or alter it.
- No source GLB has been normalized, re-exported or destructively edited.
- The inspected donor checkout did not contain a root `LICENSE`, `COPYING` or `NOTICE` file. The Chimpion comes from the same requested CyberArtsBR donor, but its distribution/provenance should be confirmed before a public release.
