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

The camera retains the 2-degree downward frontal angle and its reference
43.750442-degree vertical lens. A permanent viewport cover uses reference aspect
16:9 and scale 1.045; its effective vertical FOV is 42.034138 degrees at 16:9.
Wider viewports receive additional uniform optical crop so they cannot reveal
background gutters beside the graffiti fascia. Native aspect is retained, with
no stretching or geometry masks; narrower viewports crop the sides rather than
moving the camera back.

The effective lens is resolved from the viewport size, then recomputed only on
resize. It stays locked throughout aerials: camera and target translate together
only in Y, while X, Z and angle stay fixed. The vertical-follow cap is 14 m to
retain high-air rider visibility with the tighter ultrawide projection. No
automatic rider-dependent FOV change, ramp-fitting retreat or dolly is allowed.

The prior global-extents check missed the narrower lower portion of the fascia's
outer edge: its top nearly reached the screen edge, but its bottom still left a
visible background strip. The cover corrects the full-height edge, including a
small rasterization margin, and keeps scenery underneath the ramp out of frame.
`check:ramp-edges:browser` checks horizontal slices through actual projected
fascia triangles at five resolutions, rather than relying on one maximum mesh
extent. The check passed on the production build at all five viewport sizes;
each sampled side overscans by at least 0.0237 NDC, above the 0.015 margin.
Flight samples at 10, 18 and 22 m retain identical X/Z, FOV, camera orientation
and apparent unit scale within each viewport, with no browser errors.

All maps share The Gym's direct lights, hemisphere colors, reflection HDRI,
environment orientation/intensity and exposure. Original map artwork, fog and
Japan's separately loaded sunset sky remain unchanged. SCORE/TIME labels and
numbers use the `fire` atlas; trick name and points use the supplied `green` atlas.

Run `npm run check:graffiti-ramp`, `npm run check:camera`,
`npm run check:hud-palettes`, `npm run check:map-lighting`, and
`npm run check:presentation:browser` to verify material semantics, fixed-camera
framing, final coping glow, and full-arena replacements. Run
`npm run check:ramp-edges:browser` for full-height fascia side coverage and
viewport-locked aerial framing.
