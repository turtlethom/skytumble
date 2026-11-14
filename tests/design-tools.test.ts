import { describe, expect, it } from 'vitest';
import { solve } from '../src/game/solver';
import { findLevel } from '../src/levels';
import solutions from '../SOLUTIONS.md?raw';
import { directions, solutionsMarkdown } from '../scripts/design/arrows';
import { Draft, dropUnreachable, quickRepresses, flipNS, hidden, lint, plainWalls, plankify, regrow, strip, toLevel, wallColors } from '../scripts/design/checks';

const draft = (rows: string[], switches: number[] = []): Draft => ({ rows, switches, on: [], shape: 2 });

describe('design tools', () => {
  it('keep SOLUTIONS.md up to date (npm run -s directions -- --write)', () => {
    expect(solutions).toBe(solutionsMarkdown());
  });

  it('write solutions as marked arrows, swapping up and down on the ceiling', () => {
    // wind-09: the fling stops short on the heavy switch, and the goal is the last move.
    const wind = directions(findLevel('wind-09')!.level).join(' ');
    expect(wind).toContain('→✈●');
    expect(wind.trim().endsWith('✔')).toBe(true);
    // star-07 rolls north and south on the ceiling, where the keys swap: ↑ no longer counts the north rolls.
    const star = findLevel('star-07')!.level;
    const north = solve(star)!.moves.filter((d) => d === 'up').length;
    const arrows = directions(star).join(' ');
    expect(arrows).toContain('⇄');
    expect(arrows.split('↑').length - 1).not.toBe(north);
  });

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
    expect(lint(draft(['S' + '#'.repeat(23) + 'G'])).join('\n')).toMatch(/bigger than any board/);
    // Pads aimed at walls (Windy Peaks): a short landing, one over nothing, and a sideways hop's crash.
    expect(lint(draft(['S##R..#H#', '..o.....G'], [0])).join('\n')).toContain('the orange wall at 7,0 stops it on 6,0 while up');
    expect(lint(draft(['S##R...K#G'])).join('\n')).toMatch(/stopped short by the fixed wall at 7,0 has nothing to stand on/);
    expect(lint(draft(['SR.K#G', '#R.##.'])).join('\n')).toMatch(/sideways hop from 1,0\+1,1 lands on the fixed wall at 3,0: the block falls/);
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

  it('turn floor into planks where the block never has to stand', () => {
    // Along the corridor the block stands on the start, 3 and the goal; 1, 2, 4 and 5 can be planks.
    const out = plankify(draft(['S#####G']));
    expect(out.rows[0]).toBe('Sff#ffG');
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
