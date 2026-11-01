import { describe, expect, it } from 'vitest';
import { formatLevel, parseLevel } from '../src/game/ascii';
import { step } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { State } from '../src/game/types';
import { flipUses } from '../src/levels/validate';

// Ground rows, then '---', then the ceiling directly above (same coordinates).
const at = (x: number, y: number, o: 'S' | 'X' | 'Y', layer = 0, bridges = 0): State => ({
  block: { x, y, o },
  bridges,
  layer,
});

describe('gravity flip', () => {
  it('parses a ceiling layer and formats it back', () => {
    const rows = ['S#+#', '---', '..#G'];
    const level = parseLevel(rows);
    expect(level.ceiling?.tiles.length).toBe(4);
    expect(formatLevel(level)).toBe(rows.join('\n'));
  });

  it('flips a standing block to the tile directly above, still standing', () => {
    const level = parseLevel(['S#+#', '---', '..##']);
    const r = step(level, at(0, 0, 'X'), 'right');
    expect(r.outcome).toBe('ok');
    expect(r.state).toEqual(at(2, 0, 'S', 1));
    expect(r.motions.map((m) => m.kind)).toEqual(['flip']);
  });

  it('flips a block lying fully on two flip tiles, in the same pose', () => {
    const level = parseLevel(['S#++#', '---', '..###']);
    const r = step(level, at(1, 0, 'S'), 'right');
    expect(r.state).toEqual(at(2, 0, 'X', 1));
  });

  it('lying half on a flip tile is safe', () => {
    const level = parseLevel(['S#+##', '---', '.....']);
    const r = step(level, at(0, 0, 'S'), 'right');
    expect(r.outcome).toBe('ok');
    expect(r.state.layer).toBe(0);
  });

  it('falls into the sky when there is nothing above', () => {
    const level = parseLevel(['S#+#', '---', '....']);
    expect(step(level, at(0, 0, 'X'), 'right').outcome).toBe('fall');
  });

  it('never re-fires a flip tile it lands on in the same move', () => {
    const level = parseLevel(['S#+#', '---', '..+#']);
    const r = step(level, at(0, 0, 'X'), 'right');
    expect(r.state.layer).toBe(1);
    // Resting on it again later flips back down.
    const up = step(level, r.state, 'right');
    const back = step(level, up.state, 'left');
    expect(back.state).toEqual(at(2, 0, 'S', 0));
  });

  it('rolling off a ceiling edge falls', () => {
    const level = parseLevel(['S#+#', '---', '..#.']);
    const up = step(level, at(0, 0, 'X'), 'right').state;
    expect(step(level, up, 'right').outcome).toBe('fall');
  });

  it('a belt push or a pad flight onto a flip tile flips', () => {
    const belt = parseLevel(['S#>+', '---', '...#']);
    // Rolling up onto the belt, it pushes the standing block onto the flip tile.
    expect(step(belt, at(0, 0, 'X'), 'right').state).toEqual(at(3, 0, 'S', 1));
    const pad = parseLevel(['S#R...++', '---', '......##']);
    const r = step(pad, at(0, 0, 'X'), 'right');
    expect(r.motions.map((m) => m.kind)).toEqual(['fly', 'flip']);
    expect(r.state).toEqual(at(6, 0, 'X', 1));
  });

  it('switches on one layer drive bridges on the other, and the goal can be above', () => {
    // Flip up onto the ceiling's heavy switch (it raises the ground bridge), then lie across
    // two ceiling flip tiles to drop back down onto that bridge, and roll up onto the goal.
    const level = parseLevel(['S##+0#G', '---', '...x++.']);
    const sol = solve(level);
    expect(sol?.moves).toEqual(['right', 'right', 'right', 'right']);
    expect(sol!.path.map((s) => s.layer)).toEqual([0, 0, 1, 0, 0]);
    const above = parseLevel(['S#+...', '---', '..###G']);
    const up = step(above, at(0, 0, 'X'), 'right').state;
    expect(step(above, step(above, up, 'right').state, 'right').outcome).toBe('win');
  });

  it('the solver tells the two layers apart', () => {
    // The ground has a gap the ceiling bridges: the only way across is up and back down.
    const level = parseLevel(['S##+..###G', '---', '...###+...']);
    const sol = solve(level);
    expect(sol!.path.map((s) => s.layer)).toEqual([0, 0, 1, 1, 0, 0, 0]);
    expect(solve(parseLevel(['S##+..###G']))).toBeNull();
  });

  it('names the ways a solution uses flips', () => {
    const level = parseLevel(['S##+0#G', '---', '...x++.']);
    expect(flipUses(level, solve(level)!.moves).sort()).toEqual(['cross-layer press', 'flip down', 'flip up', 'lying flip']);
  });
});
