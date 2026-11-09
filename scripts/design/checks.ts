// Checks and transforms shared by the design tools: does each switch-wall color have to move, strip what
// a solution doesn't need, regrow decoys that keep the puzzle, flip a board north to south, find what a
// raised wall hides from the opening camera, and lint a draft for the mistakes that cost the most rounds.
import { formatLevel, parseLevel } from '../../src/game/ascii';
import { DIR_DELTA, DIRS, Level, Tile } from '../../src/game/types';
import { blockCells, findGoal } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { flipUses, iceUses, padUses, shapeUses } from '../../src/levels/validate';
import { closest, explore } from './explore';

/** A level as the tools hold it: text rows plus the options a design block carries. */
export interface Draft {
  rows: string[];
  switches: number[];
  /** Bridge groups that start extended. */
  on: number[];
  shape: number;
}

export const COLOR = ['orange', 'purple', 'blue', 'red'];
const SWITCH_CHARS = 'oxX';
const isWall = (t: Tile) => t === Tile.WallUp || t === Tile.WallDown;
const isSwitch = (t: Tile) => t === Tile.SoftSwitch || t === Tile.HeavySwitch || t === Tile.ExtraHeavy;

export function toLevel(d: Draft): Level {
  return parseLevel(d.rows, d.switches, d.on.reduce((m, g) => m | (1 << g), 0), d.shape);
}

/** The level, or null if the rows don't parse. */
export function tryLevel(d: Draft): Level | null {
  try {
    return toLevel(d);
  } catch {
    return null;
  }
}

export const parOf = (level: Level | null): number | null => (level ? solve(level)?.moves.length ?? null : null);

/** Groups that some switch in the level presses. */
function switchGroups(level: Level): Set<number> {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  const groups = [...level.groups, ...(level.ceiling?.groups ?? [])];
  return new Set(tiles.flatMap((t, i) => (isSwitch(t) ? [groups[i]] : [])));
}

export interface WallColor {
  group: number;
  walls: number;
  bridges: number;
  /** Par with every wall of this color lowered for good, and raised for good; null if unsolvable. */
  allDown: number | null;
  allUp: number | null;
  /** The level needs these walls to move: fixing them either way changes the par. */
  moves: boolean;
}

const isBridgeTile = (t: Tile) => t === Tile.Bridge || t === Tile.BridgeReversed;

/**
 * For each switch color: fix everything it moves one way for good, then the other way, and re-solve.
 * Walls go all down (floor) and all up (walls no switch moves); bridges all out (floor) and all in (gaps).
 * A color only earns its place if both change the par. Walls of a color with no switch never move (low
 * stone), so they aren't checked. One-layer levels only: a two-layer level reports nothing.
 */
export function wallColors(level: Level, base = parOf(level)): WallColor[] {
  if (level.ceiling) return [];
  const pressed = switchGroups(level);
  const movers = (t: Tile) => isWall(t) || isBridgeTile(t);
  const groups = [...new Set(level.tiles.flatMap((t, i) => (movers(t) && pressed.has(level.groups[i]) ? [level.groups[i]] : [])))];
  return groups.map((g) => {
    const fixed = (up: boolean) => {
      const l = { ...level, tiles: level.tiles.slice(), groups: level.groups.slice() };
      l.tiles.forEach((t, i) => {
        if (level.groups[i] !== g) return;
        if (isWall(t)) {
          l.tiles[i] = up ? Tile.WallUp : Tile.Floor;
          l.groups[i] = up ? 9 : -1;
        } else if (isBridgeTile(t)) {
          l.tiles[i] = up ? Tile.Empty : Tile.Floor;
          l.groups[i] = -1;
        }
      });
      return parOf(l);
    };
    const allDown = fixed(false);
    const allUp = fixed(true);
    const walls = level.tiles.filter((t, i) => isWall(t) && level.groups[i] === g).length;
    const bridges = level.tiles.filter((t, i) => isBridgeTile(t) && level.groups[i] === g).length;
    return { group: g, walls, bridges, allDown, allUp, moves: allDown !== base && allUp !== base };
  });
}

export const wallsText = (colors: WallColor[]) =>
  colors
    .map((c) => {
      const what = [c.walls ? `${c.walls} wall${c.walls > 1 ? 's' : ''}` : '', c.bridges ? `${c.bridges} bridge${c.bridges > 1 ? 's' : ''}` : ''].filter(Boolean).join(' + ');
      return `${COLOR[c.group] ?? `group ${c.group}`} (${what}): ${c.moves ? 'moves' : 'NEED NOT MOVE'} (down/out ${c.allDown ?? 'X'}, up/in ${c.allUp ?? 'X'})`;
    })
    .join(' · ');

