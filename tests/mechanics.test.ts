import { describe, expect, it } from 'vitest';
import { StepResult, initialState, step, swap, tileAt, wallUp } from '../src/game/rules';
import { Tile } from '../src/game/types';
import { CAMPAIGN, findLevel } from '../src/levels';
import { MECHANICS, Mechanic, MechanicId, mechanicsIn } from '../src/levels/mechanics';

/** A scene's rolls, in order (swaps between split cubes change the state but aren't steps). */
function run(m: Mechanic): StepResult[] {
  let state = initialState(m.level);
  const results: StepResult[] = [];
  for (const move of m.moves) {
    if (move === 'swap') {
      state = swap(state);
      continue;
    }
    const result = step(m.level, state, move);
    state = result.state;
    results.push(result);
  }
  return results;
}

const entry = (id: MechanicId) => MECHANICS.find((m) => m.id === id)!;

describe('How To Play scenes', () => {
  for (const m of MECHANICS) {
    it(`${m.id}: plays through without a fall and ends in a win`, () => {
      const results = run(m);
      expect(results.slice(0, -1).map((r) => r.outcome)).not.toContain('fall');
      expect(results.slice(0, -1).map((r) => r.outcome)).not.toContain('win');
      expect(results[results.length - 1].outcome).toBe('win');
    });
  }

  it('show the mechanic they describe', () => {
    expect(run(entry('extraHeavy')).some((r) => r.toggled)).toBe(true);
    expect(run(entry('cube')).some((r) => r.reshaped?.to === 1)).toBe(true);
    expect(run(entry('tall')).some((r) => r.reshaped?.to === 3)).toBe(true);
  });

  it('show a soft switch going up, down and up again', () => {
    expect(run(entry('soft')).filter((r) => r.toggled)).toHaveLength(3);
  });

  it('show ice gripping a standing block, then sliding a lying one', () => {
    const results = run(entry('ice'));
    expect(results[1].state.block.o).toBe('S');
    expect(results[1].motions).toEqual([]);
    expect(results[2].motions.map((m) => m.kind)).toEqual(['slide']);
  });

  it('show belts pushing a standing block, pushing a lying one, and leaving one half on', () => {
    const results = run(entry('belts'));
    const pushes = results.flatMap((r) => r.motions).filter((m) => m.kind === 'push');
    expect(pushes.map((m) => m.from.o)).toEqual(['S', 'Y']);
    // The roll that ends lying half on a belt: nothing moves it.
    expect(results[3].state.block.o).toBe('Y');
    expect(results[3].motions).toEqual([]);
    expect(tileAt(entry('belts').level, results[3].state.block.x, results[3].state.block.y)).toBe(Tile.Conveyor);
  });

  it('show a belt held by a wall, then carrying the block onto it once lowered, and a slide braking', () => {
    const results = run(entry('iceWalls'));
    expect(results[1].held).toEqual([expect.objectContaining({ x: 4, y: 0, belt: true })]);
    expect(results[2].toggled).toBe(1);
    expect(results[3].motions.map((m) => m.kind)).toEqual(['push']);
    expect(results[4].held).toEqual([expect.objectContaining({ x: 10, y: 0, belt: false })]);
  });

  it('show both launches: standing on one pad, lying on two', () => {
    const flights = run(entry('pads')).flatMap((r) => r.motions).filter((m) => m.kind === 'fly');
    expect(flights.map((m) => m.from.o)).toEqual(['S', 'Y']);
    expect(flights.map((m) => m.to.o)).toEqual(['X', 'S']);
  });

  it('show a fling stopped short by a raised wall, then flying the full way once a press lowers it', () => {
    const results = run(entry('padWalls'));
    const flights = results.flatMap((r) => r.motions).filter((m) => m.kind === 'fly');
    expect(flights.map((m) => m.to)).toEqual([
      expect.objectContaining({ x: 6, y: 0, o: 'S' }),
      expect.objectContaining({ x: 7, y: 0, o: 'X' }),
    ]);
    expect(results[1].held).toEqual([expect.objectContaining({ x: 7, y: 0 })]);
    expect(results.filter((r) => r.toggled)).toHaveLength(1);
    expect(results[6].held).toBeFalsy();
  });

  it('show both flips: standing on one ring, lying on two', () => {
    const flips = run(entry('flips')).flatMap((r) => r.motions).filter((m) => m.kind === 'flip');
    expect(flips.map((m) => m.from.o)).toEqual(['S', 'X']);
  });

  it('show a lying block doing nothing to a heavy switch before a standing one presses it', () => {
    const results = run(entry('heavy'));
    expect(results[0].toggled).toBeFalsy();
    expect(results.some((r) => r.toggled)).toBe(true);
  });

  it('show a wall stopping a roll, then one press flipping walls and bridges together', () => {
    const results = run(entry('walls'));
    expect(results[0].outcome).toBe('bump');
    expect(results[0].bumped).toEqual({ x: 2, y: 1 });
    expect(results[1].toggled).toBe(1);
    const { level } = entry('walls');
    const up = (x: number, y: number) => wallUp(tileAt(level, x, y), 0, results[1].state.bridges, level.bridgesOn);
    expect(up(2, 1)).toBe(false);
    expect(up(1, 0)).toBe(true);
  });

  it('show a hedge holding against a lying block, then toppling into a gap for a standing one', () => {
    const results = run(entry('hedges'));
    expect(results[1].outcome).toBe('bump');
    const knocks = results.filter((r) => r.knocked);
    expect(knocks).toHaveLength(1);
    expect(knocks[0].bumped).toEqual({ x: 3, y: 2 });
    expect(knocks[0].bridged).toEqual({ x: 4, y: 2 });
  });

  it('cross the planks without breaking them', () => {
    expect(run(entry('planks')).some((r) => r.broke)).toBe(false);
    expect(run(entry('cube')).some((r) => r.broke)).toBe(false);
  });
});

