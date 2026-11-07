import { describe, expect, it } from 'vitest';
import { formatLevel, parseLevel } from '../src/game/ascii';
import { hedgeFell, initialState, isBridged, isSolid, step, wallUp } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { Dir, Level, State, Tile } from '../src/game/types';
import { parseChapter } from '../src/levels/format';
import { validateLevel } from '../src/levels/validate';

function play(level: Level, moves: Dir[], from: State = initialState(level)): State {
  return moves.reduce((s, d) => step(level, s, d).state, from);
}

describe('format', () => {
  it('prints walls, reversed bridges and hedges back as written', () => {
    const rows = ['S#HIJK', 'hijk&#', 'abde0G', '&&...#'];
    expect(formatLevel(parseLevel(rows))).toBe(rows.join('\n'));
  });

  it('numbers hedges in reading order, and refuses more than it can track', () => {
    const level = parseLevel(['S&&', '.&.']);
    expect(level.hedgeCells).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }]);
    expect(level.groups.filter((_, i) => level.tiles[i] === Tile.Hedge)).toEqual([0, 1, 2]);
    expect(() => parseLevel(['S' + '&'.repeat(10)])).toThrow(/hedges/);
  });
});

describe('walls', () => {
  it('bump a block rolling into one: nothing changes and no move happened', () => {
    const level = parseLevel(['SH#']);
    const start = initialState(level);
    const r = step(level, start, 'right');
    expect(r.outcome).toBe('bump');
    expect(r.state).toBe(start);
    expect(r.bumped).toEqual({ x: 1, y: 0 });
    expect(r.knocked).toBeUndefined();
  });

  it('stop a roll with any cell it would land on, nearest first', () => {
    const far = parseLevel(['S#H']);
    expect(step(far, initialState(far), 'right').bumped).toEqual({ x: 2, y: 0 });
    const left = parseLevel(['HI#S']);
    expect(step(left, initialState(left), 'left').bumped).toEqual({ x: 1, y: 0 });
    const lying = parseLevel(['S##', '##H']);
    const across = play(lying, ['right']);
    expect(step(lying, across, 'down').outcome).toBe('bump');
  });

  it('stop a roll over a gap, so the block does not fall', () => {
    const level = parseLevel(['S.H']);
    expect(step(level, initialState(level), 'right').outcome).toBe('bump');
  });

  it('are plain floor once lowered, for standing and lying alike', () => {
    const level = parseLevel(['Sh##h#G']);
    const lying = step(level, initialState(level), 'right');
    expect(lying.outcome).toBe('ok');
    expect(lying.state.block).toEqual({ x: 1, y: 0, o: 'X' });
    expect(step(level, lying.state, 'right').state.block).toEqual({ x: 3, y: 0, o: 'S' });
    expect(play(level, ['right', 'right', 'right']).block).toEqual({ x: 4, y: 0, o: 'X' });
  });

  it('flip with their color, each piece from where it started', () => {
    const level = parseLevel(['So#HhIi'], [0]);
    const at = (s: State, x: number) => wallUp(level.tiles[x], level.groups[x], s.bridges, level.bridgesOn);
    const start = initialState(level);
    expect([3, 4, 5, 6].map((x) => at(start, x))).toEqual([true, false, true, false]);
    const pressed = { ...start, bridges: 1 };
    expect([3, 4, 5, 6].map((x) => at(pressed, x))).toEqual([false, true, true, false]);
    const again = { ...start, bridges: 0 };
    expect([3, 4, 5, 6].map((x) => at(again, x))).toEqual([true, false, true, false]);
  });

  it('keep their starting position when their group starts switched on', () => {
    const level = parseLevel(['S#Hh'], [], 1);
    const start = initialState(level);
    expect(wallUp(level.tiles[2], 0, start.bridges, level.bridgesOn)).toBe(true);
    expect(wallUp(level.tiles[3], 0, start.bridges, level.bridgesOn)).toBe(false);
  });

  it('trade with a bridge of the same color on one press', () => {
    // Rolling onto the switch both lowers the wall and pulls the bridge in.
    const level = parseLevel(['o#S', 'H##', '#.0'], [0], 1);
    const start = initialState(level);
    expect(step(level, start, 'left').state.block).toEqual({ x: 0, y: 0, o: 'X' });
    const pressed = step(level, start, 'left');
    expect(pressed.pressed).toEqual([{ x: 0, y: 0 }]);
    expect(pressed.toggled).toBe(1);
    expect(wallUp(level.tiles[3], 0, pressed.state.bridges, level.bridgesOn)).toBe(false);
  });

  it('wait while the block is on them, then stop it coming back', () => {
    const level = parseLevel(['S#oh##']);
    // Standing just before the switch, then lying across the switch and the lowered wall.
    const before = { block: { x: 1, y: 0, o: 'S' as const }, bridges: 0, layer: 0 };
    const on = step(level, before, 'right');
    expect(on.outcome).toBe('ok');
    expect(on.state.block).toEqual({ x: 2, y: 0, o: 'X' });
    expect(on.pressed).toEqual([{ x: 2, y: 0 }]);
    // The wall is up now, and the block rests on it without falling or being moved.
    expect(wallUp(level.tiles[3], 0, on.state.bridges, level.bridgesOn)).toBe(true);
    const off = step(level, on.state, 'right');
    expect(off.outcome).toBe('ok');
    expect(off.state.block).toEqual({ x: 4, y: 0, o: 'S' });
    const back = step(level, off.state, 'left');
    expect(back.outcome).toBe('bump');
    expect(back.bumped).toEqual({ x: 3, y: 0 });
  });
});

