import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/levels';
import { CHAPTER_THEMES, NEUTRAL, themeForLevel } from '../src/render/themes';

describe('chapter themes', () => {
  it('give Starfall its night and every other two-floor level the neutral look', () => {
    expect(themeForLevel('star-03').id).toBe('night');
    expect(themeForLevel('gravlab-02')).toBe(NEUTRAL);
  });

  it('fall back to neutral for chapters without a world', () => {
    expect(themeForLevel('lab-01')).toBe(NEUTRAL);
  });

  it('are only assigned to chapters that exist', () => {
    const ids = CHAPTERS.map((c) => c.id);
    for (const chapter of Object.keys(CHAPTER_THEMES)) expect(ids).toContain(chapter);
  });
});
