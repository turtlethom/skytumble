import { describe, expect, it } from 'vitest';
import { formatLevel, parseLevel } from '../src/game/ascii';
import { play, step, swap } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { State } from '../src/game/types';

const cube = (x: number, y: number) => ({ x, y, o: 'S' as const, n: 1 as const });
const split = (ax: number, ay: number, bx: number, by: number, bridges = 0): State => ({ block: cube(ax, ay), bridges, layer: 0, other: { x: bx, y: by } });

describe('splitting', () => {
  // A normal block rolls from x=0 lying over 1,2, then stands on the splitter at 3, which splits north.
  const level = parseLevel(['...#.', 'S##A#', '...#.']);

  it('a standing normal block splits on a splitter: one cube stays, the other appears on the marked side and moves first', () => {
    const r = step(level, { block: { x: 1, y: 1, o: 'X' }, bridges: 0, layer: 0 }, 'right');
    expect(r.split).toEqual({ x: 3, y: 0 });
    expect(r.state.block).toEqual(cube(3, 0));
    expect(r.state.other).toEqual({ x: 3, y: 1 });
  });

  it('round-trips through the text format', () => {
    expect(formatLevel(parseLevel(['S[]AV#']))).toBe('S[]AV#');
  });

  it("doesn't split toward a gap or a raised wall: the block stays whole", () => {
    const gap = parseLevel(['.....', 'S##A#', '...#.']);
    const r = step(gap, { block: { x: 1, y: 1, o: 'X' }, bridges: 0, layer: 0 }, 'right');
    expect(r.split).toBeUndefined();
    expect(r.state.block).toEqual({ x: 3, y: 1, o: 'S' });
    expect(r.state.other).toBeUndefined();
    const wall = parseLevel(['...H.', 'S##A#', '...#.']);
    expect(step(wall, { block: { x: 1, y: 1, o: 'X' }, bridges: 0, layer: 0 }, 'right').split).toBeUndefined();
  });

  it('a lying block across a splitter, or a cube on one, never splits', () => {
    const r = step(level, { block: { x: 1, y: 1, o: 'S' }, bridges: 0, layer: 0 }, 'right');
    expect(r.state.block).toEqual({ x: 2, y: 1, o: 'X' });
    expect(r.split).toBeUndefined();
    expect(step(level, split(2, 1, 0, 1), 'right').split).toBeUndefined();
  });
});

describe('two cubes', () => {
  const room = parseLevel(['S####', '#####', '#####']);

  it('a swap exchanges which cube moves, and is free', () => {
    const s = swap(split(1, 1, 3, 1));
    expect(s.block).toEqual(cube(3, 1));
    expect(s.other).toEqual({ x: 1, y: 1 });
    expect(play(room, split(1, 1, 3, 1), 'swap').state).toEqual(s);
  });

  it('rolling into the idle cube joins them into a lying block over their two tiles', () => {
    const r = step(room, split(1, 1, 2, 1), 'right');
    expect(r.joined).toEqual({ x: 2, y: 1 });
    expect(r.state.block).toEqual({ x: 1, y: 1, o: 'X' });
    expect(r.state.other).toBeUndefined();
    const up = step(room, split(2, 2, 2, 1), 'up');
    expect(up.state.block).toEqual({ x: 2, y: 1, o: 'Y' });
  });

  it('cubes side by side stay apart until one rolls into the other', () => {
    const r = step(room, split(1, 0, 2, 1), 'down');
    expect(r.state.block).toEqual(cube(1, 1));
    expect(r.state.other).toEqual({ x: 2, y: 1 });
    expect(r.joined).toBeUndefined();
  });

  it('the idle cube brakes a slide like a wall', () => {
    const ice = parseLevel(['S~~~#']);
    // A cube in a tube slides; on plain ice a cube grips, so use a tube.
    const tube = parseLevel(['S#===##']);
    const r = step(tube, split(1, 0, 6, 0), 'right');
    expect(r.state.block).toEqual(cube(5, 0));
    expect(ice).toBeTruthy();
  });

  it('a belt pushes only the cube that moved', () => {
    const belt = parseLevel(['S#>##', '##>##']);
    const r = step(belt, split(1, 0, 2, 1), 'right');
    expect(r.state.block).toEqual(cube(3, 0));
    expect(r.state.other).toEqual({ x: 2, y: 1 });
  });

  it('the idle cube falls when a press takes its bridge away', () => {
    const bridge = parseLevel(['So#0#'], [0], 1);
    const r = step(bridge, split(0, 0, 3, 0, 1), 'right');
    expect(r.outcome).toBe('fall');
    expect(r.dropped).toEqual({ x: 3, y: 0 });
  });

  it('split cubes are light: a heavy switch ignores them, planks hold them', () => {
    const heavy = parseLevel(['S#x#f#']);
    expect(step(heavy, split(1, 0, 5, 0), 'right').pressed).toEqual([]);
    expect(step(heavy, split(3, 0, 0, 0), 'right').outcome).toBe('ok');
  });

  it("the goal won't take a cube while the block is split", () => {
    const goal = parseLevel(['S#G#']);
    expect(step(goal, split(1, 0, 3, 0), 'right').outcome).toBe('ok');
  });
});

describe('solving with two cubes', () => {
  it('par counts rolls; the steps list the free swaps', () => {
    // Split on 3,1 (the other cube to the west), rejoin, roll on to the goal.
    const level = parseLevel(['........', 'S##[###G', '........']);
    const sol = solve(level)!;
    expect(sol).not.toBeNull();
    expect(sol.steps.filter((m) => m !== 'swap')).toEqual(sol.moves);
    // Replaying the steps from the start reaches the win.
    let s: State = { block: { x: 0, y: 1, o: 'S' }, bridges: 0, layer: 0 };
    let outcome = '';
    for (const m of sol.steps) {
      const r = play(level, s, m);
      s = r.state;
      outcome = r.outcome;
    }
    expect(outcome).toBe('win');
  });
});
