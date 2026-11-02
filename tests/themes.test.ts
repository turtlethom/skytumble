import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterOf } from '../src/levels';
import { CHAPTER_THEMES, NEUTRAL, themeForLevel } from '../src/render/themes';

describe('chapter themes', () => {
  it('find a level\'s chapter for its arrival title', () => {
    expect(chapterOf('tutorial-03')?.title).toBe('First Glade');
    expect(chapterOf('frost-01')?.title).toBe('Frost Isle');
    expect(chapterOf('nowhere-01')).toBeUndefined();
  });

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
