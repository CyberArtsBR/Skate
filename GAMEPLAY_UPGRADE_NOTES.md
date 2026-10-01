# Halfpipe gameplay and presentation pass

## Current gameplay override

The next owner-directed pass removes the severe head-first Game Over, detached board and all fall/tumble presentation described in the historical sections below. Bails now award no trick points, break the combo and return the rider on the board at exactly 80% speed (air entry speed for an aerial, entry speed for a surface trick). The round continues until its normal timer finishes.

Selective, alpha-safe Unreal Bloom now runs in every graphics preset for tagged wheel and coping emission only; the old GTAO pass is omitted. Wheels glow from 35–85% speed, with maximum emission 3.8; red coping emission is 3.2. Bloom uses reduced-resolution buffers and preserves the photographic background through proper halo alpha.

Skate audio now uses distinct stereo urethane rumble, truck chatter and wind layers, wheel-circumference modulation, distance-triggered panel contacts and six dry resonant deck-impact variants. Rolling fades out in air and during Hand Plant; impacts follow landing intensity. Impact voices are capped at six. These are procedural sound layers, with optional recordings still supported.

The supplied HOW TO RIDE tutorial (`halfpipe-how-to-ride.jpg`) appears in the existing controls step before countdown, with an expandable current-controller guide. A caption clarifies the current no-points / 20% speed penalty and continuing round, superseding the old head-impact warning printed in the supplied artwork.

The bloom composite no longer redeclares Three.js-injected tone-mapping and color-space functions. A composite shader error or rendering exception restores direct scene rendering so the ramp and rider remain visible even when post-processing is unavailable.

No tests, benchmarks or local build were run for this override; Render performs the production build during deployment.

Initial revision: `582126a91fa9b24ac3413818ca3cce1aa9915ffb`.

This pass modifies the existing Chimpions Halfpipe project on `main`. The keyboard/gamepad input mappings, ramp profile, session flow, roster and established California presentation remain in use. The skateboard simulation continues to drive normal riding and tricks; animation follows its state.

## Pumping and low-speed recovery

- Pump acceleration is 16.0 (up from 9.6), with the same 150 ms input buffer. Buffer time expires during air and surface tricks too. GOOD/WEAK/EARLY/LATE force multipliers are 0.90/0.65/0.32/0.32, so correctly directed pumps outside the perfect window still build useful speed; PERFECT remains strongest and wrong-direction braking is unchanged.
- Correct compression can start from zero speed. Direction follows existing movement, the downhill ramp tangent or the remembered travel direction.
- Recovery requires nonzero input matching the current desired pump phase and a valid timing rating. There is no automatic speed grant.
- Additional recovery work is capped at 42 units of kinetic energy per unit mass per side/phase/direction window. A window permits one impulse, with a 320 ms cooldown; button spam does not create a fresh budget.
- Below speed 10, extra acceleration is capped at 9. Impulse rewards taper toward target speed 13. PERFECT/GOOD/WEAK/EARLY/LATE base impulse values are 2.1/1.5/0.65/0.75/0.75; wrong input earns none. Recovery still requires the player's correct pumping direction, and the bail penalty is preserved.
- Velocity gains use `sqrt(speed² + 2 × admittedWork)`, so the limit is an energy budget rather than a teleport to maximum speed.

## Hand Plant and combined aerials

Hand Plant eligibility uses a 320 ms buffer, minimum wall fraction 0.955, maximum coping distance 0.27 and minimum entry speed 0.4. The simulation eases from the approach anchor toward the coping during entry.

The presentation reads the real coping mesh contact point and locks the selected planted hand through the trick. A bounded constraint projection solves measured arm reach and ramp/body clearance together. Head clearance can resolve above the rail or into the open pipe. Two-link arm IK preserves limb length and bends the elbow inward. The former unconditional whole-rider translation to the wrist was removed. Feet retain board-relative IK during successful tricks; the character is not hidden to mask clipping.

Aerial yaw and Backflip roll now run concurrently. Both must complete for a successful combined landing; the larger rotation error controls landing quality. Combined score ranges are the sum of the two trick ranges multiplied by 1.1, then use the existing deterministic height, timing, landing, combo and repetition factors. Facing changes commit only after a successful landing. Backflip direction uses launch facing so aerial yaw does not reverse the flip midair.

An ordinary failed landing captures the actual corrected airborne body pose before the landing resolver resets trick state. A hip-centered tumble preserves that pose for 150 ms, releases into a folded bail pose, then blends back during 55–90% of the existing 1.1 s recovery. The ordinary bail never moves or reparents the board.

## First impact and severe crash

Head, torso/limbs, foot soles and wheel/deck underside probes follow the actual rendered rig and board transforms. The head sphere is calibrated once from weighted head mesh bounds. Swept probes query the finite elliptical ramp, coping and deck; bounded subdivisions and bisection estimate contact order and incoming normal speed.

Each air episode latches its first impact. Contacts within 6 ms favor BOARD/FOOT/BODY over HEAD. A first HEAD contact requires incoming speed at least 3.2 for a severe crash. A minor initial head touch stays minor; a later head touch after a board, foot or body contact cannot promote the ordinary bail. Hand Plant intentional support is exempt from airborne crash detection.

Severe crash state cancels tricks, controls and scoring and breaks the combo. It bypasses normal landing/recovery. `scene.attach()` separates the existing skateboard while preserving its world transform; a hips carrier similarly preserves the body pose. Fixed-step presentation physics gives the board independent launch, spin, rebound and slide, while the body collapses, tumbles and settles against ramp probes. This is bounded procedural crash physics, not a full joint-constrained ragdoll.

