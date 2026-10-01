# Halfpipe material mask

`halfpipe-paint-mask.png` is a 512×512 grayscale UV mask for the supplied
`public/models/halfpipe/halfpipe.glb` material `Steel_Brushed_Stainless`.
White marks the existing Halfpipe Chimp logo/ink as dielectric paint. Black
retains the authored bare-metal field. Edge coverage is softly downsampled.

The mask was reviewed against the embedded 2048×2048 base-color atlas. Its only
paint footprint is x=186–503, y=1459–1737 in image pixel coordinates, with the
surrounding uniform steel field `(116,125,131)` excluded. No artwork is recolored
and no runtime chroma/brightness classification is used. Update this mask if
that particular logo or its UV placement changes; it is not a universal mask.

Known roster material profiles remain per exported material slot. Heretic's
three torus jewelry meshes use separate materials and retain metallic finishes.
The Archon's ornamental staff is separate and retains its gilded finish; its
blue tangent-space normal map is restored at a restrained scale of 0.18.
Tiny accessory regions merged into a single skin/clothing atlas cannot be
reliably separated without source UV authoring. These profiles do not invent
color-based metal masks for such mixed atlases or modify uploaded avatars.
