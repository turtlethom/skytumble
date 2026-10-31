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

describe('ice', () => {
  it('slides a lying block until it leaves the ice', () => {
    const level = parseLevel(['S~~~~##']);
    const r = step(level, initialState(level), 'right');
    expect(r.rolled).toEqual({ x: 1, y: 0, o: 'X' });
    expect(r.state.block).toEqual({ x: 4, y: 0, o: 'X' });
    expect(r.motions).toEqual([{ kind: 'slide', dir: 'right', from: r.rolled, to: r.state.block }]);
  });

  it('lets a standing block grip', () => {
    const level = parseLevel(['S##~#']);
    const lying = step(level, initialState(level), 'right');
    const r = step(level, lying.state, 'right');
    expect(r.state.block).toEqual({ x: 3, y: 0, o: 'S' });
    expect(r.motions).toEqual([]);
  });

  it('does not slide a block that is only half on ice', () => {
    const level = parseLevel(['S#~~#']);
    const r = step(level, initialState(level), 'right');
    expect(r.state.block).toEqual({ x: 1, y: 0, o: 'X' });
    expect(r.motions).toEqual([]);
  });

  it('slides off the edge into a fall', () => {
    const level = parseLevel(['S~~~']);
    const r = step(level, initialState(level), 'right');
    expect(r.outcome).toBe('fall');
    expect(r.state.block).toEqual({ x: 3, y: 0, o: 'X' });
  });
});

describe('conveyors', () => {
  it('push a standing block one tile', () => {
    const level = parseLevel(['S##>#']);
    const lying = step(level, initialState(level), 'right');
    const r = step(level, lying.state, 'right');
    expect(r.state.block).toEqual({ x: 4, y: 0, o: 'S' });
    expect(r.motions).toEqual([{ kind: 'push', dir: 'right', from: { x: 3, y: 0, o: 'S' }, to: r.state.block }]);
  });

  it('only push a block that is fully on conveyors pointing the same way', () => {
    const half = parseLevel(['S#>#']);
    expect(step(half, initialState(half), 'right').motions).toEqual([]);
    const split = parseLevel(['S>v#', '.##.']);
    expect(step(split, initialState(split), 'right').motions).toEqual([]);
    const agree = parseLevel(['S>>#']);
    expect(step(agree, initialState(agree), 'right').state.block).toEqual({ x: 2, y: 0, o: 'X' });
  });

  it('push a lying block onto ice, where it slides on', () => {
    const level = parseLevel(['Svv.', '.~~.', '.~~.', '.##.']);
    const r = step(level, initialState(level), 'right');
    expect(r.state.block).toEqual({ x: 1, y: 3, o: 'X' });
    expect(r.motions.map((m) => [m.kind, m.dir])).toEqual([['push', 'down'], ['slide', 'down']]);
  });

  it('push a block that a slide left fully on conveyors, once per move', () => {
    const level = parseLevel(['S....', '#~~>>', '#~~>#']);
    const down = step(level, initialState(level), 'down');
    const r = step(level, down.state, 'right');
    // Slides to x=3 (both cells on '>'), then one push to x=4; the top cell lands on another '>' but no second push.
    expect(r.state.block).toEqual({ x: 4, y: 1, o: 'Y' });
    expect(r.motions.map((m) => [m.kind, m.from.x, m.to.x])).toEqual([['slide', 1, 3], ['push', 3, 4]]);
  });

  it('push a standing block onto the goal to win', () => {
    const level = parseLevel(['S##>G']);
    const lying = step(level, initialState(level), 'right');
    expect(step(level, lying.state, 'right').outcome).toBe('win');
  });

  it('push a standing block onto fragile tiles, which break', () => {
    const level = parseLevel(['S##>f']);
    const lying = step(level, initialState(level), 'right');
    const r = step(level, lying.state, 'right');
    expect(r.outcome).toBe('fall');
    expect(r.broke).toEqual({ x: 4, y: 0 });
  });
});

describe('solve with ice and conveyors', () => {
  it('counts a slide as part of one move', () => {
    // Rolling right lands lying on ice and slides to the far floor: 2 moves instead of 4.
    const level = parseLevel(['S~~~~#G']);
    expect(solve(level)?.moves).toEqual(['right', 'right']);
  });
});
