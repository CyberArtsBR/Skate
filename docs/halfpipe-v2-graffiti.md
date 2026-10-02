# Canonical halfpipe version 2

`public/models/halfpipe/halfpipe2.glb` is the graffiti edition used by the game,
including replacement of the embedded ramp in Gym and Japan. The original
`public/models/halfpipe/halfpipe.glb` remains archived and is not the active ramp.

The front material `FRENTE.001` contains opaque JPEG base color, using
`TEXCOORD_1`, metalness 0 and roughness 0.85. Do not apply the legacy reflective
metal-front override to this painted surface. Coping is still prepared separately
by the red-emission presentation pass; the ramp geometry and collision profile
are unchanged.

JPEG conversion reduced the graffiti GLB from 4,472,308 to 1,630,868 bytes.
The artwork changed from 3,723,219-byte PNG to 881,784-byte JPEG, keeping its
1254 x 1254 resolution. This reduces transfer size, not decoded GPU texture size.
Do not use JPEG for the glass alpha texture.

Editable local source and originals are preserved in
`artifacts/halfpipe2-baked/`: `halfpipe2-graffiti-jpg.blend`,
`frente-graffiti.jpg`, the prior PNG edition, and original procedural bake.

The game camera uses a fixed 43.750442-degree vertical FOV and a 2-degree
downward frontal angle. At 16:9, the complete structure reaches the side edges
and its frontage reaches the bottom edge, without showing scenery underneath.
The wider fixed lens reproduces the reference's front/back coping perspective.
During aerials, camera and target translate together only in Y: X, Z, angle and
FOV never change. No automatic ramp-fitting retreat or zoom is allowed. Native
viewport aspect is retained; narrower aspect ratios crop the sides instead of
moving the camera back.

All maps share The Gym's direct lights, hemisphere colors, reflection HDRI,
environment orientation/intensity and exposure. Original map artwork, fog and
Japan's separately loaded sunset sky remain unchanged. SCORE/TIME labels and
numbers use the `fire` atlas; trick name and points use `cyan`.

Run `npm run check:graffiti-ramp`, `npm run check:camera`,
`npm run check:hud-palettes`, `npm run check:map-lighting`, and
`npm run check:presentation:browser` to verify material semantics, full-ramp
framing, final coping glow, and full-arena replacements.
