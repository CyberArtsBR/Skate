# Flying Night

Full 3D map supplied by the user as Downloads/flyingnight.glb, copied byte-for-byte. No JPG backdrop. Embedded ramp subtree determines alignment; gameplay physics and controls remain unchanged. Authored animation clips loop through an AnimationMixer on the GLB scene, updated only for the active map with bounded frame delta. Cached assets and animation bindings are disposed with the game. Uses night lighting and the existing night reflection environment.

Static inspection: 10,825,612 bytes, 1,227 meshes, 21 materials, 17 textures; one Take 001 clip with 206 channels. Embedded metadata preserved. No tests, benchmarks or local build. User review needed for animation, framing, contact alignment and performance given the authored mesh count.
