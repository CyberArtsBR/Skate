const FAMILY = Object.freeze({
  XBOX: 'xbox',
  PLAYSTATION: 'playstation',
  KEYBOARD: 'keyboard',
  GENERIC: 'generic',
});

const GLYPHS = Object.freeze({
  xbox: {
    confirm: 'A',
    cancel: 'B',
    tertiary: 'X',
    pause: 'MENU',
    reset: 'VIEW',
    handPlant: 'A / B / X',
    pumpUp: '↑',
    pumpDown: '↓',
    turnLeft: '←',
    turnRight: '→',
  },
  playstation: {
    confirm: '×',
    cancel: '○',
    tertiary: '□',
    pause: 'OPTIONS',
    reset: 'SHARE',
    handPlant: '× / ○ / □',
    pumpUp: '↑',
    pumpDown: '↓',
    turnLeft: '←',
    turnRight: '→',
  },
  keyboard: {
    confirm: 'ENTER',
    cancel: 'ESC',
    tertiary: 'K',
    pause: 'P / ESC',
    reset: 'R',
    handPlant: 'K',
    pumpUp: 'W / ↑',
    pumpDown: 'S / ↓',
    turnLeft: 'A / ←',
    turnRight: 'D / →',
  },
  generic: {
    confirm: '1',
    cancel: '2',
    tertiary: '3',
    pause: 'START',
    reset: 'SELECT',
    handPlant: '1 / 2 / 3',
    pumpUp: '↑',
    pumpDown: '↓',
    turnLeft: '←',
    turnRight: '→',
  },
});

export const CONTROLLER_FAMILY = FAMILY;

export function detectControllerFamily(gamepadId = '') {
  const id = String(gamepadId || '').toLowerCase();

  if (!id) return FAMILY.KEYBOARD;
  if (
    id.includes('playstation')
    || id.includes('dualshock')
    || id.includes('dualsense')
    || id.includes('sony')
    || id.includes('054c')
  ) {
    return FAMILY.PLAYSTATION;
  }

  if (
    id.includes('xbox')
    || id.includes('xinput')
    || id.includes('microsoft')
    || id.includes('045e')
  ) {
    return FAMILY.XBOX;
  }

  return FAMILY.GENERIC;
}

export function glyphFor(action, family = FAMILY.KEYBOARD) {
  const resolvedFamily = GLYPHS[family] ? family : FAMILY.GENERIC;
  return GLYPHS[resolvedFamily][action] || String(action || '').toUpperCase();
}

export function glyphSetFor(gamepadId = '') {
  const family = detectControllerFamily(gamepadId);
  return {
    family,
    ...GLYPHS[family],
  };
}