The scene and background fade to grayscale over 0.38 s, with a short impact vignette and world-space dust/ring. One ambulance siren starts after 0.3 s. GAME OVER appears after 1.8 s of wall time. Restart/menu cleanup restores the exact board/body parents and transforms and clears crash effects, grayscale, sound and collision state.

## Audio, emissive and VFX

- The previous dynamic rolling/landing audio remains; severe crash mutes rolling and plays one impact plus a delayed, fading siren. Reset, pause/menu and disposal stop its voice.
- Wheel material clones receive a warm emissive ramp from 75% to 95% of the configured speed reference, smoothed with delta time; maximum emissive intensity is 1.25.
- Coping retains its metal response and receives restrained red emission plus a local soft glow shell. No global bloom was introduced.
- Existing pooled effects now include contact-normal carve spray, cyan airflow/trajectory ribbons, rotation-driven aerial/flip trails, and localized severe crash dust/shockwave.
- Trick awards use readable outlined, dimensional skate typography. Combined trick names and severe GAME OVER results are explicit.

## Performance and diagnostics

The VFX pools cap live particle slots at 133 and add one shockwave batch without dynamic lights. Material clones are confined to wheels; head calibration is cached. Contact sweeps, IK and clearance projection use bounded iterations. Debug collider meshes are lazy-created, shared and disabled during normal gameplay. Crash motion uses fixed 1/120 s substeps with bounded frame delta.

No tests, benchmarks, browser checks or local build were run for this pass, at the owner's request. Render deployments run the production build only. The release script detects Render's environment so the existing service command also skips the test suite; manual local release checks remain available.

Rendered appearance, timing feel, avatar-specific Hand Plant clearance, swept contact thresholds and frame performance still require the owner's playtest. Collision uses calibrated proxies and the analytic ramp rather than full triangle collision. The severe crash body is procedural rather than a full articulated rigid-body simulation. No claim of runtime verification is made here.

## Files changed

- Integration/deploy: `src/main.js`, `package.json`, `render.yaml`, `tools/run-release.mjs`.
- Gameplay/scoring: `src/config/gameConfig.js`, `src/gameplay/phase4GameplayConfig.js`, `src/gameplay/HalfpipePumpRecovery.js`, `src/gameplay/SkaterImpactContacts.js`, `src/gameplay/CrashPresentationTuning.js`, `src/halfpipe/HalfpipeSimulation.js`, `src/halfpipe/HalfpipeSimulationPresentation.js`, `src/v9/installHalfpipeV9GameplayPatches.js`, `src/scoring/HalfpipeScoreSystem.js`.
- Character: `src/character/RiderController.js`, `src/character/HandPlantIK.js`, `src/character/HandPlantClearance.js`, `src/character/OrdinaryBailPresentation.js`, `src/character/SkaterCrashPresentation.js`, `src/v16/installHalfpipeV16Patches.js`.
- Ramp/board: `src/halfpipe/HalfpipePresentationBinder.js`, `src/halfpipe/HalfpipeVisual.js`, `src/halfpipe/SkaterImpactDebug.js`, `src/skateboard/SkateboardVisual.js`.
- Audio/effects: `src/audio/HalfpipeAudio.js`, `src/vfx/ArcadeFeedbackTuning.js`, `src/vfx/HalfpipeVFX.js`, `src/vfx/ImpactVFX.js`, `src/vfx/ParticlePool.js`, `src/vfx/SpeedTrailVFX.js`, `src/vfx/crash.css`.
- UI: `src/style.css`, `src/ui/ResultsScreen.js`, `src/ui/TrickFeedback.js`.
- Documentation: `GAMEPLAY_UPGRADE_NOTES.md`.

## Rider workshop and aerial feedback

- Hero selection is a compact workshop with six-column desktop rider cards, three-column mobile cards, a local GLB upload action, board finish swatches and small park previews. The body scrolls separately from the fixed confirmation footer.
- Uploads stay in the browser for the current session. Self-contained GLB 2.0 files up to 40 MB are loaded through the existing Chimpion loader, normalized to rider height and checked for the existing humanoid hips/leg/foot rig slots. Unsupported files report a message and preserve the selected rider. A ready asset is reused when the player confirms; its object URL and unused GPU resources are released when replaced or closed.
- Clicking a rider selects it. Enter/Space activates the focused menu button rather than globally confirming the selection. Only the final Confirm Rider & Park action proceeds into the tutorial/run flow; the existing gamepad confirmation mapping remains available. Duplicate asynchronous confirmations are guarded.
- The chosen board finish recolors every non-wheel mesh, including grip, deck edges and trucks. Base artwork/vertex colors are removed for a solid chosen finish; normal, roughness and metalness details remain. Original restores authored colors and maps. Wheels keep their original colors and speed bloom.
- Aerials and backflips leave brighter, wider paired world-space wind traces and rotating crescents, following actual airborne state and rotation progress. Two fixed instanced pools (64 streaks and 16 arcs) bound allocations and draw calls. Effects fade after landing and respect reduced motion; they do not enter the bloom mask.
- The start prompt reads “Press to Start” with outlined, angled graffiti lettering. Center HUD messages use red for failure/heavy impacts, yellow for intermediate/active-trick information, and green for successful tricks, clean landings and combos.
- No tests, benchmarks or local build were run. Render performs the deployment build; gameplay and visual playtesting remain with the owner.
