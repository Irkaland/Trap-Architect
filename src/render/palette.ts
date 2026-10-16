// Shared colours. Numbers for Phaser, strings mirror the CSS tokens.
export const C = {
  bg: 0xf3ede2,
  ink: 0x2f2b28,
  floor: 0xfbf7f0,
  floorShade: 0xe8dfd0,
  wallTop: 0xb5a995,
  wallSide: 0x857a6b,
  wallLine: 0x4a433c,
  crate: 0xd1a466,
  crateEdge: 0x7a5426,
  crateLine: 0xa97b3f,
  exit: 0x2c6a63,
  exitStep: 0xf3ede2,
  laser: 0xe2634f,
  laserGlow: 0xf08a73,
  laserCore: 0xffe6da,
  laserMark: 0xa8382a,
  emitter: 0x3b3632,
  cursor: 0xd99a26,
  white: 0xfffdf8,
  /** Group colours: teal circle, amber triangle, plum square. */
  group: [0x2f8a80, 0xd99a26, 0x8a5a8c] as const,
  groupLight: [0xcfe6e2, 0xf6e2bb, 0xe6d3e6] as const,
  groupDark: [0x1d5f58, 0x9a6a12, 0x5e3a60] as const,
};

export const GROUP_SYMBOLS = ['●', '▲', '■'] as const;
export const GROUP_CSS = ['#2f8a80', '#d99a26', '#8a5a8c'] as const;