describe('walls on Frost Isle', () => {
  it('stop a slide on the tile before them', () => {
    const level = parseLevel(['S~~~~~H#']);
    const r = step(level, initialState(level), 'right');
    expect(r.outcome).toBe('ok');
    expect(r.state.block).toEqual({ x: 4, y: 0, o: 'X' });
    expect(r.motions.map((m) => m.kind)).toEqual(['slide']);
    expect(r.held).toEqual([{ x: 6, y: 0, dir: 'right', belt: false, after: 1 }]);
  });

  it('stop a slide before it starts when they stand right in front', () => {
    const level = parseLevel(['S~~H#']);
    const r = step(level, initialState(level), 'right');
    expect(r.state.block).toEqual({ x: 1, y: 0, o: 'X' });
    expect(r.motions).toEqual([]);
    expect(r.held).toEqual([{ x: 3, y: 0, dir: 'right', belt: false, after: 0 }]);
  });

  it('stop a sideways slide when they touch only one end of the block', () => {
    const level = parseLevel(['S~~~#', '#~~H#']);
    const r = step(level, { block: { x: 1, y: 0, o: 'Y' }, bridges: 0, layer: 0 }, 'right');
    // Lying along y on x=1, sliding right: the wall at (3,1) is in the way of its lower end at x=3.
    expect(r.state.block).toEqual({ x: 2, y: 0, o: 'Y' });
    expect(r.held?.[0]).toMatchObject({ x: 3, y: 1 });
  });

  it('let a slide pass once lowered, and low stone holds like a raised wall', () => {
    const sunk = parseLevel(['S~~~h#']);
    expect(step(sunk, initialState(sunk), 'right').state.block).toEqual({ x: 3, y: 0, o: 'X' });
    // No switch for its color: it never moves, and it still holds.
    const low = parseLevel(['S~~~K#']);
    expect(step(low, initialState(low), 'right').state.block).toEqual({ x: 2, y: 0, o: 'X' });
  });

  it('stand in for a switch: a press lowers the brake and the next slide runs on', () => {
    const level = parseLevel(['S~~~~H~~.', '#o#######']);
    const first = step(level, initialState(level), 'right');
    expect(first.state.block).toEqual({ x: 3, y: 0, o: 'X' });
    const lowered = { ...first.state, bridges: first.state.bridges ^ 1 };
    expect(step(level, lowered, 'right').outcome).toBe('ok');
  });

  it('keep a belt from pushing, and the block stays put', () => {
    const level = parseLevel(['S#>H#']);
    const r = step(level, { block: { x: 0, y: 0, o: 'X' }, bridges: 0, layer: 0 }, 'right');
    expect(r.outcome).toBe('ok');
    expect(r.state.block).toEqual({ x: 2, y: 0, o: 'S' });
    expect(r.motions).toEqual([]);
    expect(r.held).toEqual([{ x: 3, y: 0, dir: 'right', belt: true, after: 0 }]);
  });

  it('stop a slide that a belt started', () => {
    const level = parseLevel(['Svv#', '#~~#', '#~~#', '#~~#', '#H##']);
    const r = step(level, initialState(level), 'right');
    expect(r.motions.map((m) => m.kind)).toEqual(['push', 'slide']);
    expect(r.state.block).toEqual({ x: 1, y: 3, o: 'X' });
    expect(r.held).toEqual([{ x: 1, y: 4, dir: 'down', belt: false, after: 2 }]);
  });

  it('do not stop flights or anything else that never touches them', () => {
    const level = parseLevel(['S~~~~#', '######']);
    expect(step(level, initialState(level), 'right').held).toBeUndefined();
  });
});

