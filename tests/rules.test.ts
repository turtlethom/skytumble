import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/game/ascii';
import { initialState, roll, step } from '../src/game/rules';
import { solve } from '../src/game/solver';

describe('roll', () => {
  it('tips a standing block onto its side and back up', () => {
    const lying = roll({ x: 3, y: 3, o: 'S' }, 'right');
    expect(lying).toEqual({ x: 4, y: 3, o: 'X' });
    expect(roll(lying, 'right')).toEqual({ x: 6, y: 3, o: 'S' });
    expect(roll(lying, 'left')).toEqual({ x: 3, y: 3, o: 'S' });
    expect(roll({ x: 3, y: 3, o: 'S' }, 'up')).toEqual({ x: 3, y: 1, o: 'Y' });
  });

  it('rolls a lying block sideways without standing it up', () => {
    expect(roll({ x: 2, y: 2, o: 'X' }, 'down')).toEqual({ x: 2, y: 3, o: 'X' });
    expect(roll({ x: 2, y: 2, o: 'Y' }, 'right')).toEqual({ x: 3, y: 2, o: 'Y' });
  });
});

describe('step', () => {
  it('falls off the edge', () => {
    const level = parseLevel(['S#G']);
    expect(step(level, initialState(level), 'left').outcome).toBe('fall');
  });

  it('breaks fragile tiles only when standing', () => {
    const level = parseLevel(['S##ff#']);
    const lying = step(level, initialState(level), 'right');
    expect(lying.outcome).toBe('ok');
    const standing = step(level, lying.state, 'right');
    expect(standing.outcome).toBe('fall');
    expect(standing.broke).toEqual({ x: 3, y: 0 });
  });

  it('only triggers heavy switches when standing', () => {
    const level = parseLevel(['S##x#', '.....']);
    const lyingOnSwitch = step(level, { block: { x: 2, y: 0, o: 'S' }, bridges: 0 }, 'right');
    expect(lyingOnSwitch.toggled).toBe(0);
    const standing = step(level, initialState(level), 'right');
    const onSwitch = step(level, standing.state, 'right');
    expect(onSwitch.state.block).toEqual({ x: 3, y: 0, o: 'S' });
    expect(onSwitch.toggled).toBe(1);
  });

  it('wins only standing on the goal', () => {
    const level = parseLevel(['S##G#']);
    const r1 = step(level, initialState(level), 'right');
    expect(step(level, r1.state, 'right').outcome).toBe('win');
  });
});

describe('solve', () => {
  it('finds the shortest solution', () => {
    const level = parseLevel(['S##G']);
    expect(solve(level)?.moves).toEqual(['right', 'right']);
  });

  it('uses switches to extend bridges', () => {
    const level = parseLevel(['S#o00#G']);
    const solution = solve(level);
    expect(solution).not.toBeNull();
    expect(solution!.path.some((s) => s.bridges !== 0)).toBe(true);
  });

  it('returns null for unsolvable levels', () => {
    expect(solve(parseLevel(['S.##G']))).toBeNull();
  });
});
