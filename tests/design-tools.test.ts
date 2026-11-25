import { describe, expect, it } from 'vitest';
import { solve } from '../src/game/solver';
import { Tile } from '../src/game/types';
import { findLevel } from '../src/levels';
import solutions from '../SOLUTIONS.md?raw';
import { directions, solutionsMarkdown } from '../scripts/design/arrows';
import { explore, movesText, pathTo } from '../scripts/design/explore';
import { levelColors, lightReport } from '../scripts/design/checks';
import { backstops, block, Draft, dropUnreachable, heldFloor, idleSpecials, noBackstopPar, quickRepresses, flipNS, hidden, lint, plainWalls, plankify, regrow, strip, switchOrder, toLevel, wallColors } from '../scripts/design/checks';

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

  it('lint rings in switch colors, and warn on a wall over a ring or a locked ring nothing opens', () => {
    const lines = lint(draft(['S##M#o', '---', '...##G'], [0])).join('\n');
    expect(lines).toContain('the ring at 3,0 on the ground is orange, starting locked');
    expect(lint(draft(['S##P#G', '---', '...##.'])).join('\n')).toMatch(/WARN: the ring at 3,0 .* no purple switch opens it/);
    expect(lint(draft(['S##+#G', '---', '...K..'])).join('\n')).toMatch(/WARN: the ring at 3,0 .* wall over it/);
  });

  it('read a chapter level with switches on the ceiling as its file does', () => {
    expect(switchOrder(findLevel('star-13')!.level)).toEqual([0, 0, 1, 0]);
  });

  it('check ring colors with the walls: a locked ring the solution flips through has to open', () => {
    expect(wallColors(findLevel('starlab-01')!.level)).toEqual([expect.objectContaining({ group: 0, rings: 1, moves: true })]);
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

  it('flip and strip paint levels, keeping gate colors and splitter sides', () => {
    // Gates list their colors in reading order (1 red, 2 blue), so a flip re-orders them; a south splitter faces north.
    const d: Draft = { ...draft(['S#V#{', '##r#{', '....G']), gates: [1, 2] };
    const f = flipNS(d);
    expect(f.rows).toEqual(['....G', '##r#{', 'S#A#{']);
    expect(f.gates).toEqual([2, 1]);
    expect(block('t', f)).toContain('!gates blue red');
    // strip never removes a gate: the colors line would no longer match the grid.
    const gated: Draft = { ...draft(['Sr#{##G', '.......']), gates: [1] };
    expect(strip(gated).rows[0]).toContain('{');
  });

  it('see what a raised wall hides from the opening camera', () => {
    const level = toLevel(draft(['....G', 'S##v#', '...H.', '..o..']));
    expect(hidden(level)).toEqual(['belt at 3,1 is behind the orange wall at 3,2']);
  });

  it('see what a glass tube hides, straight south or one tile toward the middle', () => {
    // West of the middle, a tube one south and one east covers the tile (toy-15's cube switch).
    expect(hidden(toLevel(draft(['.c.......', '#S===####', '.......G.'])))).toEqual(['shape switch at 1,0 is behind the tube at 2,1']);
    // A tube behind a tube, and a tile with only floor in front, say nothing.
    expect(hidden(toLevel(draft(['..|......', 'S#|####G.', '..|......'])))).toEqual([]);    // A dark tile behind a tube can't be seen even while it's lit.
    expect(hidden(toLevel({ ...draft(['.,.......', '*S===####', '.......G.']), lamps: [{ color: 0, timer: 0 }] }))).toEqual(['dark tile at 1,0 is behind the tube at 2,1']);
  });

  it('lint the mistakes that cost the most rounds', () => {
    // A heavy switch first in reading order quietly takes the first group.
    expect(lint(draft(['....x', 'S#o#H', '....G'], [1, 0])).join('\n')).toContain('x@4,0→purple o@2,1→orange');
    // Floor behind a belt that pushes at a wall: the block can skip the ride.
    expect(lint(draft(['..G..', '..#..', '..H..', 'S#^#o', '..#..'])).join('\n')).toMatch(/skips the ride/);
    // A goal the block only ever reaches lying.
    expect(lint(draft(['S###G#'])).join('\n')).toMatch(/only ever reached lying/);
    expect(lint(draft(['S' + '#'.repeat(23) + 'G'])).join('\n')).toMatch(/bigger than any board/);
    expect(lint(draft(['S', ...Array(10).fill('#'), 'G'])).join('\n')).toMatch(/12 rows deep/);
    expect(lint(draft(['S', ...Array(7).fill('#'), 'G'])).join('\n')).not.toMatch(/rows deep/);
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

  it('flag a belt that never pushes and a pad that never fires', () => {
    // The block only ever rolls across the belt lying, half on it; the pad is out of reach.
    const level = toLevel(draft(['S#>##G', '......', '....R.']));
    const idle = idleSpecials(level);
    expect(idle).toHaveLength(2);
    expect(idle[0]).toContain('belt at 2,0');
    expect(idle[1]).toContain('pad at 4,2');
    // Stood on, the belt pushes, so it isn't flagged.
    expect(idleSpecials(toLevel(draft(['S##>G'])))).toEqual([]);
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
  it('follow a split: swaps in the directions and in explored paths, splitters that cannot split', () => {
    const level = findLevel('splitlab-01')!.level;
    // ↹ marks a Tab before a roll, ✂ the move that splits; the count is rolls only.
    const arrows = directions(level).join(' ');
    expect(arrows).toContain('✂');
    expect(arrows).toContain('↹');
    // Explored paths carry the swaps, and the two cubes count as one state whichever moves.
    const ex = explore(level);
    const won = [...ex.nodes.keys()].find((k) => k.includes('+'))!;
    expect(movesText(pathTo(ex, won))).toMatch(/^[UDLRT]+$/);
    // Par counts rolls; the steps add the swaps.
    const sol = solve(level)!;
    expect(sol.steps.length).toBeGreaterThan(sol.moves.length);
    expect(lint(draft(['.....', 'S#A##', '.....'])).join(' ')).toContain('onto nothing');
    expect(idleSpecials(toLevel(draft(['.....', 'S#A##', '.....']))).join(' ')).toContain('never splits');
  });
  it('lint paint: a gate whose colors no tray provides, and a gate nothing ever passes', () => {
    const d = { ...draft(['.........', 'S#r#{#C..', '...#..#..', '...{###..', '.........']), shape: 1, gates: [2, 1] };
    const warnings = lint(d).join(' ');
    expect(warnings).toContain('blue gate, but no blue tray');
    expect(warnings).toContain('gate at 4,1 is never passed');
    // A purple gate needs red and blue: here blue is missing.
    expect(lint({ ...d, gates: [4, 1] }).join(' ')).toContain('purple gate, but no blue tray');
  });
  it('list a paint level\'s colors, for rotating them through a chapter', () => {
    expect(levelColors(findLevel('paintlab-04')!.level)).toEqual(['red', 'yellow', 'orange']);
    expect(levelColors(findLevel('glade-01')!.level)).toEqual([]);
  });
  it('report the Chasm: dark steps and turns, a route that guesses, lamps and held switches', () => {
    const r = lightReport(findLevel('chasmlab-01')!.level, solve(findLevel('chasmlab-01')!.level)!.steps)!;
    expect(r).toMatchObject({ dark: 10, unseen: 0, holds: 0 });
    expect(r.turns).toBeGreaterThan(2);
    const held = lightReport(findLevel('chasmlab-02')!.level, solve(findLevel('chasmlab-02')!.level)!.steps)!;
    expect(held.holds).toBeGreaterThan(0);
    expect(held.releases).toBe(1);
    // The light is off the route: the best route walks the dark path blind.
    const blind = lint({ ...draft(['S##,,,,,,G', '...*......']), lamps: [{ color: 0, timer: 2 }] }).join(' ');
    expect(blind).toContain('par asks for a guess');
    expect(blind).toContain('light switch at 3,1 is never rested on');
    // Lamps and held switches show in the lint listing, with their kind; their order survives a flip.
    expect(lint(draft(['...O.....', '...#.....', 'S##]##H#G'])).join(' ')).toContain('O@3,0→orange');
    const two = { ...draft(['S*,,G', '.*;;.']), lamps: [{ color: 0, timer: 3 }, { color: 1, timer: 0 }] };
    expect(flipNS(two).lamps).toEqual([{ color: 1, timer: 0 }, { color: 0, timer: 3 }]);
    expect(block('x', two)).toContain('!lamps 3 held/1');
  });

  it('price a held rail: its switches and bridges as floor', () => {
    // Riding lying across a switch and the bridge it holds; as floor, the block simply walks.
    const rail = toLevel(draft(['..S......', '..OOOOO..', '..#0000..', '......G..']));
    const flat = heldFloor(rail)!;
    expect(flat.tiles.filter((t) => t === Tile.HoldSwitch || t === Tile.Bridge)).toHaveLength(0);
    expect(solve(rail)!.moves.length).toBe(6);
    expect(solve(flat)!.moves.length).toBeLessThanOrEqual(6);
    expect(heldFloor(toLevel(draft(['S#G'])))).toBeNull();
  });

  it('count backstops: an idle cube holding the push of a belt, and the par without them', () => {
    // Two currents: the first cube parks in the second's last lane, and the second is held beside it.
    const rivers = toLevel(draft([
      '....vvvv...^^^...',
      '...#vvvv...^^^...',
      'S##Avvvv...^^^...',
      '...#vvvv...^^^##.',
      '....vvvv...^^^###',
      '....vvvv#..^^^..#',
      '....vvvv###^^^..G',
      '....vvvv...^^^...',
    ]));
    const sol = solve(rivers)!;
    expect(backstops(rivers, sol.steps)).toBeGreaterThan(0);
    expect(noBackstopPar(rivers)).toBe(sol.moves.length + 1);
  });
});
