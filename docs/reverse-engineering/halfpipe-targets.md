# California Games Half-Pipe — Reverse-Engineering Targets

This document records behavioral targets gathered from the supplied manuals, ROM inspection, and gameplay/video analysis. These are **reference observations**, not final gameplay constants.

## Shared rules observed across ports

- Event duration: approximately 1:15 in NES/SMS-like rulesets.
- Three falls can end the event in classic rulesets.
- Core motion loop is rhythmic pumping through the half-pipe.
- UP is used during ascent / extension.
- DOWN is used during descent / compression.
- Excessively low momentum can trigger a technical crash.
- Main tricks:
  - Kick Turn
  - Hand Plant
  - Aerial Turn

## Observed scoring bands

Treat scoring as ruleset-specific until final calibration.

- Kick Turn: roughly 100–300.
- Hand Plant: official-looking NES/SMS material most consistently indicates roughly 400–700.
- Aerial Turn: roughly 400–999.

Some informal references report different Hand Plant values. Do not collapse those differences until the target ruleset is chosen.

## Failure reasons found in the classic implementations

Observed strings include concepts such as:

- TURNED TOO LONG
- TOO LATE FOR KICK TURN
- HELD ON TOO LONG
- LET GO TOO EARLY
- DIDN'T TURN IN TIME
- TOO SOON FOR KICK TURN
- CAN'T KICK TURN BACKWARDS
- TOO SOON FOR AN AERIAL TURN
- TOO LATE FOR AN AERIAL TURN
- TOO SLOW -- TECHNICAL CRASH

The modern implementation should preserve explicit failure reasons rather than reducing all failures to a single crash boolean.

## SMS controller-overlay observations

One supplied 60 fps Master System expert/high-score recording includes visible controller input.

Measured from that run:

- DOWN -> UP switch happened near the bottom crossing.
- Median switch timing was approximately 17 ms before geometric center crossing.
- Observed spread was on the order of several frames / roughly 50 ms.
- Typical DOWN/compression holds were around 0.8 s.
- Typical UP/extension holds were around 0.6 s.
- Short left/right aerial inputs were commonly around 0.08–0.20 s.

These values come from one expert run and must not be treated as universal constants.

## Observed bottom-crossing cadence

From expert gameplay footage:

- Early / lower-amplitude crossings: approximately 1.69–1.90 s between bottom crossings.
- Higher-amplitude runs: approximately 2.03–2.17 s between bottom crossings.

This is important because it indicates the original behavior is not a constant-speed animation along a U-shaped spline. Higher amplitude introduces more time near/above the walls.

## Port roles for final synthesis

### Master System
Primary reference for:
- pumping rhythm
- controller timing
- passive / active cadence
- technical crash behavior

### NES
Primary reference for:
- trick state machine
- early/late validation windows
- direction validation
- explicit failure reasons

### Genesis / Mega Drive
Primary reference for:
- expanded implementation structure
- scoring/rules variants
- broader event architecture

### Atari Lynx
Primary reference for:
- motion smoothness
- animation cadence
- presentation feel

## Physics calibration policy

The current `GAME_CONFIG.passivePhysics` values are provisional engineering constants only.

Do not tune them to match California Games until the passive contact model is visually stable.

When calibration starts, measure at minimum:

- time from wall release to first bottom crossing
- bottom-crossing interval
- bottom speed
- turning-point X / height
- energy loss per half-cycle
- effect of correct and incorrect pump timing

Calibration should be performed against video/ROM observations, not by feel alone.
