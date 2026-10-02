# Japan full 3D arena

Replaces Flying Night in the arena selector. User-supplied Downloads/japan.glb copied unchanged, with embedded textures, metadata and animation preserved. Uses the existing full-map loader, daylight lighting and looping animation lifecycle. Authored duplicate ramp node names are resolved by source metadata for riding-surface and coping roles. No JPG background; physics and controls unchanged.

Static inspection: 76 meshes, 20 materials, 9 textures, one skin and one Take 001 animation clip. No tests, benchmarks or local build. User visual review required for framing, animation, lighting and contact.

The supplied GLB has no exported world HDRI or KHR_lights_punctual lights. Japan uses the existing local daylight HDRI for illumination/reflections, a pale blue sky background, and balanced daylight key/fill lighting. Exact Blender world matching requires the separate source HDR/EXR.
