import { describe, expect, it } from 'vitest';
import { parseLevel, parseLamps, formatLamps, formatLevel } from '../src/game/ascii';
import { Played, darkRewind, darkSteps, lightingAt, lampsOf } from '../src/game/lights';
import { initialState, play, step, swap, wallUp } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { Move, State, Tile } from '../src/game/types';
import { lightErrors } from '../src/levels/validate';

/** Play moves (`R`, `T` for a swap), keeping every step for the lights. */
function playAll(level: ReturnType<typeof parseLevel>, letters: string): { played: Played[]; last: ReturnType<typeof step> | null; start: State } {
  const start = initialState(level);
  const dirs: Record<string, Move> = { U: 'up', D: 'down', L: 'left', R: 'right', T: 'swap' };
  let state = start;
  const played: Played[] = [];
  let last = null;
  for (const c of letters) {
    const r = play(level, state, dirs[c]);
    if (r.outcome === 'bump') continue;
    state = r.state;
    played.push({ state, roll: dirs[c] !== 'swap' });
    last = r;
  }
  return { played, last, start };
}

describe('held switches', () => {
  // The cube popping east lands on the held switch; the wall south of it is group 0.
  const level = parseLevel(['S##]O', '...#H', '....G']);

  it('switch their group only while something rests on them', () => {
    const { played } = playAll(level, 'RR');
    expect(wallUp(Tile.WallUp, 0, played[1].state.bridges, 0)).toBe(false);
    // Rolling back into the other cube joins them over the switch: still held.
    const joined = playAll(level, 'RRL');
    expect(joined.last?.joined).toBeTruthy();
    expect(wallUp(Tile.WallUp, 0, joined.played[2].state.bridges, 0)).toBe(false);
    const heldByIdle = playAll(level, 'RRT');
    // A swap changes nothing: the idle cube still holds.
    expect(wallUp(Tile.WallUp, 0, heldByIdle.played[2].state.bridges, 0)).toBe(false);
  });

  it('let a wall that comes up under a cube wait, and the holder join it there', () => {
    const { last, played } = playAll(level, 'RRTDRTD');
    expect(last?.joined).toEqual({ x: 4, y: 1 });
    expect(played[played.length - 1].state.block).toEqual({ x: 4, y: 0, o: 'Y' });
    const won = step(level, played[played.length - 1].state, 'down');
    expect(won.outcome).toBe('win');
    // Leaving the switch raised the wall behind the block.
    expect(wallUp(Tile.WallUp, 0, won.state.bridges, 0)).toBe(true);
  });

  it('drop the idle cube when letting go retracts its bridge', () => {
    // Held, bridge 0 is out; the moving cube steps off, and the idle cube on the bridge falls.
    const l = parseLevel(['S##]O', '...0.']);
    const s1 = step(l, initialState(l), 'right');
    const s2 = step(l, s1.state, 'right');
    expect(s2.state.bridges & 1).toBe(1);
    const t = swap(s2.state);
    const onBridge = step(l, t, 'down');
    expect(onBridge.outcome).toBe('ok');
    // The holder rolls west onto the empty splitter (a cube doesn't split), letting go.
    const back = step(l, swap(onBridge.state), 'left');
    expect(back.outcome === 'fall' ? back.dropped : null).toEqual({ x: 3, y: 1 });
  });

  it('feed the solver: the only way through parks a cube on the wall', () => {
    const sol = solve(level);
    expect(sol?.moves).toEqual(['right', 'right', 'down', 'right', 'down', 'down']);
  });
});

describe('lights', () => {
  const level = parseLevel(['S##*,,,,,G'], [], 0, 2, [], parseLamps('2'));

  it('parse lamps and dark tiles, and print them back', () => {
    expect(parseLamps('6 held held/2 4/1')).toEqual([{ color: 0, timer: 6 }, { color: 0, timer: 0 }, { color: 2, timer: 0 }, { color: 1, timer: 4 }]);
    expect(() => parseLamps('0')).toThrow();
    expect(lampsOf(level)).toEqual([{ x: 3, y: 0, layer: 0, color: 0, timer: 2 }]);
    expect(formatLamps(level)).toBe('2');
    expect(formatLevel(level)).toBe('S##*,,,,,G');
    expect(formatLevel(parseLevel(["S;'\"#"]))).toBe("S;'\"#");
  });

  it('light a timed lamp for its count, rolls only, and restart on a second press', () => {
    const { played, start } = playAll(level, 'RRRRRR');
    const lit = (k: number) => lightingAt(level, start, played, k);
    expect(lit(1).lit).toBe(0);
    expect(lit(2)).toEqual({ lit: 1, left: [2] });
    expect(lit(3)).toEqual({ lit: 1, left: [1] });
    expect(lit(4)).toEqual({ lit: 0, left: [0] });
  });

  it('light a held lamp while anything rests on it', () => {
    const l = parseLevel(['...*,,..,,', 'S##A,,..,,', '.....,,,,G'], [], 0, 2, [], parseLamps('held'));
    // Split: the new cube pops onto the lamp; a swap keeps it lit (the idle cube holds it); joining
    // over the lamp keeps it lit; rolling the block off puts it out.
    const { played, start } = playAll(l, 'RRTUR');
    expect(lightingAt(l, start, played, 1).lit).toBe(0);
    expect(lightingAt(l, start, played, 2).lit).toBe(1);
    expect(lightingAt(l, start, played, 3).lit).toBe(1);
    expect(lightingAt(l, start, played, 4).lit).toBe(1);
    expect(lightingAt(l, start, played, 5).lit).toBe(0);
  });

  it('rewind a fall in the dark to when the light went out, and leave other falls alone', () => {
    // Press, two lit moves, then fall north off the dark path at (6..8).
    const lost = playAll(level, 'RRRRU');
    expect(lost.last?.outcome).toBe('fall');
    expect(darkRewind(level, lost.start, lost.played)).toBe(4);
    // A fall off the start island, far from dark tiles, is an ordinary fall.
    const plain = playAll(level, 'U');
    expect(darkRewind(level, plain.start, plain.played)).toBe(null);
    // A fall while the path is still lit is ordinary too.
    const litFall = playAll(level, 'RRRU');
    expect(darkRewind(level, litFall.start, litFall.played)).toBe(null);
  });

  it('count the steps a solution takes in the dark', () => {
    const { played, start } = playAll(level, 'RRRRRR');
    const dirs = ['right', 'right', 'right', 'right', 'right', 'right'];
    expect(darkSteps(level, start, played, dirs)).toEqual({ steps: 2, turns: 0, litCrossings: 1, unseen: 0 });
    // Never pressing the light, every dark step is unseen.
    const blind = parseLevel(['S##,,,,,,G', '...*......'], [], 0, 2, [], parseLamps('2'));
    expect(darkSteps(blind, initialState(blind), playAll(blind, 'RRRRRR').played, []).unseen).toBe(4);
  });

  it('keep lights and walls apart, one kind per color', () => {
    expect(lightErrors(level)).toEqual([]);
    expect(lightErrors(parseLevel(['S,#G']))).toEqual(['dark tiles in light color 0 have no light switch']);
    expect(lightErrors(parseLevel(['S*#H,o', '#####G'], [0], 0, 2, [], parseLamps('held')))[0]).toMatch(/also a switch color/);
    expect(lightErrors(parseLevel(['SoO#H#G'])).some((e) => /held and press/.test(e))).toBe(true);
  });
});