describe('How To Play unlocks', () => {
  it('find each mechanic in a level that uses it', () => {
    expect(mechanicsIn(findLevel('frost-01')!.level)).toContain('ice');
    expect(mechanicsIn(findLevel('wind-01')!.level)).toContain('pads');
    expect(mechanicsIn(findLevel('star-01')!.level)).toContain('flips');
    expect(mechanicsIn(findLevel('toy-01')!.level)).toContain('tall');
    expect(mechanicsIn(findLevel('toy-02')!.level)).toContain('cube');
    expect(mechanicsIn(findLevel('glade-03')!.level)).toContain('hedges');
    expect(mechanicsIn(findLevel('frostlab-01')!.level)).toContain('iceWalls');
    expect(mechanicsIn(findLevel('peakslab-01')!.level)).toContain('padWalls');
  });

  it('open walls on ice and belts only where walls meet ice or belts', () => {
    expect(mechanicsIn(findLevel('frost-01')!.level)).not.toContain('iceWalls');
    expect(mechanicsIn(findLevel('glade-20')!.level)).not.toContain('iceWalls');
  });

  it('show a locked ring that does nothing, then flipping once a press opens it', () => {
    const results = run(entry('lockedRings'));
    expect(results[1].locked).toEqual([{ x: 3, y: 0 }]);
    expect(results.filter((r) => r.toggled)).toHaveLength(1);
    expect(results[3].state.layer).toBe(1);
    expect(results[results.length - 1].outcome).toBe('win');
  });

  it('open locked rings only where a ring has a switch color', () => {
    expect(mechanicsIn(findLevel('starlab-01')!.level)).toContain('lockedRings');
    expect(mechanicsIn(findLevel('star-08')!.level)).not.toContain('lockedRings');
  });

  it('show the cube rolling onto a switch right beside a wall, which then sinks', () => {
    const results = run(entry('shapeWalls'));
    expect(results[1].state.block).toMatchObject({ x: 3, n: 1 });
    expect(results[2].pressed).toEqual([{ x: 4, y: 0 }]);
    expect(results[results.length - 1].outcome).toBe('win');
  });

  it('open walls and shapes where walls meet a shape switch or a shaped start', () => {
    expect(mechanicsIn(findLevel('toy-09')!.level)).toContain('shapeWalls');
    expect(mechanicsIn(findLevel('toy-08')!.level)).not.toContain('shapeWalls');
  });

  it('open walls and launch pads only where walls meet pads', () => {
    expect(mechanicsIn(findLevel('wind-01')!.level)).not.toContain('padWalls');
    expect(mechanicsIn(findLevel('glade-20')!.level)).not.toContain('padWalls');
  });

  it('count a level that starts in a shape', () => {
    expect(mechanicsIn(entry('extraHeavy').level)).toEqual(expect.arrayContaining(['tall', 'extraHeavy']));
  });

  it("open Splatter Studio's entries, and Toybox's tubes, where they first appear", () => {
    expect(mechanicsIn(findLevel('toy-10')!.level)).toContain('tubes');
    expect(mechanicsIn(findLevel('toy-09')!.level)).not.toContain('tubes');
    expect(mechanicsIn(findLevel('paint-01')!.level)).toContain('split');
    expect(mechanicsIn(findLevel('paint-01')!.level)).not.toContain('paint');
    expect(mechanicsIn(findLevel('paint-06')!.level)).toContain('paint');
    expect(mechanicsIn(findLevel('paint-06')!.level)).not.toContain('mixing');
    expect(mechanicsIn(findLevel('paint-09')!.level)).toContain('mixing');
    expect(mechanicsIn(findLevel('paint-10')!.level)).toContain('mixing');
    expect(mechanicsIn(findLevel('paintlab-08')!.level)).toContain('padPaint');
    expect(mechanicsIn(findLevel('wind-01')!.level)).not.toContain('padPaint');
  });

  it('show splitting, swapping and joining, and the paint rules', () => {
    const split = run(entry('split'));
    expect(split.some((r) => r.split)).toBe(true);
    expect(split.some((r) => r.joined)).toBe(true);
    const paint = run(entry('paint'));
    // Lying through the pair of gates: red west, blue east.
    expect(paint[1].state.paint).toEqual([1, 2]);
    const mix = run(entry('mixing'));
    expect(mix.some((r) => r.washed)).toBe(true);
    expect(mix.some((r) => r.state.paint?.[0] === 5)).toBe(true); // orange
    const fly = run(entry('padPaint')).flatMap((r) => r.motions).filter((m) => m.kind === 'fly');
    expect(fly).toHaveLength(2);
  });

  it('find nothing to unlock in the Tutorial', () => {
    expect(mechanicsIn(findLevel('tutorial-05')!.level)).toEqual([]);
    expect(mechanicsIn(findLevel('tutorial-06')!.level)).toEqual([]);
  });

  it('can open every entry from the campaign', () => {
    const reachable = new Set(CAMPAIGN.flatMap((c) => c.levels.flatMap((l) => mechanicsIn(l.level))));
    for (const m of MECHANICS.filter((e) => !e.basic)) expect(reachable).toContain(m.id);
  });

  it("show a held switch keeping its wall down, and the lights going out mid-crossing", () => {
    const hold = run(entry('hold'));
    const level = entry('hold').level;
    // Held from the split on: the wall is down while the cubes cross; letting go raises it.
    expect(wallUp(Tile.WallUp, 0, hold[1].state.bridges, level.bridgesOn)).toBe(false);
    expect(wallUp(Tile.WallUp, 0, hold[hold.length - 1].state.bridges, level.bridgesOn)).toBe(true);
    expect(mechanicsIn(level)).toContain('hold');
    expect(mechanicsIn(entry('lights').level)).toContain('lights');
    expect(mechanicsIn(findLevel('chasmlab-02')!.level)).toEqual(expect.arrayContaining(['hold', 'split']));
  });
});