/** Which switch this cell is, in reading order; -1 if it isn't one. */
function switchIndex(rows: string[][], x0: number, y0: number): number {
  let k = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (!SWITCH_CHARS.includes(rows[y][x])) continue;
      if (x === x0 && y === y0) return k;
      k++;
    }
  }
  return -1;
}

/** Remove every tile the solution doesn't need, keeping par (and dropping a removed switch's group). */
export function strip(d: Draft, keep = ''): Draft {
  const rows = d.rows.map((r) => [...r]);
  let switches = [...d.switches];
  const current = () => ({ ...d, rows: rows.map((r) => r.join('')), switches });
  const par = parOf(tryLevel(current()));
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const c = rows[y][x];
        if (c === '.' || c === 'S' || c === 'G' || keep.includes(c) || /^-+$/.test(rows[y].join(''))) continue;
        const k = switchIndex(rows, x, y);
        const saved = [...switches];
        if (k >= 0) switches.splice(k, 1);
        rows[y][x] = '.';
        if (parOf(tryLevel(current())) === par) changed = true;
        else {
          rows[y][x] = c;
          switches = saved;
        }
      }
    }
  }
  return current();
}

/**
 * Add back tiles from the full layout to a stripped one, one at a time, keeping each only if par holds
 * and every wall color that had to move still does. Switch walls and switches stay as stripped (low
 * stone can come back: on ice, stone stops a slide where a gap drops the block). The tiles that
 * come back are wrong turns and decoys: more states, the same puzzle.
 */
export function regrow(stripped: Draft, full: Draft): Draft {
  const rows = stripped.rows.map((r) => [...r]);
  const current = () => ({ ...stripped, rows: rows.map((r) => r.join('')) });
  const base = parOf(tryLevel(current()));
  const moving = (l: Level) => wallColors(l, base).filter((c) => c.moves).map((c) => c.group).sort().join();
  const before = moving(toLevel(current()));
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const want = full.rows[y]?.[x] ?? '.';
      if (rows[y][x] !== '.' || want === '.' || 'HIJhij'.includes(want) || SWITCH_CHARS.includes(want)) continue;
      rows[y][x] = want;
      const l = tryLevel(current());
      if (!l || parOf(l) !== base || moving(l) !== before) rows[y][x] = '.';
    }
  }
  return current();
}

/**
 * Turn walls the puzzle doesn't need into plain floor: each wall in turn becomes floor, and stays floor
 * if par holds and every color that has to move still does. Colors are checked as a whole, so a color
 * can need its walls to move while some of its walls are clutter; this removes those.
 */
export function plainWalls(d: Draft): Draft {
  const rows = d.rows.map((r) => [...r]);
  const current = () => ({ ...d, rows: rows.map((r) => r.join('')) });
  const base = parOf(tryLevel(current()));
  const moving = (l: Level) => wallColors(l, base).filter((c) => c.moves).map((c) => c.group).sort().join();
  const before = moving(toLevel(current()));
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (!'HIJhij'.includes(c)) continue;
      rows[y][x] = '#';
      const l = tryLevel(current());
      if (!l || parOf(l) !== base || moving(l) !== before) rows[y][x] = c;
    }
  }
  return current();
}

/**
 * Drop plain tiles (floor, ice, planks) the block can never touch in any reachable state: decoys only
 * count if a player can wander onto them. Keeps par; one-layer levels only.
 */
export function dropUnreachable(d: Draft): Draft {
  const level = tryLevel(d);
  if (!level || level.ceiling) return d;
  const ex = explore(level);
  const touched = new Set<string>();
  for (const { state } of ex.nodes.values()) for (const [x, y] of blockCells(state.block)) touched.add(`${x},${y}`);
  const rows = d.rows.map((r) => [...r]);
  rows.forEach((r, y) => r.forEach((c, x) => {
    if ('#~f'.includes(c) && !touched.has(`${x},${y}`)) r[x] = '.';
  }));
  const out = { ...d, rows: rows.map((r) => r.join('')) };
  return parOf(tryLevel(out)) === parOf(level) ? out : d;
}

