import { describe, expect, it } from 'vitest';
import { Draft, flipNS, hidden, lint, regrow, strip, toLevel, wallColors } from '../scripts/design/checks';

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
});
