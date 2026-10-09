# Red coping glow, supplied graffiti lettering and aerial tuck

Implemented locally on 2 October 2026 over `main` at `9bec11c`.

## Lettering

The five alphabet sheets supplied by the owner are rendered as bitmap glyphs. The light sheet backing is removed during asset preparation, leaving the original painted letters, outlines, bevels and drips on transparency. No replacement typeface is used for the requested display text.

- SCORE and score numbers: yellow/red (`fire`).
- TIME label and time numbers: yellow/red (`fire`), including the final ten seconds.
- Trick name and trick points: green (`green`), per the latest owner request.
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
npm run check:ramp-edges:browser
```

The browser check requires a running local Vite server (default `http://localhost:5173`, overridable with `HALFPIPE_PREVIEW_URL`). It exercises the real title, selection, start prompt, HUD updates, low timer, responsive/high-contrast UI, rendered character poses, results, winners podium and full 3D arenas. Captures and numerical evidence are saved under `artifacts/presentation-style/`.

The ten-rider geometric test checks the actual shipped skeletons at different facing angles and inverted backflip poses. It passed on all ten riders; the largest measured foot-target error was 0.00000353 m. The final browser check passed on Tree House, The Gym and Japan, confirming transparent lettering, responsive/high-contrast layout, hands below shoulders and sub-millimeter foot-target error, with no JavaScript, shader or asset errors. The final HUD, start prompt, podium, small-screen, aerial-turn/backflip and arena captures were also visually reviewed. The production build and `git diff --check` passed. Numerical IK accuracy alone does not establish the quality of a skinned animation.

Two older gameplay checks already fail on unmodified `9bec11c`: `trick-presentation.mjs` at line 165 (Hand Plant eligibility below the coping), and `v9-gameplay-regressions.mjs` at line 192 (pumping amplitude recovery). The same failures were reproduced using a separate `git archive HEAD src checks` snapshot under `artifacts/head-baseline-9bec11c-air-pose/`. These presentation changes do not repair those earlier gameplay assertions.

The camera/HUD/light browser check for the earlier `5ed1bf4` correction passed
on Space, The Gym and Japan. It verified global side/bottom mesh extents,
fixed X/Z/FOV and constant apparent scale through 10/14/18/22 m aerial tracking,
the requested six font palettes, and the composed Gym lights on all eight maps.
Japan's sunset background remains a separate texture at its original rotation.
Those historical passes did not prove full-height fascia coverage: the global
horizontal extent came from the upper edge, while the lower outer edge remained
inside the viewport and exposed thin background gutters.

## Side-gutter camera correction

The reference camera angle remains 2 degrees, with physical X/Z unchanged and
vertical-only camera/target following. The reference lens is 43.750442 degrees;
`viewportCover` uses reference aspect 16:9 and scale 1.045, producing an effective
42.034138-degree vertical FOV at 16:9. The uniform cover crop also compensates for
wider viewport ratios without stretching the scene or adding geometry masks.
The effective lens is recomputed only on resize and stays locked during every
flight; no airborne dolly, retreat or rider-dependent lens change is introduced.
The Y-follow cap is 14 m, preserving high-air visibility with the tighter wide
projection. Lighting, HUD palettes, ramp geometry and physics are unchanged by
this side-gutter correction.

The new `npm run check:ramp-edges:browser` checks horizontal slices through the
actual projected graffiti-fascia triangles, including the narrower lower outer
edge and a rasterization margin. Its five viewport sizes are 1600 x 900,
2879 x 1613, 2879 x 1216, 2560 x 1080 and 640 x 400. It also checks fixed
X/Z and viewport-locked lens/apparent scale through aerial following. Evidence
and captures are written to `artifacts/ramp-edge-cover/`. The check passed on the
production build at all five sizes with no browser errors. The minimum measured
side overscan was 0.0237 NDC, exceeding the 0.015 rasterization margin. X/Z, FOV,
orientation and apparent scale remain fixed at 10/18/22 m in each viewport.
The 2879 x 1613 and 2879 x 1216 base captures were visually reviewed, confirming
paint reaches both viewport edges without outside-fascia background gutters.

The full presentation browser check also passed on the final production build,
including the green trick name and green trick points, with no JavaScript,
shader or asset errors.

`check:static` still reports two pre-existing release-contract mismatches:
its old approved-background path and single-material coping regex. Both were
reproduced unchanged on `9c10fe3` in a local git-archive baseline before this
correction; the contracts were not weakened to hide them. The focused asset,
camera, HUD, lighting and aerial checks pass independently.
The direct `phase4-integration.mjs` assertion that the release runner execute
`check:gameplay` also fails identically on that unchanged baseline (line 37).
Visual and numerical contact checks passed; this correction does not change
the authoritative physics or repair the older release-runner contract.

## Portals synchronization and production

The presentation commit `24f613d` was fast-forwarded into `main` and pushed to GitHub. Render automatically deployed that exact commit to `https://chimpions-halfpipe.onrender.com` and reported it live. The production presentation browser check passed, including Tree House, The Gym and Japan, with HTTP 200 and no JavaScript, shader or asset errors. Its evidence is separate from local captures in `artifacts/presentation-production/`.

This Portals branch merges `main` into `portals/fresh-v2`, preserving the existing underscored character/music filenames and bundle-root asset resolution. The new DOM font images use `publicAssetUrl`, since Three.js loader URL modifiers do not intercept DOM images. Audio uses the latest main manifest behavior with Portals-compatible paths; the environment retains both the existing URL helper and main's EXR loader. The default Portals Vite base is now `./`, so `npm run build` generates relative entry URLs without requiring shell-specific passthrough arguments.

The aerial-tuck and rig checks resolve filenames from the runtime roster. The nested-host check is available as `npm run check:portals-presentation` after a build: it serves assets below `/portal-game/` while the document is at `/host/preview` with no trailing slash, and checks all five font palettes, transparency, boot/title artwork, a running session, asset paths and both red halos. Evidence is saved in `artifacts/portals-presentation/`.
