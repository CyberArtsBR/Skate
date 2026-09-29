# Phase 4 release checklist

Use this checklist for every Phase 4 integration candidate. A release is not ready while any required automated gate is red.

## Automated gates

- Run npm ci from the committed lockfile.
- Run npm run check:release. This is the Render-safe gate and includes static/source contracts, physics, contact, session, controller, camera, trick presentation, and the production build.
- Run npm run check:release:browser in CI with Playwright Chromium. This includes production browser smoke, the existing deep browser smoke, and visual-contact regression.
- Run npm run check:security and review any high/critical npm audit findings before release.
- Do not bypass visual-contact after halfpipe, skateboard, contact-clearance, scale, or alignment changes.

## Gameplay and physics

- 120 Hz fixed-step profile remains authoritative.
- Takeoff is continuous at both lips; no visible teleport or snap.
- currentAirPeak never exceeds runMaxAir and both reset correctly between runs.
- Under/valid/over aerial rotation classifications match gameplay rules.
- Clean/sketchy/bail landing classifications are deterministic.
- Bail/recovery cannot deadlock the session.
- Combo state and results statistics reset cleanly.
- Right-wall support points do not penetrate the visible riding surface.
- Left/right visual-contact separation remains symmetric.

## Controls and flow

- Keyboard and controller can start, pause, resume, restart, and reset safely.
- Controller reset is edge-triggered and does not repeat every frame.
- Controller glyph family detection falls back safely for unknown pads.
- Timer advances only while running and stops while paused.
- Results flow can restart without stale score, combo, trick, or camera state.

## Presentation and materials

- Production character has no forced emissive or generalized glow.
- Character authored roughness and metalness are preserved.
- Coping glow remains selective to the approved coping material.
- Front halfpipe PBR material values are not globally rewritten.
- Approved background asset loads and remains visible behind the transparent WebGL canvas.
- Game stage fills the viewport and does not reintroduce fixed 16:9 pillarbox/black side bars.
- Camera preserves approved framing, predictive tracking, and reset behavior.
- Wheel spin stays finite, directional, and synchronized with travelled distance.
- VFX and graphics presets do not hide the rider, background, coping, HUD, or riding surface.
- Audio state survives pause/resume/restart without duplicate loops or stuck ducking.

## WebGL resilience

- webglcontextlost is handled with preventDefault.
- A visible or programmatic recovery/reload path is exposed.
- webglcontextrestored does not resume from corrupt or stale GPU state.
- No uncaught JS errors or failed critical asset requests occur during browser smoke.

## Deploy

- render.yaml uses npm ci && npm run check:release.
- npm run check:release owns the single production build; do not append a duplicate npm run build in Render.
- GitHub release-gate workflow must be green before merge to main.
- Confirm staticPublishPath remains ./dist.
- Confirm the candidate commit, not a local uncommitted build, is the one approved for deployment.

## Known baseline integration blockers on 32b359c0fff9d2f119416b7de1778ab4b0c97122

- ChimpionLoader currently globally clamps MeshStandardMaterial metalness and roughness. The release contract intentionally rejects this; the owning character/art integration must remove that override while preserving authored materials.
- main.js currently has no explicit webglcontextlost/webglcontextrestored recovery contract. Browser release smoke intentionally rejects that state until the owning runtime integration adds safe handling.
- Phase 4 feature modules for combo/results/landing classifications/controller glyphs may not exist on this independent branch. checks/phase4-contracts.mjs provides reusable snapshot validation without importing missing modules.
