// Constant inline SVG icons (trusted markup, never built from user data).
const stroke = (d: string, vb = '0 0 24 24') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const I = {
  back: stroke('<path d="M15 5l-7 7 7 7"/>'),
  close: stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
  pause: stroke('<path d="M9 5v14M15 5v14"/>'),
  help: stroke('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6v.4"/><path d="M12 17.2h.01"/>'),
  gear: stroke('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>'),
  up: stroke('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: stroke('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  left: stroke('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  right: stroke('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  undo: stroke('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  restart: stroke('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/>'),
  share: stroke('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  copy: stroke('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
  play: stroke('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  check: stroke('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>'),
  lock: stroke('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  star: stroke('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>'),
  build: stroke('<path d="M4 20h16"/><rect x="5" y="12" width="6" height="6" rx="1"/><rect x="13" y="8" width="6" height="10" rx="1"/><path d="M8 12V6l3-2"/>'),
  trash: stroke('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  eye: stroke('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  stop: stroke('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
};

/* Object illustrations shared by the editor palette and the help panel. */
const tile = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${inner}</svg>`;

export const OBJ = {
  wall: tile('<rect x="3" y="3" width="26" height="26" rx="5" fill="#857a6b"/><rect x="3" y="3" width="26" height="21" rx="5" fill="#b5a995"/>'),
  crate: tile(
    '<rect x="4" y="5" width="24" height="24" rx="4" fill="#7a5426"/><rect x="4" y="4" width="24" height="22" rx="4" fill="#d1a466"/><rect x="9.5" y="8.5" width="13" height="13" fill="none" stroke="#a97b3f" stroke-width="2"/><path d="M9.5 8.5l13 13" stroke="#a97b3f" stroke-width="2"/><rect x="4" y="4" width="24" height="24" rx="4" fill="none" stroke="#7a5426" stroke-width="1.6"/>',
  ),
  plate: (color: string, light: string, sym: string) =>
    tile(`<rect x="5" y="7" width="22" height="22" rx="4" fill="${color}" opacity=".45"/><rect x="5" y="5" width="22" height="22" rx="4" fill="${light}" stroke="${color}" stroke-width="2"/>${sym}`),
  door: (color: string, dark: string, sym: string) =>
    tile(`<rect x="3" y="3" width="26" height="26" rx="4" fill="${dark}"/><rect x="3" y="3" width="26" height="22" rx="4" fill="${color}"/><path d="M10 7v14M22 7v14" stroke="${dark}" stroke-width="2"/><circle cx="16" cy="14" r="6" fill="#fffdf8"/>${sym}`),
  laser: tile(
    '<rect x="3" y="3" width="26" height="26" rx="5" fill="#24201d"/><rect x="3" y="3" width="26" height="22" rx="5" fill="#3b3632"/><path d="M27 14l-8 5v-10z" fill="#e2634f"/><circle cx="15" cy="14" r="4" fill="#ffe6da" stroke="#e2634f" stroke-width="2"/>',
  ),
  beam: tile('<path d="M2 16h28" stroke="#f08a73" stroke-width="9" opacity=".3"/><path d="M2 16h28" stroke="#e2634f" stroke-width="4"/><path d="M9 11l5 5-5 5M19 11l5 5-5 5" stroke="#a8382a" stroke-width="2" fill="none"/>'),
  player: tile(
    '<ellipse cx="16" cy="27" rx="9" ry="2.6" fill="#000" opacity=".15"/><circle cx="16" cy="15" r="11" fill="#2f2b28"/><circle cx="12" cy="15" r="2.6" fill="#fffdf8"/><circle cx="20" cy="15" r="2.6" fill="#fffdf8"/><circle cx="12" cy="16" r="1.1" fill="#2f2b28"/><circle cx="20" cy="16" r="1.1" fill="#2f2b28"/>',
  ),
  exit: tile(
    '<rect x="4" y="4" width="24" height="24" rx="5" fill="#2c6a63"/><rect x="8" y="9" width="16" height="3" rx="1" fill="#f3ede2"/><rect x="10" y="15" width="12" height="3" rx="1" fill="#f3ede2"/><rect x="12.5" y="21" width="7" height="3" rx="1" fill="#f3ede2"/>',
  ),
  erase: tile(
    '<path d="M6 21l9-11a2.2 2.2 0 0 1 3.1-.3l5 4.2a2.2 2.2 0 0 1 .3 3.1L18 24H9z" fill="#f7d6cf" stroke="#2f2b28" stroke-width="2" stroke-linejoin="round"/><path d="M11 15l7 6" stroke="#2f2b28" stroke-width="2"/><path d="M6 27h20" stroke="#2f2b28" stroke-width="2" stroke-linecap="round"/>',
  ),
};

export const GROUP_COLOR = ['#2f8a80', '#d99a26', '#8a5a8c'] as const;
export const GROUP_LIGHT = ['#cfe6e2', '#f6e2bb', '#e6d3e6'] as const;
export const GROUP_DARK = ['#1d5f58', '#9a6a12', '#5e3a60'] as const;

/** Group symbol as SVG markup centred on (16, cy). */
export function groupSymbol(g: number, color: string, cy = 16, r = 4.2): string {
  if (g === 0) return `<circle cx="16" cy="${cy}" r="${r}" fill="${color}"/>`;
  if (g === 1) return `<path d="M16 ${cy - r * 1.15}L${16 + r * 1.15} ${cy + r * 0.85}H${16 - r * 1.15}z" fill="${color}"/>`;
  return `<rect x="${16 - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" fill="${color}"/>`;
}

export const plateIcon = (g: number) => OBJ.plate(GROUP_COLOR[g], GROUP_LIGHT[g], groupSymbol(g, GROUP_COLOR[g]));
export const doorIcon = (g: number) => OBJ.door(GROUP_COLOR[g], GROUP_DARK[g], groupSymbol(g, GROUP_COLOR[g], 14, 3.3));
export const symbolIcon = (g: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${groupSymbol(g, GROUP_COLOR[g], 16, 9)}</svg>`;
