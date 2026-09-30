# Gameplay presentation polish

This pass is based on GitHub `main` at `8cf64c7`. Pumping, keyboard/gamepad
mappings, trick eligibility, rotation speed, collision/contact, and scoring
balance are preserved. The simulation remains authoritative.

## Character and board

- Each selected rider calibrates shoe soles from its bind-pose skinned geometry.
- Board-local ankle targets and exact two-bone IK retain contact during riding,
  crouching, spins, Hand Plants, Backflips, landing, and recovery.
- Pelvis height and stance centering accommodate the different avatar proportions.
- Sparse skinned sole probes correct small heel/toe penetration caused by skin
  weights during deep compression, without scanning entire meshes each frame.
- Short body-pose blends absorb state changes; they never delay gameplay input.
- Hand Plant roll inverts toward the lip. The planted wrist anchors the shared
  visual carrier to the coping, without stretching arms or moving simulation contact.
- The existing body-centered Backflip carrier and physics-driven rotation remain.
- Arm solvers use an analytical reach instead of repeated whole-rig CCD passes.

New tricks should continue to pose the body first, then solve contact against
the board. Do not release foot constraints merely because the rider is airborne.

## Feedback, sound, and rendering

- Dimensional skate-style timer/score lettering, combo treatment, award pops,
  readable small-screen layout, and a prominent results score.
- Awards display actual air height and repetition penalties. The original score
  formula is exposed through `TRICK_COMPLETED.scoreBreakdown` and
  `window.__HALFPIPE_FOUNDATION__.hud.lastScoreBreakdown`.
- Rolling pitch/volume follow speed; surface grain follows wheel travel. Rolling
  stops at rest and in air. Landing intensity uses impact velocity with a second
  quieter truck/deck contact.
- The existing daylight HDRI is served locally; see `public/hdri/ATTRIBUTION.md`.
- The current GLB's `FRENTE` material now receives the intended environment
  response. Its authored roughness is preserved. Fine relief adds depth, while
  the existing artwork receives a paint/metal mask rather than uniform metalness.
- Balanced key/fill lighting, normal shadow bias, and quality-managed texture
  filtering. The existing bloom visibility fix remains intact.

## Verification

Passed the production build, static release contracts, existing controller,
V9 gameplay, V15 pumping, character/trick, and V16/V18 browser regressions.
The obsolete test expecting aerial foot contact to release now requires contact.

Runtime inspections covered all ten shipped avatars and the simulation-to-render
Hand Plant, Backflip, and 360 flows on both walls, including fakie and re-entry.
Web Audio checks confirmed zero rolling at rest/in air and increased pitch/gain
at speed. Protected input/simulation/pumping/configuration files were verified
byte-for-byte against the initial `main` snapshot.

For a final feel check, play a normal run with your usual keyboard/controller,
chain a Hand Plant and a Backflip, and compare landing feedback, timer readability,
and rolling audio at different speeds. The final sole-probe refinement was added
after these checks; further playtesting is left to you as requested.
