# Phase 3 — Simulation decomposition

Phase 3 is a behavior-preserving refactor of the authoritative half-pipe simulation.

## Invariants

- Keep the fixed-step simulation at 120 Hz.
- Keep `HalfpipeProfile` as the authoritative gameplay surface.
- Do not derive gameplay physics from visual GLB geometry.
- Do not redesign motion math while moving ownership.
- Keep `HalfpipeSimulation` as the authoritative coordinator.
- Keep `src/main.js` out of the decomposition work.

## Target responsibilities

The monolithic simulation will be decomposed behind explicit boundaries:

1. `HalfpipeMotionSolver` — profile sampling, contact/air kinematics and motion math.
2. `PumpSystem` — pump intent, timing, work and pump accuracy state.
3. `TrickStateMachine` — surface/aerial/backflip trick state and transitions.
4. `LandingResolver` — landing validation, impact, retention and bail outcomes.
5. `ComboSystem` — trick scoring, repetition, combo multiplier and flow bonuses.
6. `RunStatistics` — read-only run result snapshots.

## Migration rule

Every responsibility is first characterized against the current coordinator, then delegated without changing the player-visible result. The release gate remains the authority for merge/deploy decisions.

## Phase 3A checkpoint

The first checkpoint establishes two pure boundaries without moving runtime authority yet:

- `HalfpipeMotionSolver`
- `RunStatistics`

`checks/phase3-decomposition.mjs` compares those boundaries to the current `HalfpipeSimulation` behavior so later delegation has an exact equivalence contract.
