# Phase 2 Rider Integration

## Skateboard coordinates and measured presentation data

The source skateboard is not modified. `SkateboardVisual` recenters it through wrapper transforms and establishes this runtime convention:

| Meaning | Local direction / value |
| --- | --- |
| Forward / nose | `+X` |
| Rearward / tail | `-X` |
| Lateral | `+Z` |
| Up | `+Y` |
| Regular front foot | left, toward `+X` |
| Regular rear foot | right, toward `-X` |
| Runtime dimensions | about `0.912 × 0.122 × 0.241` |
| Deck top | local `Y ≈ 0.122` |
| Lowest wheel contact | local `Y = 0` |

The asset does not label nose versus tail semantically and is nearly symmetric. `+X` is therefore a stable wrapper convention rather than a destructive source-asset edit. The four wheel objects remain individually discoverable. Front/rear contact helpers average the two wheel contacts on each X side. Truck transforms remain `null` because the source hierarchy does not provide two safe independent truck roots.

## Stance and feet

The initial stance is regular. The Heretic remains side-on to the board travel axis, with a 0.48-unit total stance width, mild knee flex, hips centered over the deck, counter-rotated chest, balance arms and gaze biased toward the nose. Changing `GAME_CONFIG.rider.stance` to `goofy` swaps front/rear foot roles and pose direction without changing the rig adapter.

The foot layer stores the avatar rest pose and measures each foot bone's authored ankle-to-sole offset. Invisible front/rear targets are parented to the skateboard deck. After the base skate pose is rebuilt from rest, bounded CCD corrections rotate only thigh and shin chains toward those targets. The solver uses three small iterations, reduces weight while airborne and reports per-foot error for diagnostics. It does not move bones without resetting first, create bindings, simulate trucks or apply hand IK.

Browser validation at the center and upper-right transition reported maximum ankle-target errors below `0.005` world unit. This is a presentation metric, not a physical contact tolerance.

## Halfpipe binding and debug stations

`HalfpipePresentationBinder` consumes `HalfpipeProfile.sample(pipeX)`. It positions the shared rider/board root from the sampled point plus the upward normal, then rotates the root so board +X follows the surface tangent and board +Y follows the normal. The baked GLB remains visual-only.

The current `0.18` normal clearance compensates for the baked ramp skin sitting visibly above the simplified reference curve at the camera-facing surface. It makes the deck and wheels readable without changing the mathematical profile. This value must be revisited if either the profile or visual asset is retuned.

Station controls:

- `[` or `,`: previous station;
- `]` or `.`: next station;
- `D`: existing profile debug toggle.

The seven stations are center, lower/upper left, left lip vicinity, lower/upper right and right lip vicinity. Lip tests stop at 92% of the transition width so diagnostics do not place the board on the profile's near-vertical endpoint singularity.

## Presentation-state boundary

The accepted state is:

```js
{
  pipeX,
  tangentVelocity,
  ascending,
  descending,
  pumpCompression,
  airborne,
  verticalVelocity,
  rotation,
  landing,
  landingQuality,
  trickType,
  trickProgress,
  speedNormalized,
}
```

Values are normalized before they reach pose code. Static diagnostics supply preview values in Phase 2. Future physics must own and produce this state; presentation code only consumes it.

## Scale and remaining concerns

The runtime board length is about 42% of the 2.15-unit character target height, which is internally plausible for the stylized avatar. The Heretic's short legs and large torso make knee bend less readable than on a human rig, but no camera or halfpipe rescaling was used to hide that limitation.

Before Phase 3, retain these constraints:

- calibrate the profile-to-visual clearance if the ramp/profile changes;
- keep authoritative contacts in future simulation rather than reusing IK errors;
- drive wheel spin from simulation distance only;
- validate the same stance/target strategy before enabling the other nine Chimpions;
- add hand IK only with the future hand-plant trick work.
