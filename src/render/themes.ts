/**
 * The look of a chapter's world. Themes only change how a level is drawn, never its rules.
 * The shared rules every theme follows are in DESIGN.md (*Chapter themes*).
 */
export interface Theme {
  /** Also set as `data-theme` on the page body, where the sky gradient and text colors are styled. */
  id: 'neutral' | 'night' | 'forest' | 'frost';
  /** What surrounds the level. */
  sky: 'clouds' | 'stars' | 'forest' | 'frost';
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
  block: { color: number; edge: number };
  /** Walkable ground. `detail` lists shades of one color, darkest first, painted over each tile: as soft blotches, or as snow. */
  floor: { color: number; detail?: number[]; style?: 'snow' };
  /** Under the tiles: a block of soil, and rock spikes, a clump with dangling roots, or icicles. */
  earth: { soil: number; hanging: number; style: 'rock' | 'roots' | 'icicles' };
  fragile: { light: number; dark: number; weathered?: boolean };
  /**
   * A finish for mechanics. Their shapes and color coding never change. `snow` is a color laid on
   * stone bases, belt rails and plank seams, never on a switch's or bridge's own color.
   */
  finish: { switchBase?: number; wood?: boolean; snow?: number; iceSheen?: boolean };
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

const NIGHT: Theme = {
  ...SKY_ISLAND,
  id: 'night',
  sky: 'stars',
  hemi: { sky: 0xc2ccff, ground: 0x9a8cd0, intensity: 1.7 },
  sun: { color: 0xeef0ff, intensity: 2 },
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

/** Chapters with a world of their own; any other chapter uses NEUTRAL. */
export const CHAPTER_THEMES: Record<string, Theme> = {
  tutorial: FOREST,
  frost: FROST,
  star: NIGHT,
};

/** Every theme by id, so `?theme=forest` can preview one on any level or on the tile sheet. */
export const THEMES: Record<string, Theme> = { neutral: NEUTRAL, night: NIGHT, forest: FOREST, frost: FROST };

/** The theme for a handmade level, from the chapter in its id (`star-03` is in `star`). */
export function themeForLevel(id: string): Theme {
  return CHAPTER_THEMES[id.split('-')[0]] ?? NEUTRAL;
}