describe('reversed bridges', () => {
  it('are out when a digit bridge of their color is in', () => {
    const reversed = parseLevel(['S#a']);
    expect(step(reversed, initialState(reversed), 'right').outcome).toBe('ok');
    const digit = parseLevel(['S#0']);
    expect(step(digit, initialState(digit), 'right').outcome).toBe('fall');
  });

  it('trade places with a digit bridge on a press', () => {
    const level = parseLevel(['So#0a#']);
    const pressed = play(level, ['right']);
    expect(pressed.bridges).toBe(1);
    const onDigit = step(level, pressed, 'right');
    expect(onDigit.outcome).toBe('ok');
    expect(onDigit.state.block).toEqual({ x: 3, y: 0, o: 'S' });
    expect(step(level, onDigit.state, 'right').outcome).toBe('fall');
  });
});

describe('toppling hedges', () => {
  it('topple along the roll for a standing block, which stays put, and that is a move', () => {
    const level = parseLevel(['S&.#']);
    const start = initialState(level);
    const r = step(level, start, 'right');
    expect(r.outcome).toBe('ok');
    expect(r.knocked).toBe(true);
    expect(r.bumped).toEqual({ x: 1, y: 0 });
    expect(r.state.block).toEqual(start.block);
    expect(hedgeFell(0, r.state.hedges ?? 0)).toBe('right');
  });

  it('turn the empty tile they land on into floor, and leave their own tile as floor', () => {
    const level = parseLevel(['S&.#']);
    const r = step(level, initialState(level), 'right');
    expect(r.bridged).toEqual({ x: 2, y: 0 });
    expect(isSolid(level, 2, 0, 0, r.state.hedges)).toBe(true);
    expect(isBridged(level, 2, 0, r.state.hedges ?? 0)).toBe(true);
    const lying = step(level, r.state, 'right');
    expect(lying.outcome).toBe('ok');
    expect(lying.state.block).toEqual({ x: 1, y: 0, o: 'X' });
    expect(step(level, lying.state, 'right').outcome).toBe('ok');
  });

  it('fall only one way: the side you knock from decides where they land', () => {
    const level = parseLevel(['..#..', '.#&.#', '..#..', '..S..']);
    const from = { block: { x: 2, y: 3, o: 'S' as const }, bridges: 0, layer: 0 };
    const r = step(level, from, 'up');
    expect(r.bumped).toEqual({ x: 2, y: 1 });
    expect(hedgeFell(0, r.state.hedges ?? 0)).toBe('up');
    expect(r.bridged).toBeUndefined();
    expect(isSolid(level, 3, 1, 0, r.state.hedges)).toBe(false);
  });

  it('are wasted falling onto something solid', () => {
    const level = parseLevel(['S&##']);
    const r = step(level, initialState(level), 'right');
    expect(r.knocked).toBe(true);
    expect(r.bridged).toBeUndefined();
  });

  it('do not fill a retracted bridge', () => {
    const level = parseLevel(['S&0#']);
    const r = step(level, initialState(level), 'right');
    expect(r.knocked).toBe(true);
    expect(r.bridged).toBeUndefined();
    expect(isSolid(level, 2, 0, 0, r.state.hedges)).toBe(false);
  });

  it('are wasted falling onto a tile another hedge already bridged', () => {
    const level = parseLevel(['S&.&#']);
    const first = step(level, initialState(level), 'right');
    expect(first.bridged).toEqual({ x: 2, y: 0 });
    const from = { block: { x: 4, y: 0, o: 'S' as const }, bridges: 0, layer: 0, hedges: first.state.hedges };
    const second = step(level, from, 'left');
    expect(second.knocked).toBe(true);
    expect(second.bridged).toBeUndefined();
  });

  it('hold against a lying block, and no move happened', () => {
    const level = parseLevel(['S##&.', '###..']);
    const lying = play(level, ['right']);
    const r = step(level, lying, 'right');
    expect(r.outcome).toBe('bump');
    expect(r.knocked).toBeUndefined();
    expect(r.state).toBe(lying);
  });

  it('hold against a lying block rolling sideways', () => {
    const level = parseLevel(['S##', '#&#', '...']);
    const r = step(level, play(level, ['right']), 'down');
    expect(r.outcome).toBe('bump');
  });

  it('topple from two tiles away, since the roll would land on them too', () => {
    const level = parseLevel(['S#&.']);
    const r = step(level, initialState(level), 'right');
    expect(r.knocked).toBe(true);
    expect(r.bumped).toEqual({ x: 2, y: 0 });
    expect(r.bridged).toEqual({ x: 3, y: 0 });
  });

  it('cannot fall onto a hedge still up: a line has to go from the far end or the side', () => {
    const level = parseLevel(['S&&.']);
    const r = step(level, initialState(level), 'right');
    expect(r.outcome).toBe('bump');
    expect(r.bumped).toEqual({ x: 1, y: 0 });
    expect(r.knocked).toBeUndefined();
  });

  it('can fall onto a hedge that has already gone', () => {
    const level = parseLevel(['S&&.']);
    const hedges = 4 << 3; // The second hedge fell right.
    const r = step(level, { ...initialState(level), hedges }, 'right');
    expect(r.knocked).toBe(true);
    expect(hedgeFell(0, r.state.hedges ?? 0)).toBe('right');
    expect(hedgeFell(1, r.state.hedges ?? 0)).toBe('right');
  });

  it('cannot fall onto a raised wall, but can onto a lowered one', () => {
    const up = parseLevel(['S&H']);
    expect(step(up, initialState(up), 'right').outcome).toBe('bump');
    const down = parseLevel(['S&h']);
    const r = step(down, initialState(down), 'right');
    expect(r.knocked).toBe(true);
    expect(r.bridged).toBeUndefined();
  });

  it('stay up behind a wall in front of them', () => {
    const level = parseLevel(['SH&.']);
    const r = step(level, initialState(level), 'right');
    expect(r.outcome).toBe('bump');
    expect(r.knocked).toBeUndefined();
  });

  it('stay fallen for the rest of the level, through other moves', () => {
    const level = parseLevel(['S&.##']);
    const s = play(level, ['right', 'right', 'right', 'left']);
    expect(hedgeFell(0, s.hedges ?? 0)).toBe('right');
  });

  it('hold against the light cube', () => {
    const level = parseLevel(['S&.'], [], 0, 1);
    expect(step(level, initialState(level), 'right').outcome).toBe('bump');
  });

  it('keep each hedge apart in the state', () => {
    const level = parseLevel(['S&.', '#..', '&..', '...']);
    const r = step(level, { block: { x: 0, y: 1, o: 'S' }, bridges: 0, layer: 0, hedges: 4 }, 'down');
    expect(hedgeFell(0, r.state.hedges ?? 0)).toBe('right');
    expect(hedgeFell(1, r.state.hedges ?? 0)).toBe('down');
  });
});

