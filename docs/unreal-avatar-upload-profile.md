# Unreal avatar upload stance

Recognized Unreal humanoids automatically use `unreal-humanoid-skate-v1` when loaded or replaced through the avatar selector. The resolved hips and both leg chains must match pelvis, thigh_l/r, calf_l/r and foot_l/r (case-insensitive, optional colon namespace). Other rigs retain their existing stance.

The approved profile is exported from src/character/UnrealSkateUploadProfile.js. It widens the board stance by 20% and aligns each foot's measured ankle-to-ball/toe heading to board-local +Z, removing outward toe yaw while preserving authored sole tilt. Shoe geometry is measured separately for deck contact. Missing toe bones preserve the authored heading. No GLB, skin weights or bind matrices are modified.

The reference is the uploaded thehereticUR.glb front/back capture in audit/halfpipe-unreal-front-corrected.png and audit/halfpipe-unreal-back-corrected.png. The profile uses bone names and per-avatar geometry, never a filename. It assumes the loader's Y-up, +Z-facing humanoid convention.
