# Raw street skateboard Foley

Player-selected audio option 2. Sources released under Creative Commons 0:

- `raw-street-roll.wav`: [skateboard rolling.wav — rabbydaw](https://freesound.org/people/rabbydaw/sounds/504879/)
- `raw-street-takeoff.wav`, `raw-street-impact.wav`: [Skateboard Jump.wav — tjandrasounds](https://freesound.org/people/tjandrasounds/sounds/196705/)

Edited from public high-quality previews: trimmed, equalized, level balanced;
rolling has an overlap-crossfaded loop seam. No silence or landing event is
baked into the rolling loop. Gameplay drives pitch, volume and contact state.

The presentation polish retains these source files and the selected raw-street
timbre. At audio unlock, code creates a 9.17-second circular overlap sequence of
the rolling recording and four filtered/tail-length variants of the recorded
impact; these are derivatives of the CC0 sources above, not new recordings.

Dry truck/panel, palm/coping contact and wheel-skid support layers, plus quiet
city/outdoor/night ambience, are synthesized locally by
`src/audio/SkateSoundDesign.js`. They require no external samples or additional
asset license. The original music track and master-volume settings are unchanged.
