/**
 * The look of a chapter's world. Themes only change how a level is drawn, never its rules.
 * The shared rules every theme follows are in DESIGN.md (*Chapter themes*).
 */
export interface Theme {
  /** Also set as `data-theme` on the page body, where the sky gradient and text colors are styled. */
  id: 'neutral' | 'night';
  /** What fills the 3D sky around the level. */
  sky: 'clouds' | 'stars';
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
}

/** The plain sky-island look: labs, Easy and Medium, and chapters whose world isn't built yet. */
export const NEUTRAL: Theme = {
  id: 'neutral',
  sky: 'clouds',
  hemi: { sky: 0xcfe8ff, ground: 0x8a7a66, intensity: 1.4 },
  sun: { color: 0xfff4e0, intensity: 2.2 },
};

const NIGHT: Theme = {
  id: 'night',
  sky: 'stars',
  hemi: { sky: 0xc2ccff, ground: 0x9a8cd0, intensity: 1.7 },
  sun: { color: 0xeef0ff, intensity: 2 },
};

/** Chapters with a world of their own; any other chapter uses NEUTRAL. */
export const CHAPTER_THEMES: Record<string, Theme> = {
  star: NIGHT,
};

/** The theme for a handmade level, from the chapter in its id (`star-03` is in `star`). */
export function themeForLevel(id: string): Theme {
  return CHAPTER_THEMES[id.split('-')[0]] ?? NEUTRAL;
}
