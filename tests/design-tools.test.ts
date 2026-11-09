import { describe, expect, it } from 'vitest';
import { findLevel } from '../src/levels';
import { Draft, dropUnreachable, quickRepresses, flipNS, hidden, lint, plainWalls, regrow, strip, toLevel, wallColors } from '../scripts/design/checks';

const draft = (rows: string[], switches: number[] = []): Draft => ({ rows, switches, on: [], shape: 2 });

describe('design tools', () => {
  it('find a wall color the level needs to move, and one it does not', () => {
    // Two Stops: lowered, the wall stops the first slide half on it; raised, a tile short.
    const twoStops = draft(['....G##..', 'S~~~~~~h.', '##....##.', '###o####.']);
    expect(wallColors(toLevel(twoStops))).toEqual([expect.objectContaining({ group: 0, moves: true })]);
    // A wall beside the path that nothing ever touches.
    const idle = draft(['S###G', 'o.H..']);
    expect(wallColors(toLevel(idle))).toEqual([expect.objectContaining({ group: 0, moves: false })]);
  });

  it('flip a board north to south, re-ordering switches and turning belts round', () => {
    const d = draft(['S#o#v', '##x#G'], [1, 0]);
    const f = flipNS(d);
    expect(f.rows).toEqual(['##x#G', 'S#o#^']);
    expect(f.switches).toEqual([0, 1]);
  });

  it('see what a raised wall hides from the opening camera', () => {
    const level = toLevel(draft(['....G', 'S##v#', '...H.', '..o..']));
    expect(hidden(level)).toEqual(['belt at 3,1 is behind the orange wall at 3,2']);
  });

  it('lint the mistakes that cost the most rounds', () => {
    // A heavy switch first in reading order quietly takes the first group.
    expect(lint(draft(['....x', 'S#o#H', '....G'], [1, 0])).join('\n')).toContain('x@4,0→purple o@2,1→orange');
    // Floor behind a belt that pushes at a wall: the block can skip the ride.
    expect(lint(draft(['..G..', '..#..', '..H..', 'S#^#o', '..#..'])).join('\n')).toMatch(/skips the ride/);
    // A goal the block only ever reaches lying.
    expect(lint(draft(['S###G#'])).join('\n')).toMatch(/only ever reached lying/);
  });

  it('strip what the solution does not need, then regrow decoys that keep the puzzle', () => {
    const full = draft(['S####', '#####', '###G#']);
    const stripped = strip(full);
    expect(stripped.rows.join('').split('').filter((c) => c === '#').length).toBeLessThan(13);
    const grown = regrow(stripped, full);
    expect(grown.rows.join('').length).toBe(full.rows.join('').length);
  });

  it('check bridges the same way: fixed out and fixed in must both change par', () => {
    // Switchback's bridges home have to move.
    expect(wallColors(findLevel('frost-05')!.level)).toEqual([expect.objectContaining({ bridges: 8, moves: true })]);
    // A bridge beside the path that no route needs.
    expect(wallColors(toLevel(draft(['S##G', '.0..', '.o..'])))).toEqual([expect.objectContaining({ bridges: 1, moves: false })]);
  });

  it('turn a wall the puzzle does not need into floor, and keep the ones it does', () => {
    const d = draft(['....G##..', 'S~~~~~~h.', '##....##.', '###o####.', 'H........']);
    const plain = plainWalls(d);
    expect(plain.rows[1]).toBe('S~~~~~~h.');
    expect(plain.rows[4]).toBe('#........');
  });

  it('drop plain tiles the block can never reach', () => {
    const out = dropUnreachable(draft(['S##G', '....', '...#']));
    expect(out.rows[2]).toBe('....');
  });

  it('spot a press undone straight away', () => {
    const level = toLevel(draft(['S#o#G']));
    // Onto the switch, off it, onto it again: two presses two moves apart.
    expect(quickRepresses(level, ['right', 'left', 'right'])).toBe(1);
    expect(quickRepresses(level, ['right'])).toBe(0);
  });
});
