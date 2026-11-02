/**
 * The look of a chapter's world. Themes only change how a level is drawn, never its rules.
 * The shared rules every theme follows are in DESIGN.md (*Chapter themes*).
 */
export interface Theme {
  /** Also set as `data-theme` on the page body, where the sky gradient and text colors are styled. */
  id: 'neutral' | 'night' | 'forest' | 'frost' | 'peaks' | 'toybox';
  /** What surrounds the level. */
  sky: 'clouds' | 'stars' | 'forest' | 'frost' | 'peaks' | 'toybox';
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
  block: { color: number; edge: number; roughness?: number };
  /** Walkable ground. `detail` lists shades of one color, darkest first, painted over each tile: as soft blotches, as snow, as slate, or as holes in a pegboard, or as meadow grass. */
  floor: { color: number; detail?: number[]; style?: 'snow' | 'slate' | 'pegboard' | 'meadow' };
  /** Under the tiles: a block of soil, and rock spikes, a clump with dangling roots, icicles, jagged shards, dangling pegs, or roots with glowing tips. */
  earth: { soil: number; hanging: number; style: 'rock' | 'roots' | 'icicles' | 'shards' | 'pegs' | 'glowroots' };
  fragile: { light: number; dark: number; weathered?: boolean };
  /**
   * A finish for mechanics. Their shapes and color coding never change. `snow` is a color laid on
   * stone bases, belt rails and plank seams, never on a switch's or bridge's own color. `plastic` makes
   * the board a shiny building set: reflections, rounded edges, snap-on plates and tread belts. `rail`
   * colors belt rails and bridge corners.
   */
  finish: { switchBase?: number; wood?: boolean; snow?: number; iceSheen?: boolean; brass?: number; padVents?: boolean; plastic?: boolean; rail?: number };
  /** Where a pad flight lands, if this floor needs a color other than the usual deep blue. */
  landingMark?: number;
  /** Where a flip lands, if this floor needs a color other than the usual violet. */
  flipMark?: number;
}

/** The ground and block every world starts from until it restyles them. */
const SKY_ISLAND = {
  block: { color: 0xf0c987, edge: 0x8a6436 },
  floor: { color: 0x86d07a },
  earth: { soil: 0x9a6b4b, hanging: 0x7d5a44, style: 'rock' },
  fragile: { light: 0xe2b26f, dark: 0xb98545 },
  finish: {},
} satisfies Partial<Theme>;

/** The plain sky-island look: labs, Easy and Medium, and chapters whose world isn't built yet. */
export const NEUTRAL: Theme = {
  ...SKY_ISLAND,
  id: 'neutral',
  sky: 'clouds',
  hemi: { sky: 0xcfe8ff, ground: 0x8a7a66, intensity: 1.4 },
  sun: { color: 0xfff4e0, intensity: 2.2 },
};

/** Starfall: a tiny storybook meadow adrift in open space. The grass stays well above the sky's brightness, so gaps read. */
const NIGHT: Theme = {
  id: 'night',
  sky: 'stars',
  hemi: { sky: 0xd6dcf5, ground: 0x8f93bd, intensity: 1.7 },
  sun: { color: 0xf1f2fb, intensity: 2 },
  block: { color: 0xeceef4, edge: 0x5d6284, roughness: 0.4 },
  floor: { color: 0x8e9ae0, detail: [0x7884d2, 0x8e9ae0, 0xa0acea, 0xb4bef2], style: 'meadow' },
  earth: { soil: 0x2b2f66, hanging: 0x8fa6e8, style: 'glowroots' },
  fragile: { light: 0x1f6f78, dark: 0x185a62, weathered: true },
  finish: { switchBase: 0xd7dbea, rail: 0xd7dbea },
  // The usual violet nearly matches this grass.
  flipMark: 0x3c1a9e,
};