/** The same board seen from the other side: rows reversed, up and down belts and pads swapped, switches re-ordered. */
export function flipNS(d: Draft): Draft {
  if (d.rows.some((r) => /^-{3,}/.test(r))) return d; // Two-layer levels keep their layout.
  const groupAt = new Map<string, number>();
  let k = 0;
  d.rows.forEach((r, y) => [...r].forEach((c, x) => SWITCH_CHARS.includes(c) && groupAt.set(`${x},${y}`, d.switches[k++] ?? 0)));
  const h = d.rows.length;
  const rows = [...d.rows].reverse().map((r) => r.replace(/[v^UD]/g, (c) => ({ v: '^', '^': 'v', U: 'D', D: 'U' })[c]!));
  const switches: number[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => SWITCH_CHARS.includes(c) && switches.push(groupAt.get(`${x},${h - 1 - y}`)!)));
  return { ...d, rows, switches };
}

/**
 * What a wall hides from the opening camera, which looks north: a wall that can stand raised hides the
 * one or two tiles directly north of it. Lists the switches, belts, pads, rings, shape switches and the
 * goal it hides.
 */
export function hidden(level: Level): string[] {
  const pressed = switchGroups(level);
  const tall = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
    const i = y * level.width + x;
    return isWall(level.tiles[i]) && pressed.has(level.groups[i]);
  };
  const name: Partial<Record<Tile, string>> = {
    [Tile.SoftSwitch]: 'switch', [Tile.HeavySwitch]: 'heavy switch', [Tile.ExtraHeavy]: 'star switch', [Tile.Conveyor]: 'belt',
    [Tile.Pad]: 'pad', [Tile.Flip]: 'ring', [Tile.ShapeSwitch]: 'shape switch', [Tile.Goal]: 'goal',
  };
  const out: string[] = [];
  level.tiles.forEach((t, i) => {
    const what = name[t];
    if (!what) return;
    const [x, y] = [i % level.width, Math.floor(i / level.width)];
    const color = isSwitch(t) ? `${COLOR[level.groups[i]] ?? ''} ` : '';
    for (const dy of [1, 2]) {
      if (!tall(x, y + dy)) continue;
      const j = (y + dy) * level.width + x;
      out.push(`${color}${what} at ${x},${y} is behind the ${COLOR[level.groups[j]] ?? ''} wall at ${x},${y + dy}`);
      break;
    }
  });
  return out;
}

