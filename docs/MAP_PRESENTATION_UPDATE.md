# Map and presentation update

## Assets and map selection

Canyon Session and Cyber Night use the owner's replacement canyon.png and nightcity.png. Skate Park and Space are new fixed-backdrop maps using skatepark.png and space.png. All four supplied PNGs are copied byte-for-byte, with no resampling or regeneration. Content hashes version backgrounds and thumbnails for cache invalidation.

The Gym and Japan thumbnails are 960x540 renders of their actual GLBs, using the game's HalfpipeVisual material preparation, map lights and local HDRI. No generated substitute scene. The standalone tools/render-arena-thumbnails.mjs utility renders assets only, without loading the game flow, character or controls. Preview frame is 0.1 seconds; previews are still images even where an arena is animated. The selector contains the whole 3D thumbnail, with five columns on wide screens to keep the expanded roster compact. Runtime arenas remain full GLB maps without image backdrops.

Skate Park gets warm neutral outdoor lighting and quiet outdoor ambience; Space gets a cool fill/warm rim and quiet night ambience. Cyber Night/Space now reference the existing local shanghai_bund_1k.hdr rather than an absent filename. Existing Japan HDRI strength and settings are unchanged.

## Skate paint, bloom and HUD

Each existing board color has a continuous, three-stop board-local gradient, shared with its selector swatch. Deck, edges and trucks are painted; wheels remain unchanged. Original restores the original artwork/materials. Shader uniforms avoid added textures or per-frame gradient calculations.

Transparent expanded coping shells previously became opaque black occluders in selective bloom, hiding the emissive rail. They are now excluded only from that pass. The semantic coping source remains the bloom target; character, ramp paint and background are not newly tagged. Existing 3.2 coping emission and bloom settings remain unchanged.

SCORE/TIME are live local-font graffiti text on a transparent background, with cream highlights, dimensional bronze/black extrusion and restrained cyan/magenta offsets. Removes backing panels in both normal and high-contrast modes. Responsive sizes and reduced-motion behavior remain intact.

## Release evidence

Static code/asset review only. No gameplay tests, benchmarks or local builds. Only the two requested GLB thumbnails were rendered. Player review is still needed for in-game gradient appearance, glow strength, lighting/cropping and HUD readability. No performance measurement is claimed. Existing GLB attribution stays embedded and unchanged.

| Asset | Native dimensions | Bytes | SHA-256 |
|---|---|---|---|
| canyon-session.png | 1672 x 941 | 2761772 | 39151ef7c353af0fc1337ec3ccc946c671a9afa0fe474062e99bee128639b009 |
| cyber-night.png | 1672 x 941 | 2824966 | 930a188e5c60c2f796ee58f60997cf67985d0a9da230ae6e03e5ca1c4d544462 |
| skate-park.png | 1672 x 941 | 2693338 | 529787937f1ff4b07bd14fca95a411a8c96ab78752919f57c030219025af7892 |
| space.png | 1672 x 941 | 2844258 | 648493ee1c384c7d031988ef1388b5f3b4a7cc26443f9d83bb8c05fab0522f3f |
| the-gym-thumb.png | 960 x 540 | 407609 | 4917691721e3c796c491e0b96d99fa8cb80bed813069a93467b2b7c71aa71a3b |
| japan-thumb.png | 960 x 540 | 500114 | d2168afca70e8eeb9896eba9d9d58dade0e64809279651b275e602074b6e4a82 |
