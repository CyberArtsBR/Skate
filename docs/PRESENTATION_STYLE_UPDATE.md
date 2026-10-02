# Red coping glow, supplied graffiti lettering and aerial tuck

Implemented locally on 2 October 2026 over `main` at `9bec11c`.

## Lettering

The five alphabet sheets supplied by the owner are rendered as bitmap glyphs. The light sheet backing is removed during asset preparation, leaving the original painted letters, outlines, bevels and drips on transparency. No replacement typeface is used for the requested display text.

- SCORE and score numbers: yellow/red (`fire`).
- TIME label and time numbers: yellow/red (`fire`), including the final ten seconds.
- Trick name and trick points: blue/purple (`cyan`).
- Press to Start: yellow-to-red.
- Congratulations: green; other podium messages retain their gold/red rank distinction.
- Final score, best trick and podium score numbers also use the supplied artwork.

Meter details, combo, SKETCHY, BAIL, landing-quality and action/status messages retain the existing presentation. Requested display text and podium score labels have transparent backgrounds. Visible canvas artwork is paired with the original accessible text, preserving DOM text values. Text only redraws on value/palette or layout changes; temporary trick glyphs release their resize observers when replaced.

The cyan sheet contains `%` in place of `9`. Its missing nine uses the silhouette from the owner's gold sheet, recolored cyan/purple. Missing `+` and `°` symbols are drawn to match the palette. `tools/prepare-graffiti-font.mjs` reproduces the transparent atlases from the original supplied PNGs.

## Coping

The final runtime coping uses the authored physical rail mesh with red selective bloom (emissive intensity 3). The detached local halo quads are removed by the runtime patch to avoid trails. Wheels retain their existing bloom. The authoritative riding surface, contact bounds and physics remain independent of this effect.

## Aerial turns and backflip

Both use a compact tuck with approximately 109 degrees of knee flexion, torso folding toward the knees and both hands downward. The pose is held through successive aerial yaw segments and opens near landing. Foot IK keeps both feet attached to the board. The final V16 pose override was removed so it cannot replace the new crouch with the older shallower pose. The existing body-centered backflip axis and gameplay timing are preserved.

## Verification

Focused checks are available as:

```text
npm run check:coping-glow
npm run check:aerial-tuck
npm run check:camera
npm run check:hud-palettes
npm run check:map-lighting
npm run check:presentation:browser
```

The browser check requires a running local Vite server (default `http://localhost:5173`, overridable with `HALFPIPE_PREVIEW_URL`). It exercises the real title, selection, start prompt, HUD updates, low timer, responsive/high-contrast UI, rendered character poses, results, winners podium and full 3D arenas. Captures and numerical evidence are saved under `artifacts/presentation-style/`.

The ten-rider geometric test checks the actual shipped skeletons at different facing angles and inverted backflip poses. It passed on all ten riders; the largest measured foot-target error was 0.00000353 m. The final browser check passed on Tree House, The Gym and Japan, confirming transparent lettering, responsive/high-contrast layout, hands below shoulders and sub-millimeter foot-target error, with no JavaScript, shader or asset errors. The final HUD, start prompt, podium, small-screen, aerial-turn/backflip and arena captures were also visually reviewed. The production build and `git diff --check` passed. Numerical IK accuracy alone does not establish the quality of a skinned animation.

Two older gameplay checks already fail on unmodified `9bec11c`: `trick-presentation.mjs` at line 165 (Hand Plant eligibility below the coping), and `v9-gameplay-regressions.mjs` at line 192 (pumping amplitude recovery). The same failures were reproduced using a separate `git archive HEAD src checks` snapshot under `artifacts/head-baseline-9bec11c-air-pose/`. These presentation changes do not repair those earlier gameplay assertions.

The corrected camera/HUD/light browser check passed on Space, The Gym and
Japan. It verifies side/bottom framing against the actual graffiti mesh,
fixed X/Z/FOV and constant apparent scale through 10/14/18/22 m aerial tracking,
the requested six font palettes, and the composed Gym lights on all eight maps.
Japan's sunset background remains a separate texture at its original rotation.

`check:static` still reports two pre-existing release-contract mismatches:
its old approved-background path and single-material coping regex. Both were
reproduced unchanged on `9c10fe3` in a local git-archive baseline before this
correction; the contracts were not weakened to hide them. The focused asset,
camera, HUD, lighting and aerial checks pass independently.
The direct `phase4-integration.mjs` assertion that the release runner execute
`check:gameplay` also fails identically on that unchanged baseline (line 37).
Visual and numerical contact checks passed; this correction does not change
the authoritative physics or repair the older release-runner contract.
