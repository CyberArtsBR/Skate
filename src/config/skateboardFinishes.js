function finish(color, stops) {
  const colors = Object.freeze(stops);
  return Object.freeze({
    color,
    stops: colors,
    cssGradient: `linear-gradient(115deg, ${colors.map(
      value => '#' + value.toString(16).padStart(6, '0'),
    ).join(', ')})`,
  });
}

// Shared between the board's lit paint and the selector swatches. Keep the
// existing base color/IDs so saved selections continue to resolve unchanged.
export const SKATEBOARD_FINISHES = Object.freeze([
  finish(0xc91f37, [0x5e123b, 0xde2946, 0xffad56]),
  finish(0x1d6cff, [0x27196a, 0x246fff, 0x55e6e6]),
  finish(0x16d9e8, [0x086e83, 0x21d9de, 0xb3ffdc]),
  finish(0x64d93a, [0x155f47, 0x71de36, 0xe9f66e]),
  finish(0xf3c744, [0xc86b18, 0xf7c847, 0xffedb4]),
  finish(0x8c4dff, [0x36186e, 0x9652ff, 0xf486d4]),
  finish(0x151515, [0x10121c, 0x303a4a, 0x8996a5]),
  finish(0xf4f4f0, [0xa6b6c7, 0xf4f4ee, 0xffffff]),
]);

export function skateboardFinishByColor(color) {
  if (color === null || color === undefined) return null;
  const numericColor = Number(color);
  return SKATEBOARD_FINISHES.find(entry => entry.color === numericColor)
    || finish(numericColor, [numericColor, numericColor, numericColor]);
}
