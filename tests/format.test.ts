import { describe, expect, it } from 'vitest';
import { formatLevel } from '../src/game/ascii';
import { parseChapter } from '../src/levels/format';
import { iceUses, validateLevel } from '../src/levels/validate';

describe('chapter files', () => {
  it('parse headers, fields and grids', () => {
    const chapter = parseChapter(
      'frost',
      ['title: Frost Isle', 'signature: ice', '', '=== frost-01', 'name: Slip', 'par: 2', 'switches: 1', 'bridges-on: 1 2', 'S~~~~#G', ''].join('\n'),
    );
    expect(chapter).toMatchObject({ id: 'frost', title: 'Frost Isle', signature: 'ice' });
    const [h] = chapter.levels;
    expect(h).toMatchObject({ id: 'frost-01', name: 'Slip', par: 2 });
    expect(h.level.bridgesOn).toBe(0b110);
    expect(formatLevel(h.level)).toBe('S~~~~#G');
  });

  it('report errors with file and line', () => {
    expect(() => parseChapter('lab', '=== lab-01\nbogus: 1\nS#G')).toThrow('lab.txt:1: unknown field');
    expect(() => parseChapter('lab', 'title: Lab\nS#G')).toThrow('lab.txt:2: grid row before');
    expect(() => parseChapter('lab', '=== lab-01\nS#Q')).toThrow("Unknown level character 'Q'");
  });
});

describe('validation', () => {
  const chapter = (signature: 'ice' | null) => ({ id: 'frost', title: 'Frost', signature, levels: [] });
  const level = (rows: string[], par: number | null) => ({
    id: 'frost-01',
    name: '',
    idea: '',
    par,
    level: parseChapter('frost', `=== frost-01\n${rows.join('\n')}`).levels[0].level,
  });

  it('flags par drift and unsolvable levels', () => {
    expect(validateLevel(level(['S##G'], 3), chapter(null)).errors[0]).toContain('solver finds 2');
    expect(validateLevel(level(['S.##G'], 1), chapter(null)).errors).toEqual(['unsolvable']);
  });

  it('enforces the one-trick guard only for ice chapters', () => {
    const oneTrick = level(['S~~~~#G'], 2);
    expect(validateLevel(oneTrick, chapter(null)).errors).toEqual([]);
    expect(validateLevel(oneTrick, chapter('ice')).errors[0]).toContain('one-trick');
  });

  it('classifies ice uses along a solution', () => {
    // Push off the belt onto ice and slide down, then a slide that ends half on ice.
    const l = parseChapter('frost', '=== frost-01\nSvv.\n.~~.\n.~~.\n.##.').levels[0].level;
    expect(iceUses(l, ['right']).uses).toEqual(['slide', 'belt→slide']);
    const grip = parseChapter('frost', '=== frost-01\nS##~#').levels[0].level;
    expect(iceUses(grip, ['right', 'right']).uses).toEqual(['grip']);
  });
});
