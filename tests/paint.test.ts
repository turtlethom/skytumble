import { describe, expect, it } from 'vitest';
import { formatLevel, parseLevel } from '../src/game/ascii';
import { coat, initialState, play, rollPaint, step, swap } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { Paint, State } from '../src/game/types';
import { parseChapter } from '../src/levels/format';

const [R, B, Y, PU, OR, GR, MUD] = [1, 2, 3, 4, 5, 6, 7] as Paint[];
const standing = (x: number, y: number, paint?: [Paint, Paint]): State => ({ block: { x, y, o: 'S' }, bridges: 0, layer: 0, ...(paint ? { paint } : {}) });
const lying = (x: number, y: number, paint?: [Paint, Paint]): State => ({ block: { x, y, o: 'X' }, bridges: 0, layer: 0, ...(paint ? { paint } : {}) });
const cube = (x: number, y: number, c?: Paint): State => ({ block: { x, y, o: 'S', n: 1 }, bridges: 0, layer: 0, ...(c ? { paint: [c, c] as [Paint, Paint] } : {}) });

describe('paint: mixing', () => {
  it('coats mix: two primaries make a secondary, the same primary changes nothing, a coat on a mix makes mud', () => {
    expect(coat(0, R)).toBe(R);
    expect(coat(R, B)).toBe(PU);
    expect(coat(Y, R)).toBe(OR);
    expect(coat(B, Y)).toBe(GR);
    expect(coat(R, R)).toBe(R);
    expect(coat(PU, Y)).toBe(MUD);
    expect(coat(MUD, R)).toBe(MUD);
  });
});

describe('paint: halves keep their colors as the block rolls', () => {
  it('red on the bottom, two rolls the same way: red on top', () => {
    const l = rollPaint({ x: 0, y: 0, o: 'S' }, [R, 0], 'right');
    expect(l).toEqual([R, 0]);
    expect(rollPaint({ x: 1, y: 0, o: 'X' }, l, 'right')).toEqual([0, R]);
    expect(rollPaint({ x: 5, y: 0, o: 'S' }, [R, 0], 'left')).toEqual([0, R]);
    expect(rollPaint({ x: 0, y: 1, o: 'Y' }, [R, B], 'down')).toEqual([B, R]);
    expect(rollPaint({ x: 1, y: 1, o: 'X' }, [R, B], 'up')).toEqual([R, B]);
  });

  it('round-trips trays, gates, wash and the color lines through the formats', () => {
    expect(formatLevel(parseLevel(['Sruy{s#']))).toBe('Sruy{s#');
    const chapter = parseChapter('t', 'title: T\n\n=== t-01\npaint: red blue\ngates: purple green\nS{{G\n');
    const level = chapter.levels[0].level;
    expect(level.startPaint).toEqual([R, B]);
    expect(initialState(level).paint).toEqual([R, B]);
    expect([level.groups[1], level.groups[2]]).toEqual([PU, GR]);
  });
});

describe('paint: trays and water', () => {
  it('a tray coats a cube all over, and a second color mixes', () => {
    const level = parseLevel(['S#r#u#']);
    const r = step(level, cube(1, 0), 'right');
    expect(r.state.paint).toEqual([R, R]);
    expect(r.painted).toEqual([{ x: 2, y: 0 }]);
    expect(step(level, cube(3, 0, R), 'right').state.paint).toEqual([PU, PU]);
  });

  it('a standing block gets its bottom coated, a lying one the half over the tray', () => {
    const level = parseLevel(['S#r#']);
    expect(step(level, lying(0, 0), 'right').state.paint).toEqual([R, 0]);
    expect(step(level, standing(1, 0), 'right').state.paint).toEqual([R, 0]);
  });

  it('water strips only the part resting on it', () => {
    const level = parseLevel(['S#s#']);
    const r = step(level, lying(0, 0, [B, R]), 'right');
    // Lying [B, R] standing up rightward: R (the east half) at the bottom, on the water.
    expect(r.state.paint).toEqual([0, B]);
    expect(r.washed).toEqual([{ x: 2, y: 0 }]);
    expect(step(level, cube(1, 0, PU), 'right').state.paint).toBeUndefined();
  });
});

describe('paint: gates', () => {
  it('a gate lets a cube of its color through and holds any other, like a wall', () => {
    const level = parseLevel(['S#{#'], [], 0, 2, [PU]);
    expect(step(level, cube(1, 0, PU), 'right').outcome).toBe('ok');
    expect(step(level, cube(1, 0, R), 'right').outcome).toBe('bump');
    expect(step(level, cube(1, 0), 'right').outcome).toBe('bump');
    expect(step(level, cube(1, 0, MUD), 'right').outcome).toBe('bump');
  });

  it('a lying block passes a two-tile gate only with each color on its side', () => {
    const level = parseLevel(['S#{{#'], [], 0, 2, [R, B]);
    expect(step(level, standing(1, 0, [R, B]), 'right').outcome).toBe('ok');
    expect(step(level, standing(1, 0, [B, R]), 'right').outcome).toBe('bump');
  });

  it('a standing block passes only all in the gate color: red and blue halves never make purple', () => {
    const level = parseLevel(['S#{#'], [], 0, 2, [PU]);
    expect(step(level, lying(0, 0, [R, B]), 'right').outcome).toBe('bump');
    expect(step(level, lying(0, 0, [PU, PU]), 'right').outcome).toBe('ok');
    expect(step(level, lying(0, 0, [PU, 0]), 'right').outcome).toBe('bump');
    const red = parseLevel(['S#{#'], [], 0, 2, [R]);
    expect(step(red, lying(0, 0, [R, R]), 'right').outcome).toBe('ok');
    expect(step(red, lying(0, 0, [R, 0]), 'right').outcome).toBe('bump');
  });

  it('a gate of the wrong color brakes a slide', () => {
    const level = parseLevel(['S#==={#'], [], 0, 2, [B]);
    expect(step(level, cube(1, 0, R), 'right').state.block.x).toBeLessThan(5);
    expect(step(level, cube(1, 0, B), 'right').state.block.x).toBe(5);
  });
});

describe('paint with two cubes', () => {
  it('the top half pops out of a split in its color; the bottom color stays on the splitter', () => {
    const level = parseLevel(['...#.', 'S##A#', '.....']);
    const r = step(level, lying(1, 1, [Y, R]), 'right');
    expect(r.split).toEqual({ x: 3, y: 0 });
    expect(r.state.paint).toEqual([Y, Y]);
    expect(r.state.otherPaint).toBe(R);
  });

  it('joining keeps each cube color on its half, and a swap trades them', () => {
    const level = parseLevel(['S####']);
    const pair: State = { block: { x: 1, y: 0, o: 'S', n: 1 }, bridges: 0, layer: 0, paint: [R, R], other: { x: 2, y: 0 }, otherPaint: B };
    expect(step(level, pair, 'right').state.paint).toEqual([R, B]);
    const swapped = swap(pair);
    expect(swapped.paint).toEqual([B, B]);
    expect(swapped.otherPaint).toBe(R);
  });

  it('the solver mixes to pass: red then blue for a purple gate', () => {
    const level = parseLevel(['S#r#u#{#'], [], 0, 1, [PU]);
    level.startShape = 1;
    const sol = solve(level);
    expect(sol).toBeNull(); // no goal: unsolvable, but the gate is passable below
    const end = ['right', 'right', 'right', 'right', 'right', 'right'] as const;
    let s = initialState(level);
    for (const d of end) s = play(level, s, d).state;
    expect(s.block.x).toBe(6);
  });
});
