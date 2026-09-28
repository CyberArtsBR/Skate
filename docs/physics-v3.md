# Halfpipe Physics v3

## Phase 3A.1 — deterministic passive contact core

This branch introduces the first authoritative gameplay simulation module:

`src/halfpipe/HalfpipeSimulation.js`

It is intentionally not connected to gameplay input, pumping, tricks, scoring, or air transitions yet.

### Coordinate contract

- `pipeX` is the horizontal parameter used by `HalfpipeProfile`.
- `tangentVelocity` is signed **surface speed** (ds/dt).
- Positive tangent velocity means travel toward increasing world X.
- The HalfpipeProfile tangent is normalized internally to this +X parameter direction before physics uses it.
- Gravity is projected onto that tangent.
- The visual GLB remains non-authoritative.

### Integration

The core uses a 120 Hz fixed step and semi-implicit velocity integration:

1. sample the profile;
2. orient tangent toward increasing X;
3. project gravity onto the tangent;
4. apply temporary linear passive drag;
5. integrate tangent velocity;
6. convert surface speed to horizontal movement with tangent.x;
7. refresh derived telemetry.

The default calibration is deliberately provisional. It exists to prove the contact model and deterministic oscillation before ROM/video tuning.

### Current telemetry

The state exposes:

- mode
- time
- pipeX
- tangentVelocity
- tangentialAcceleration
- region
- direction
- bottomCrossings
- turningPoints
- lipContacts
- distanceTravelled (surface arc distance)
- specificEnergy

### Deliberately absent

Not implemented in 3A.1:

- player input;
- pumping or energy injection;
- kick turns;
- aerial turns;
- hand plants;
- airborne/ballistic motion;
- landing;
- wipeouts;
- technical crash;
- score;
- timer;
- three-fall rule;
- ROM-derived constants.

### Next step

Phase 3A.2 should connect the passive simulation to the existing presentation boundary:

`HalfpipeSimulation -> RiderPresentationState -> HalfpipePresentationBinder -> RiderController`

That integration should remain input-free at first so the rider can visibly oscillate under gravity while passive drag slowly reduces amplitude.


## Phase 3A.2 — simulation-to-rider presentation binding

The passive simulation is now connected to the existing presentation boundary in `src/main.js`.

At runtime:

`HalfpipeSimulation -> simulationToPresentationState() -> HalfpipePresentationBinder -> RiderController`

The mapper derives vertical velocity and ascent/descent flags from signed tangent velocity and the profile tangent. It deliberately injects no pump compression, trick state, landing state, or airborne state.

The render loop consumes real frame time but only advances gameplay through the simulation's 120 Hz fixed-step accumulator. Presentation is updated from the latest authoritative fixed-step state. The skateboard wheel hook consumes signed surface travel, so wheel spin reverses when the rider travels fakie/back toward the left wall.

Developer-only controls during this passive phase:

- `P`: pause/resume passive simulation;
- `R`: reset to the passive starting point and pause;
- `[` / `,`: pause and inspect previous Phase 2 presentation station;
- `]` / `.`: pause and inspect next station;
- `D`: toggle the mathematical profile debug line.

The HUD debug strip shows passive telemetry (pipe X, tangent speed, specific mechanical energy, bottom crossings, and turning points). SCORE and TIME remain placeholders; no game timer or scoring logic has been added.


## Passive calibration pass 1 — video review

The first live preview recording showed a stable deterministic oscillation, but the observed HUD cadence was approximately 3.18–3.20 s between bottom crossings. The current reverse-engineering target for lower-amplitude classic play is approximately 1.69–1.90 s, with higher-amplitude play extending beyond 2 s.

For the next isolated calibration pass, only the gameplay gravity scale is changed from 9.81 to 30 while preserving the existing profile and passive drag. This is a **gameplay-scale acceleration**, not a claim that the game world uses SI-scale real-world gravity.

The 120 Hz reference simulation with the current starting amplitude produces early passive crossing intervals around 1.81 s and gradually lengthens as passive energy decays. Pumping and airtime are still absent, so this remains a contact-model calibration rather than final California Games tuning.


## Visual contact correction — preview screenshot review

The next preview screenshots exposed two presentation problems that are independent of the authoritative passive physics:

1. rotating the imported wheel/axle hierarchy could visibly orbit a wheel/truck piece away from the deck because the source GLB does not guarantee centered wheel pivots;
2. rotating the entire rider root by the ramp tangent made the Chimpion read like a rigid object lying sideways on steep transitions.

Corrections:

- wheel travel is still accumulated, but unsafe GLB wheel transforms are no longer mutated; visual wheel spin stays disabled until safe centered pivots are authored/rebuilt;
- the skateboard and lower body remain aligned to the ramp;
- the upper torso and head now receive partial counter-rotation from the sampled surface angle, improving balance while keeping feet/IK anchored to the deck.

These are presentation-only corrections. They do not change the fixed-step simulation, gravity, drag, crossing cadence, or contact path.


## Contact-aware skateboard support pass

The previous slope-only wall offset could keep the rider body visible while still giving poor confidence that the actual skateboard geometry stayed outside the mathematical riding surface.

The presentation binder now solves clearance from measured skateboard support geometry:

- four wheel-bottom support points are derived from the actual imported wheel meshes;
- the lower nose and tail of the deck are included as additional support points;
- the wheel diameter is measured from the loaded skateboard asset;
- the flat keeps the existing calibrated base clearance;
- transition margin scales from the measured wheel diameter and ramp slope;
- an iterative solver finds the smallest additional displacement along the sampled surface normal that keeps every support point at or above the requested separation.

The old fixed `wallClearance` heuristic has been removed. Runtime diagnostics are exposed through `HalfpipePresentationBinder.lastContact`, including resolved clearance, extra clearance, target/minimum support separation and support-point count.

This is still presentation-only. It does not alter the 120 Hz authoritative passive simulation or its crossing cadence.


## Visual-mesh alignment root cause — right-wall clipping

A direct raycast audit against the rendered halfpipe GLB identified the persistent right-wall skateboard clipping as a visual transform alignment bug, not a failure of the deterministic `HalfpipeProfile` simulation or the contact-aware support solver.

The previous `HalfpipeVisual` loader centered the complete visible GLB from its aggregate bounds. The asset contains asymmetric decorative/support geometry, so that operation changed the authored X transform and shifted the visible riding channel relative to the gameplay profile. Before correction, measured skateboard support penetration against the visible mesh reached approximately:

- LOWER RIGHT: -0.220
- UPPER RIGHT: -0.354
- RIGHT LIP: -0.715

The source GLB is authored with its riding-channel X origin aligned to gameplay X=0. The corrected loader therefore preserves the authored model X transform and continues to use geometry bounds only for the established Y/Z presentation framing. `Object_4` is retained as the measured riding-surface subtree for visual diagnostics; its geometric bounding-box center is intentionally not used as a gameplay or alignment centerline.

After preserving the authored X origin, visible-mesh raycasts at all seven presentation stations are positive. Key measured minimum skateboard support separations are:

- CENTER / FLAT: 0.0149
- LOWER LEFT / RIGHT: 0.0769 / 0.0761
- UPPER LEFT / RIGHT: 0.3364 / 0.3359
- LEFT / RIGHT LIP: 0.3017 / 0.3030

The left/right differences are now negligible. `checks/visual-contact.mjs` raycasts the actual skateboard support points against the rendered riding mesh and guards against negative penetration or asymmetric visual alignment. This remains presentation validation only; gameplay physics stays authoritative on `HalfpipeProfile`.
