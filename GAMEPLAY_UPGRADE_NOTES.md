# Halfpipe gameplay and presentation pass

Initial revision: `582126a91fa9b24ac3413818ca3cce1aa9915ffb`.

This pass modifies the existing Chimpions Halfpipe project on `main`. The keyboard/gamepad input mappings, ramp profile, session flow, roster and established California presentation remain in use. The skateboard simulation continues to drive normal riding and tricks; animation follows its state.

## Pumping and low-speed recovery

- Pump acceleration is 9.6, with a 150 ms input buffer. Buffer time expires during air and surface tricks too.
- Correct compression can start from zero speed. Direction follows existing movement, the downhill ramp tangent or the remembered travel direction.
- Recovery requires nonzero input matching the current desired pump phase and a valid timing rating. There is no automatic speed grant.
- Additional recovery work is capped at 24 units of kinetic energy per unit mass per side/phase/direction window. A window permits one impulse, with a 320 ms cooldown; button spam does not create a fresh budget.
- Below speed 10, extra acceleration is capped at 6. Impulse rewards taper toward target speed 13. PERFECT/GOOD/WEAK/EARLY/LATE base impulse values are 1.4/0.95/0.35/0.45/0.45; wrong input earns none.
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
