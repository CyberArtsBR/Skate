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