describe('the solver', () => {
  it('treats a knocked hedge as a different state, and counts the knock as a move', () => {
    const level = parseLevel(['S&.G']);
    // Topple it into the gap, lie across both, stand on the goal.
    expect(solve(level)?.moves).toEqual(['right', 'right', 'right']);
  });

  it('takes the side that bridges the gap, not the nearest one', () => {
    // The start is north of the hedge, which would drop it south onto floor. It has to go east, from the west.
    const level = parseLevel(['.###S....', '.####....', '.###&.##G', '.####....', '.........']);
    const solution = solve(level);
    expect(solution).not.toBeNull();
    let s = initialState(level);
    for (const d of solution!.moves) s = step(level, s, d).state;
    expect(hedgeFell(0, s.hedges ?? 0)).toBe('right');
  });

  it('does not count a bump as progress', () => {
    const level = parseLevel(['SI', '.#']);
    expect(solve(level)).toBeNull();
  });
});

describe('validation', () => {
  const report = (grid: string) => {
    const chapter = parseChapter('x', `=== x-01\n${grid}`);
    return validateLevel(chapter.levels[0], chapter).errors.join(' ');
  };

  it('accepts walls and hedges among the basics', () => {
    expect(report('S&#G')).not.toMatch(/only mix/);
  });

  it('asks for room around a hedge, so it can always fall onto something the player can see', () => {
    expect(report('S&#G')).toMatch(/edge of the grid/);
    expect(report('.....\nS&.#G\n.....')).not.toMatch(/edge of the grid/);
  });

  it('refuses walls and hedges with mechanics whose interactions are not settled', () => {
    for (const grid of ['S&~G', 'S&>G', 'SHRG', 'S&+G', 'SHcG', 'S&XG']) expect(report(grid)).toMatch(/only mix/);
    expect(report('S&#G\n---\n....')).toMatch(/only mix/);
  });

  it('accepts walls with ice and belts (Frost Isle)', () => {
    for (const grid of ['SH~G', 'SK>G', 'Sh~>G']) expect(report(grid)).not.toMatch(/only mix/);
  });
});