/** First Glade: a sunny storybook forest. */
const FOREST: Theme = {
  id: 'forest',
  sky: 'forest',
  hemi: { sky: 0xe6f5ff, ground: 0x7d8f60, intensity: 1.5 },
  sun: { color: 0xfff0cf, intensity: 2.4 },
  block: { color: 0xe2a94f, edge: 0x7a4f1e },
  floor: { color: 0x5fa04a, detail: [0x4f8f3f, 0x5fa04a, 0x6cae55, 0x78b85f] },
  earth: { soil: 0x5d432e, hanging: 0x6d4c33, style: 'roots' },
  fragile: { light: 0xa89c86, dark: 0x857a68, weathered: true },
  finish: { switchBase: 0x9aa58a, wood: true },
};

/** Frost Isle: a pink-gold alpine dawn. */
const FROST: Theme = {
  id: 'frost',
  sky: 'frost',
  hemi: { sky: 0xeef1fb, ground: 0xd8cfe0, intensity: 1.75 },
  sun: { color: 0xfff0dc, intensity: 2.05 },
  block: { color: 0xb9502f, edge: 0x6b2a17 },
  // Shades well below white: this light would otherwise clip them all to one flat color.
  floor: { color: 0xeee7dc, detail: [0xdfd6cb, 0xeee7dc, 0xf6f0e7, 0xfefbf5], style: 'snow' },
  earth: { soil: 0x7f93ab, hanging: 0xb5d8ef, style: 'icicles' },
  fragile: { light: 0x5f4d40, dark: 0x4a3c32, weathered: true },
  finish: { switchBase: 0x8d95a6, snow: 0xf1eee8, iceSheen: true },
};

/** Windy Peaks: bright grey stone in a strong wind. The slate stays sunlit, so the world doesn't feel heavy. */
const PEAKS: Theme = {
  id: 'peaks',
  sky: 'peaks',
  hemi: { sky: 0xeef0f2, ground: 0x9a8f88, intensity: 1.6 },
  sun: { color: 0xfff0d6, intensity: 2.4 },
  block: { color: 0xc8c5be, edge: 0x55534e },
  floor: { color: 0x6a7c98, detail: [0x5b6d89, 0x6a7c98, 0x7789a5, 0x8799b4], style: 'slate' },
  earth: { soil: 0x525a6b, hanging: 0x5f6778, style: 'shards' },
  fragile: { light: 0xd2cec4, dark: 0xaeaaa0, weathered: true },
  finish: { switchBase: 0x94969a, brass: 0xdcae50, padVents: true },
  landingMark: 0x5cc8ff,
};

/** Toybox: a shiny plastic building set in a playroom in the clouds, at a pastel sunset. */
const TOYBOX: Theme = {
  id: 'toybox',
  sky: 'toybox',
  hemi: { sky: 0xf3e2f0, ground: 0xb18f9c, intensity: 0.9 },
  sun: { color: 0xffe6d0, intensity: 1.95 },
  block: { color: 0xf5c518, edge: 0x7f5a05, roughness: 0.2 },
  floor: { color: 0xa04a46, detail: [0x5e2522, 0xa04a46, 0xb86660], style: 'pegboard' },
  earth: { soil: 0x7c3733, hanging: 0xcfc2a6, style: 'pegs' },
  fragile: { light: 0xa98a60, dark: 0x93754e },
  finish: { switchBase: 0xdcd1b8, plastic: true },
};

/** Chapters with a world of their own; any other chapter uses NEUTRAL. */
export const CHAPTER_THEMES: Record<string, Theme> = {
  tutorial: FOREST,
  frost: FROST,
  wind: PEAKS,
  star: NIGHT,
  toy: TOYBOX,
};

/** Every theme by id, so `?theme=forest` can preview one on any level or on the tile sheet. */
export const THEMES: Record<string, Theme> = { neutral: NEUTRAL, night: NIGHT, forest: FOREST, frost: FROST, peaks: PEAKS, toybox: TOYBOX };

/** The theme for a handmade level, from the chapter in its id (`star-03` is in `star`). */
export function themeForLevel(id: string): Theme {
  return CHAPTER_THEMES[id.split('-')[0]] ?? NEUTRAL;
}