/** Warnings about a draft: the mistakes that cost the most rounds of solving and diagnosing. */
export function lint(d: Draft): string[] {
  const out: string[] = [];
  const level = tryLevel(d);
  if (!level) {
    try {
      toLevel(d);
    } catch (e) {
      return [`does not parse: ${(e as Error).message}`];
    }
  }
  const l = level!;
  // Switches, in the reading order that `switches:` follows.
  const list: string[] = [];
  let count = 0;
  d.rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (!SWITCH_CHARS.includes(c)) return;
    const g = d.switches[count++] ?? 0;
    list.push(`${c}@${x},${y}→${COLOR[g] ?? g}`);
  }));
  if (list.length) out.push(`switches in reading order: ${list.join(' ')}`);
  if (d.switches.length && d.switches.length !== count) {
    out.push(`WARN: ${count} switches but the switches line lists ${d.switches.length} groups${count > d.switches.length ? ': the rest default to orange' : ''}`);
  }
  // Colors with nothing to press them, and switches with nothing to move.
  const pressed = switchGroups(l);
  const moved = new Set(l.tiles.flatMap((t, i) => (isWall(t) || t === Tile.Bridge || t === Tile.BridgeReversed ? [l.groups[i]] : [])));
  for (const g of moved) if (!pressed.has(g) && l.tiles.some((t, i) => (t === Tile.Bridge || t === Tile.BridgeReversed) && l.groups[i] === g)) out.push(`WARN: ${COLOR[g] ?? g} bridges have no switch: they never move`);
  for (const g of moved) if (!pressed.has(g) && l.tiles.some((t, i) => isWall(t) && l.groups[i] === g)) out.push(`note: ${COLOR[g] ?? g} walls have no switch: they're low stone that never moves`);
  for (const g of pressed) if (!moved.has(g)) out.push(`WARN: the ${COLOR[g] ?? g} switch moves nothing`);
  // A belt pushing at a wall, with solid ground behind it: the block can lie across the two and roll
  // straight onto the wall's tile, skipping the ride.
  l.tiles.forEach((t, i) => {
    if (t !== Tile.Conveyor) return;
    const [x, y] = [i % l.width, Math.floor(i / l.width)];
    const { dx, dy } = DIR_DELTA[DIRS[l.groups[i]]];
    const at = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= l.width || cy >= l.height ? Tile.Empty : l.tiles[cy * l.width + cx]);
    if (at(x + dx, y + dy) === Tile.Empty) out.push(`note: the belt at ${x},${y} pushes off into nothing (${x + dx},${y + dy}): fine as a trap, wrong if it should carry you somewhere`);
    const behind = at(x - dx, y - dy);
    const sameBelt = behind === Tile.Conveyor && l.groups[(y - dy) * l.width + (x - dx)] === l.groups[i];
    if (isWall(at(x + dx, y + dy)) && behind !== Tile.Empty && !sameBelt) {
      out.push(`WARN: the belt at ${x},${y} pushes at a wall with floor behind it (${x - dx},${y - dy}): lying across the two skips the ride`);
    }
  });
  // The goal has to take a standing block: one only ever reached lying is a parity problem.
  const goal = findGoal(l);
  if (!goal) out.push('WARN: no goal (G)');
  if (!d.rows.some((r) => r.includes('S'))) out.push('WARN: no start (S)');
  if (goal && !solve(l)) {
    const ex = explore(l, 100_000);
    // Unsolvable, so any state covering the goal has the block lying across it.
    const lying = [...ex.nodes.values()].some(
      ({ state }) => (state.layer ?? 0) === goal.layer && blockCells(state.block).some(([x, y]) => x === goal.x && y === goal.y),
    );
    const near = closest(l, ex);
    if (lying) out.push(`WARN: the goal at ${goal.x},${goal.y} is only ever reached lying: move it a tile along the way the block arrives`);
    else if (near?.block.o === 'S' && near.dist === 1) out.push(`WARN: unsolvable, but the block stands right next to the goal at ${near.block.x},${near.block.y}: try the goal there`);
    else out.push(`WARN: unsolvable (closest: ${near ? `${near.dist} tiles from the goal` : 'nowhere'}): run analyze for the diagnosis`);
  }
  return out;
}

/** A design-file template's `?` cells as floor and `%` cells as ice: the most open version of it. */
export function openTemplate(rows: string[]): string[] {
  return rows.map((r) => r.replace(/\?/g, '#').replace(/%/g, '~'));
}

export interface Report {
  par: number;
  states: number;
  deadEnds: number;
  reachable: number;
  uses: string[];
  pushes: number;
  /** Par with ice, belts, pads and rings as plain floor: how much the mechanics add. */
  floorPar: number | null;
  moves: string;
  walls: WallColor[];
  hidden: string[];
}

const LETTER = { up: 'U', down: 'D', left: 'L', right: 'R' } as const;

/** Everything the tools say about a solvable draft, in one place. */
export function report(d: Draft): Report | null {
  const level = tryLevel(d);
  const sol = level && solve(level);
  if (!level || !sol) return null;
  const ex = explore(level);
  const ice = iceUses(level, sol.moves);
  const floorRows = d.rows.map((r) => (/^-{3,}/.test(r) ? r : r.replace(/[~^v<>UDLR+]/g, '#')));
  return {
    par: sol.moves.length,
    states: sol.explored,
    deadEnds: ex.nodes.size - ex.canWin.size,
    reachable: ex.nodes.size,
    uses: [...ice.uses, ...padUses(level, sol.moves), ...flipUses(level, sol.moves), ...shapeUses(level, sol.moves)],
    pushes: ice.pushes,
    floorPar: parOf(tryLevel({ ...d, rows: floorRows })),
    moves: sol.moves.map((m) => LETTER[m]).join(''),
    walls: wallColors(level, sol.moves.length),
    hidden: hidden(level),
  };
}

/** A design block for analyze, sim and search. */
export function block(name: string, d: Draft): string {
  const opts = [
    d.switches.length ? `!switches ${d.switches.join(' ')}` : '',
    d.on.length ? `!on ${d.on.join(' ')}` : '',
    d.shape !== 2 ? `!shape ${d.shape === 1 ? 'cube' : 'tall'}` : '',
  ];
  return [`@${name}`, ...opts.filter(Boolean), ...d.rows].join('\n');
}

/** Print rows back from a parsed level, so every row has the full width. */
export const normalize = (d: Draft): Draft => ({ ...d, rows: formatLevel(toLevel(d)).split('\n') });

