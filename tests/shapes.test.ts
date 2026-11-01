import { describe, expect, it } from 'vitest';
import { formatLevel, parseLevel } from '../src/game/ascii';
import { blockCells, initialState, roll, step } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { Block, State } from '../src/game/types';

const at = (x: number, y: number, o: Block['o'], n?: 1 | 3, bridges = 0): State => ({
  block: n ? { x, y, o, n } : { x, y, o },
  bridges,
  layer: 0,
});

describe('shapes: rolling', () => {
  it('a cube rolls one tile at a time and always stands', () => {
    expect(roll({ x: 2, y: 2, o: 'S', n: 1 }, 'right')).toEqual({ x: 3, y: 2, o: 'S', n: 1 });
    expect(roll({ x: 2, y: 2, o: 'S', n: 1 }, 'up')).toEqual({ x: 2, y: 1, o: 'S', n: 1 });
  });

  it('a tall block tips onto three tiles and stands up past its far end', () => {
    const lying = roll({ x: 1, y: 0, o: 'S', n: 3 }, 'right');
    expect(lying).toEqual({ x: 2, y: 0, o: 'X', n: 3 });
    expect(blockCells(lying)).toEqual([[2, 0], [3, 0], [4, 0]]);
    expect(roll(lying, 'right')).toEqual({ x: 5, y: 0, o: 'S', n: 3 });
    expect(roll(lying, 'left')).toEqual({ x: 1, y: 0, o: 'S', n: 3 });
    expect(roll({ x: 5, y: 5, o: 'S', n: 3 }, 'up')).toEqual({ x: 5, y: 2, o: 'Y', n: 3 });
  });
});

describe('shapes: weight and support', () => {
  it('a lying tall block rests on its two ends, spanning a gap', () => {
    const level = parseLevel(['S#.#'], [], 0, 3);
    expect(step(level, initialState(level), 'right').outcome).toBe('ok');
    // A normal block lying over the same gap falls.
    const normal = parseLevel(['S#.#']);
    expect(step(normal, at(1, 0, 'S'), 'right').outcome).toBe('fall');
  });

  it('the cube is light: it neither breaks fragile tiles nor presses heavy switches', () => {
    const level = parseLevel(['Sfx0.'], [], 0, 1);
    const onPlank = step(level, initialState(level), 'right');
    expect(onPlank.outcome).toBe('ok');
    const onSwitch = step(level, onPlank.state, 'right');
    expect(onSwitch.toggled).toBe(0);
  });

  it('only a standing tall block presses an extra-heavy switch', () => {
    const level = parseLevel(['S##X'], [], 0, 2);
    // A normal block standing up on X: nothing.
    expect(step(level, at(1, 0, 'X'), 'right').toggled).toBe(0);
    // A tall block standing up on X from lying along the row: pressed.
    expect(step(level, at(0, 0, 'X', 3), 'right').toggled).toBe(1);
  });
});

describe('shapes: switches and goals', () => {
  it('shape switches set the shape of a block standing on them, and lying across is safe', () => {
    const level = parseLevel(['S#c##']);
    const lying = step(level, initialState(level), 'right');
    expect(lying.state.block).toEqual({ x: 1, y: 0, o: 'X' });
    const standing = step(level, at(0, 0, 'X'), 'right');
    expect(standing.state.block).toEqual({ x: 2, y: 0, o: 'S', n: 1 });
    expect(standing.reshaped).toEqual({ from: 2, to: 1 });
    // The normal switch turns it back.
    const back = parseLevel(['S#n#'], [], 0, 1);
    const r = step(back, step(back, initialState(back), 'right').state, 'right');
    expect(r.state.block).toEqual({ x: 2, y: 0, o: 'S' });
  });

  it('a goal takes its own shape: normal by default, or the shape it is marked for', () => {
    const plain = parseLevel(['SG'], [], 0, 1);
    expect(step(plain, initialState(plain), 'right').outcome).toBe('ok');
    const cubeGoal = parseLevel(['SC'], [], 0, 1);
    expect(step(cubeGoal, initialState(cubeGoal), 'right').outcome).toBe('win');
    const tallGoal = parseLevel(['S###T'], [], 0, 3);
    const lying = step(tallGoal, initialState(tallGoal), 'right').state;
    expect(step(tallGoal, lying, 'right').outcome).toBe('win');
  });

  it('parses and prints shape tiles, and the solver tells shapes apart', () => {
    const rows = ['S#c#t#n#X#C#T#G'];
    expect(formatLevel(parseLevel(rows))).toBe(rows[0]);
    // Becoming a cube is the only way across the plank to the cube goal.
    const level = parseLevel(['S##c#f#C']);
    const sol = solve(level);
    expect(sol).not.toBeNull();
    expect(sol!.path[sol!.path.length - 1].block.n).toBe(1);
  });
});
