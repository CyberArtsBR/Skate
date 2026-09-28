# Phase 1 Architecture

## 1. Scene architecture

`src/main.js` is the composition root. It creates a transparent Three.js renderer over a DOM background, then assembles independent scene services:

```text
DOM stage
├─ background layer (replaceable CSS/image layer)
├─ WebGL canvas
│  ├─ replacement ground
│  ├─ HalfpipeVisual
│  ├─ RiderController
│  │  ├─ SkateboardVisual
│  │  └─ ChimpionLoader + RiderRigAdapter
│  └─ HalfpipeDebug (hidden by default)
├─ presentation vignette
└─ HalfpipeHUD
```

The render loop only renders the current scene. There is no gameplay simulation, timer update, score update, collision step or camera tracking in Phase 1.

The stage is CSS-constrained to 16:9 and letterboxes naturally. `HalfpipeCamera` owns a fixed perspective camera whose composition keeps the whole pipe and vertical air space visible. The camera stays on the halfpipe center axis (`x = 0`) with zero roll, producing the symmetric, near-front elevation used by the visual reference instead of an oblique three-quarter view. Resize only updates renderer size, pixel ratio and camera aspect.

## 2. Visual halfpipe versus future authoritative physics

`HalfpipeVisual` loads and presents the GLB. It may hide explicitly identified visual subtrees, currently only `halfpipe-ground_Baked_1`. It is tagged `visualOnly` and exposes bounds for framing, but its triangles are not a gameplay collision contract.

`HalfpipeProfile` is a separate, deterministic-friendly 2D representation. Its current elliptical transition is a reference profile, not final tuning. It already exposes:

- left transition;
- flat bottom;
- right transition;
- left/right lip coordinates;
- point sampling;
- normalized surface tangent;
- normalized surface normal.

`HalfpipeDebug` visualizes that profile at the near edge of the pipe and is toggled with `D`. Later phases can replace the placeholder profile parameters or the profile implementation without changing the GLB loader. Conversely, artists can replace the GLB without silently changing gameplay.

Future physics should consume only a stable profile/simulation interface and publish presentation state to the render layer. It should never raycast the baked GLB as the authoritative ramp.

## 3. Skateboard visual hierarchy

`SkateboardVisual` loads the source GLB, applies a wrapper scale, recenters X/Z, and aligns its lowest bound with local Y=0. It exposes:

- `root`: presentation transform owned by `RiderController`;
- `deck`: the discovered `Board1` mesh;
- `wheels`: four distinct wheel objects;
- `contactPoints`: bottom-center helper positions for the four wheels;
- `rotateWheels(distance)`: a future visual-only wheel rotation hook;
- `frontTruck` and `rearTruck`: deliberately `null` because the source hierarchy cannot expose two safe independent transforms.

No rigid bodies or wheel physics exist. Future simulation should publish board position/orientation and traveled distance; the wrapper may then update visual transforms and wheel spin.

## 4. Character donor architecture

The representative Chimpion is `The Heretic`. `ChimpionLoader` is responsible only for GLB loading, material safety adjustments, shadow flags, spatial fitting and presentation orientation.

`RiderRigAdapter` is a reduced compatibility layer derived conceptually from the donor's `avatarCompatibility.js` and rider rig path. It:

- resolves semantic slots from common CC/Mixamo-style bone names;
- validates the required hips/legs/feet foundation contract;
- records rest quaternions;
- exposes rig capabilities;
- applies a small, reset-from-rest sideways foundation pose;
- provides a hook for later procedural presentation inputs.

`RiderController` owns the shared presentation transform for board and rider, places the Chimpion above the deck, and forwards presentation-state changes. It is intentionally not a physics controller.

## 5. Reused concepts from `Chimpions-Ski`

Inspected donor: `CyberArtsBR/Chimpions-Ski`, `main` commit `2b681bbeed8857ad7787d60f4242628b8dc9804c`.

Concepts retained:

- Three.js 0.180.0 and modern Vite/ES-module structure;
- `GLTFLoader`-based character loading;
- a semantic humanoid rig adapter instead of hard-coded object paths;
- required-versus-optional rig capability checks;
- rest-pose-based procedural pose updates;
- a visual carrier separate from gameplay transform axes;
- snowboard/skate side-stance reasoning;
- safe traversal-based GLB disposal;
- future-ready state-to-pose boundary.

Phase 1 code is reduced and purpose-built for this repository. The donor's full player implementation was not copied.

## 6. Deliberately not reused

The following donor systems are absent:

- downhill ski physics and speed progression;
- mountain/course generation and streaming;
- terrain collision and contact authority;
- snow, weather, hazards and environmental gameplay;
- ski/snowboard procedural equipment;
- trick and scoring systems;
- game flow, countdown and results screens;
- dynamic camera systems;
- complete rider animation state machine, IK and clip blending;
- the avatar selector and remaining nine Chimpions.

These exclusions prevent ski-game assumptions from becoming accidental halfpipe contracts.

## 7. Hooks for future physics

Prepared boundaries for Phase 2 and later:

- `HalfpipeProfile.sample(x)` returns position classification, tangent and normal.
- `RiderController.setPresentationState(state)` forwards simulation-derived pose values without owning simulation.
- `RiderRigAdapter.applyFoundationPose(state)` is the insertion point for pump compression, ascent, air, landing and trick pose parameters.
- `SkateboardVisual.rotateWheels(distance)` accepts traveled distance without simulating wheel dynamics.
- `SkateboardVisual.contactPoints` exposes visual helpers that may support diagnostics, not authoritative collision.
- `HalfpipeCamera` is isolated so later restrained vertical framing can be added without coupling to rider physics.
- `createBackground().setImage(url)` can accept the edited California/Hollywood plate without changing the 3D scene.
- `HalfpipeHUD.setScore()` and `setTime()` are presentation-only; current values remain static placeholders.

The future simulation should have its own fixed-step state, input sampling and deterministic update loop. That work is intentionally outside this checkpoint.

## 8. Replaceable event background

The beach/palm Urban Sports plate is stored at `public/images/backgrounds/urban-sports-beach.jpg` and configured through `GAME_CONFIG.assets.background`. It is not part of the Three.js scene and is not baked into the halfpipe geometry.

`createBackground()` owns a DOM layer below the transparent WebGL canvas. It preloads the configured image, preserves its aspect ratio with CSS `background-size: cover`, and exposes `setImage(url, position)` for future swaps. The stage is fixed to 16:9 and the source plate is also approximately 16:9, so the current composition needs only negligible cover cropping and no stretching. A restrained grade overlay darkens the upper HUD region and lower foreground without permanently modifying the source image.

To replace the backdrop later:

1. add the new image under `public/images/backgrounds/`;
2. change `GAME_CONFIG.assets.background`;
3. adjust the optional position passed to `createBackground()` only if the new plate has a different visual center.

The independent 3D ground remains in the scene as a transparent `ShadowMaterial` receiver. This preserves real-time grounding shadows while allowing the photographed venue floor to remain visible through the WebGL canvas. The retained grid helper is disabled for presentation and can still be enabled later for diagnostics.
