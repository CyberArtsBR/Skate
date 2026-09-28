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
