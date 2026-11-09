import { Block, DIR_DELTA, DIRS, Dir, Level, State, Tile } from './types';

/** `bump`: something in the way stopped the roll, and nothing changed: it isn't a move. */
export type Outcome = 'ok' | 'fall' | 'win' | 'bump';

/**
 * A move after the roll: an ice slide or a conveyor push (both keep the block's orientation), or
 * a launch-pad flight (ends with one ordinary roll, so the orientation changes like a roll's).
 */
export interface Motion {
  /** A flip keeps the block's cells and pose and moves it to the other layer (`to` = `from`). */
  kind: 'slide' | 'push' | 'fly' | 'flip';
  dir: Dir;
  from: Block;
  to: Block;
  /** The raised wall a flight hit: it stopped short at `to`, or bounced back there and fell. */
  wall?: { x: number; y: number };
}

export interface StepResult {
  state: State;
  outcome: Outcome;
  /** Where the roll itself landed, before any slides or pushes. */
  rolled: Block;
  /** Slides, pushes and flights after the roll, in order; the last one ends at state.block. */
  motions: Motion[];
  /** Bitmask of bridge groups flipped by this move. */
  toggled: number;
  /** Switch cells the block landed on with enough weight to trigger. */
  pressed: { x: number; y: number }[];
  /** Fragile cell that broke under a standing block. */
  broke?: { x: number; y: number };
  /** The block's length before and after a shape switch changed it this move. */
  reshaped?: { from: number; to: number };
  /** What stopped the roll: a raised wall or a hedge. The block stayed where it was. */
  bumped?: { x: number; y: number };
  /** The hedge at `bumped` toppled along the roll. This is a move, unlike any other bump. */
  knocked?: boolean;
  /** The empty tile a toppled hedge landed on, which is floor from now on. */
  bridged?: { x: number; y: number };
  /**
   * Raised walls that stopped a slide on the tile before them, kept a belt from pushing, or stopped a
   * flight short (or crashed a sideways hop), in order.
   * `after` counts the motions that came before it.
   */
  held?: Held[];
}

export interface Held {
  x: number;
  y: number;
  dir: Dir;
  /** A belt that couldn't push, rather than a slide that stopped. */
  belt: boolean;
  after: number;
}

export function initialState(level: Level): State {
  const block = withLength({ x: level.start.x, y: level.start.y, o: 'S' }, level.startShape ?? 2);
  return { block, bridges: level.bridgesOn, layer: 0 };
}

/** The block's length in tiles: 1 cube, 2 normal, 3 tall. */
export function blockLength(b: Block): number {
  return b.n ?? 2;
}

/** The same block with another length; the normal length is stored as no `n` at all. */
export function withLength(b: Block, n: number): Block {
  const { n: _old, ...rest } = b;
  return n === 2 ? rest : { ...rest, n: n as 1 | 3 };
}

/**
 * One layer of a level as a plain single-layer Level: the ground (0) or the ceiling (1). The rules
 * run on a layer view, so every tile rule works the same upside down.
 */
export function layerView(level: Level, layer: number): Level {
  if (layer === 0 || !level.ceiling) return level;
  return { ...level, tiles: level.ceiling.tiles, groups: level.ceiling.groups };
}

/** Cells covered by the block: one when standing, its length when lying. */
export function blockCells(b: Block): [number, number][] {
  if (b.o === 'S') return [[b.x, b.y]];
  const n = blockLength(b);
  const cells: [number, number][] = [];
  for (let i = 0; i < n; i++) cells.push(b.o === 'X' ? [b.x + i, b.y] : [b.x, b.y + i]);
  return cells;
}

/**
 * Tip the block over one edge in the given direction. A block of length n standing tips onto the
 * n tiles beyond its edge; lying along the roll, it stands up just past its far end. A cube just
 * rolls one tile and stays a cube.
 */
export function roll(b: Block, dir: Dir): Block {
  const { dx, dy } = DIR_DELTA[dir];
  const n = blockLength(b);
  const at = (x: number, y: number, o: Block['o']) => withLength({ x, y, o }, n);
  if (n === 1) return at(b.x + dx, b.y + dy, 'S');
  switch (b.o) {
    case 'S':
      if (dx === 1) return at(b.x + 1, b.y, 'X');
      if (dx === -1) return at(b.x - n, b.y, 'X');
      if (dy === 1) return at(b.x, b.y + 1, 'Y');
      return at(b.x, b.y - n, 'Y');
    case 'X':
      if (dx === 1) return at(b.x + n, b.y, 'S');
      if (dx === -1) return at(b.x - 1, b.y, 'S');
      return at(b.x, b.y + dy, 'X');
    case 'Y':
      if (dy === 1) return at(b.x, b.y + n, 'S');
      if (dy === -1) return at(b.x, b.y - 1, 'S');
      return at(b.x + dx, b.y, 'Y');
  }
}

export function tileAt(level: Level, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return Tile.Empty;
  return level.tiles[y * level.width + x];
}

export function groupAt(level: Level, x: number, y: number): number {
  return level.groups[y * level.width + x];
}

export function isBridge(tile: Tile): boolean {
  return tile === Tile.Bridge || tile === Tile.BridgeReversed;
}

export function isWall(tile: Tile): boolean {
  return tile === Tile.WallUp || tile === Tile.WallDown;
}

/** Whether this bridge piece is out when the groups are set like `bridges`. */
export function bridgeOut(tile: Tile, group: number, bridges: number): boolean {
  return (((bridges >> group) & 1) === 1) !== (tile === Tile.BridgeReversed);
}

/**
 * Whether this wall piece is up when the groups are set like `bridges`: as it started, unless its
 * group has been flipped since. A block on the tile doesn't change this: the roll into a tile is
 * what checks it, so a wall that comes up under the block only stops it coming back.
 */
export function wallUp(tile: Tile, group: number, bridges: number, startBridges: number): boolean {
  const flipped = ((bridges ^ startBridges) >> group) & 1;
  return (tile === Tile.WallUp) !== (flipped === 1);
}

/** Which way this hedge fell, or null if it's still up. */
export function hedgeFell(group: number, hedges: number): Dir | null {
  const fell = (hedges >> (group * HEDGE_BITS)) & 7;
  return fell ? DIRS[fell - 1] : null;
}

const HEDGE_BITS = 3;

const inGrid = (level: Level, x: number, y: number) => x >= 0 && y >= 0 && x < level.width && y < level.height;

/** Whether a hedge has fallen onto this empty tile, making it floor. */
export function isBridged(level: Level, x: number, y: number, hedges: number): boolean {
  if (!hedges || !inGrid(level, x, y) || tileAt(level, x, y) !== Tile.Empty) return false;
  return (level.hedgeCells ?? []).some((c, i) => {
    const fell = hedgeFell(i, hedges);
    return !!fell && c.x + DIR_DELTA[fell].dx === x && c.y + DIR_DELTA[fell].dy === y;
  });
}

export function isSolid(level: Level, x: number, y: number, bridges: number, hedges = 0): boolean {
  const t = tileAt(level, x, y);
  if (t === Tile.Empty) return isBridged(level, x, y, hedges);
  if (isBridge(t)) return bridgeOut(t, groupAt(level, x, y), bridges);
  return true;
}

/** Something standing there stops a hedge falling onto it: a raised wall or another hedge still up. */
function standsUp(level: Level, x: number, y: number, state: State): boolean {
  const t = tileAt(level, x, y);
  if (isWall(t)) return wallUp(t, groupAt(level, x, y), state.bridges, level.bridgesOn);
  return t === Tile.Hedge && !hedgeFell(groupAt(level, x, y), state.hedges ?? 0);
}

/**
 * The first thing in the way of a roll that would land on `to`, nearest the block first: a raised
 * wall or an upright hedge. Slides and belt pushes check `inTheWay` instead; flights fly over.
 */
function obstacle(level: Level, state: State, to: Block, dir: Dir): { x: number; y: number; hedge: boolean } | null {
  const cells = blockCells(to);
  if (dir === 'left' || dir === 'up') cells.reverse();
  for (const [x, y] of cells) {
    if (standsUp(level, x, y, state)) return { x, y, hedge: tileAt(level, x, y) === Tile.Hedge };
  }
  return null;
}

/**
 * Every cell must be on something, except that a lying tall block rests on its two ends like a
 * plank, so its middle can hang over a gap.
 */
function supported(level: Level, b: Block, bridges: number, hedges = 0): boolean {
  const cells = blockCells(b);
  const needed = blockLength(b) === 3 && b.o !== 'S' ? [cells[0], cells[2]] : cells;
  return needed.every(([x, y]) => isSolid(level, x, y, bridges, hedges));
}

/** Whole-block rule: special tiles act only when every cell of the block is on them. */
function fullyOn(level: Level, b: Block, tile: Tile): boolean {
  return blockCells(b).every(([x, y]) => tileAt(level, x, y) === tile);
}

function shift(b: Block, dir: Dir): Block {
  const { dx, dy } = DIR_DELTA[dir];
  return { ...b, x: b.x + dx, y: b.y + dy };
}

/**
 * What stands on a cell `to` would move onto that `from` isn't already on: a raised wall or an upright
 * hedge stops a slide or a push on the tile before it. A wall that came up under the block doesn't
 * hold it, since the block is already there.
 */
function inTheWay(level: Level, state: State, from: Block, to: Block): { x: number; y: number } | null {
  const on = new Set(blockCells(from).map(([x, y]) => y * level.width + x));
  const hit = blockCells(to).find(([x, y]) => !on.has(y * level.width + x) && standsUp(level, x, y, state));
  return hit ? { x: hit[0], y: hit[1] } : null;
}

/**
 * Slide a lying block along `dir` while it is fully on ice; stops on leaving ice or losing support,
 * or on the tile before a raised wall (`hit`).
 */
function slide(level: Level, state: State, b: Block, dir: Dir): { block: Block; hit: { x: number; y: number } | null } {
  let cur = b;
  while (cur.o !== 'S' && fullyOn(level, cur, Tile.Ice)) {
    const next = shift(cur, dir);
    const hit = inTheWay(level, state, cur, next);
    if (hit) return { block: cur, hit };
    cur = next;
    if (!supported(level, cur, state.bridges)) break;
  }
  return { block: cur, hit: null };
}

/** The direction conveyors push the block, if it is fully on conveyors that all agree. */
function conveyorPush(level: Level, b: Block): Dir | null {
  if (!fullyOn(level, b, Tile.Conveyor)) return null;
  const dirs = new Set(blockCells(b).map(([x, y]) => groupAt(level, x, y)));
  return dirs.size === 1 ? DIRS[[...dirs][0]] : null;
}

/** How far past its leading edge a flight lands: a standing fling, a lying hop. */
export const FLING = 4;
export const HOP = 2;

/** The arrow of the pads that fire under this block: standing on one, or lying fully on two that agree. */
function padLaunch(level: Level, b: Block): Dir | null {
  if (!fullyOn(level, b, Tile.Pad)) return null;
  const dirs = new Set(blockCells(b).map(([x, y]) => groupAt(level, x, y)));
  return dirs.size === 1 ? DIRS[[...dirs][0]] : null;
}

/** Whether flip tiles fire under this block: standing on one, or lying fully on two. */
function flipFires(level: Level, b: Block): boolean {
  return fullyOn(level, b, Tile.Flip);
}

/**
 * Where a launch from `b` along `dir` lands: fly N−1 tiles, then tip once with an ordinary
 * roll, so the nearest landing cell is N tiles past the block's leading edge.
 */
export function flight(b: Block, dir: Dir): Block {
  const n = (b.o === 'S' ? FLING : HOP) - 1;
  const { dx, dy } = DIR_DELTA[dir];
  return roll({ ...b, x: b.x + dx * n, y: b.y + dy * n }, dir);
}

/**
 * A flight with walls (frozen for Windy Peaks after its lab): it flies over them, and only the landing
 * matters. A raised wall where a fling or a hop along the pads would land stops it short, standing on
 * the tile before the wall (`hit`); with nothing there, it falls like any landing. A raised wall where
 * a sideways hop would land, or a second raised wall just before it, makes the block fall (`crashed`):
 * it bounces back off the wall and falls there.
 */
export function landing(level: Level, state: State, b: Block, dir: Dir): { to: Block; hit: { x: number; y: number } | null; crashed: boolean } {
  const to = flight(b, dir);
  const { dx, dy } = DIR_DELTA[dir];
  // Nearest first, along the flight.
  const cells = blockCells(to).sort(([ax, ay], [bx, by]) => (ax - bx) * dx + (ay - by) * dy);
  const wall = cells.find(([x, y]) => standsUp(level, x, y, state));
  if (!wall) return { to, hit: null, crashed: false };
  const hit = { x: wall[0], y: wall[1] };
  const along = b.o === 'S' || (b.o === 'X') === (dy === 0);
  // Standing short needs the tile before the wall clear: a block can't stand inside another wall.
  if (!along || standsUp(level, wall[0] - dx, wall[1] - dy, state)) {
    // It hits the wall and bounces back, in its landing pose, until it's clear of walls, and falls there.
    let back = to;
    for (let i = 0; i < FLING && blockCells(back).some(([x, y]) => standsUp(level, x, y, state)); i++) back = { ...back, x: back.x - dx, y: back.y - dy };
    return { to: back, hit, crashed: true };
  }
  return { to: { ...to, x: wall[0] - dx, y: wall[1] - dy, o: 'S' }, hit, crashed: false };
}

/**
 * Every grid cell some flight in this level can land on, for the landing marks. With a state, walls
 * count: a flight a raised wall stops short marks where it stops, and one that would crash marks nothing.
 */
export function flightLandings(level: Level, state?: State): { x: number; y: number }[] {
  const cells = new Map<number, { x: number; y: number }>();
  const launches: Block[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (tileAt(level, x, y) !== Tile.Pad) continue;
      launches.push({ x, y, o: 'S' }, { x, y, o: 'X' }, { x, y, o: 'Y' });
    }
  }
  for (const b of launches) {
    const dir = padLaunch(level, b);
    if (!dir) continue;
    const to = state ? landing(level, state, b, dir) : { to: flight(b, dir), crashed: false };
    if (to.crashed) continue;
    for (const [x, y] of blockCells(to.to)) cells.set(y * level.width + x, { x, y });
  }
  return [...cells.values()];
}

/**
 * One player move: roll → slide while fully on ice → then, wherever the block rests, belts and
 * pads act until neither does: one conveyor push per move (then slide again if that lands a
 * lying block fully on ice), and launch-pad flights (chaining, each pad at most once per move).
 * A flight's landing doesn't slide on ice. Support is checked after every motion; switches and
 * fragile tiles act only where the block comes to rest.
 */
export function step(level: Level, state: State, dir: Dir): StepResult {
  const rolled = roll(state.block, dir);
  let block = rolled;
  let layer = state.layer ?? 0;
  let view = layerView(level, layer);

  // Rolling into something: the block stays put, even over a gap. A standing block has the weight
  // to topple a hedge along the roll, which costs a move, unless something standing beyond the hedge
  // stops it falling. Anything else holds, and no move happened.
  const hit = obstacle(view, state, rolled, dir);
  if (hit) {
    const { x, y } = hit;
    const { dx, dy } = DIR_DELTA[dir];
    const [lx, ly] = [x + dx, y + dy];
    const knocked = hit.hedge && state.block.o === 'S' && blockLength(state.block) >= 2 && !standsUp(view, lx, ly, state);
    const fills = knocked && inGrid(view, lx, ly) && !isSolid(view, lx, ly, state.bridges, state.hedges ?? 0) && tileAt(view, lx, ly) === Tile.Empty;
    const fell = (DIRS.indexOf(dir) + 1) << (groupAt(view, x, y) * HEDGE_BITS);
    return {
      state: knocked ? { ...state, hedges: (state.hedges ?? 0) | fell } : state,
      outcome: knocked ? 'ok' : 'bump',
      rolled: state.block,
      motions: [],
      toggled: 0,
      pressed: [],
      bumped: { x, y },
      ...(knocked ? { knocked } : {}),
      ...(fills ? { bridged: { x: lx, y: ly } } : {}),
    };
  }

  const motions: Motion[] = [];
  const moveTo = (kind: Motion['kind'], d: Dir, to: Block) => {
    if (to.x === block.x && to.y === block.y) return;
    motions.push({ kind, dir: d, from: block, to });
    block = to;
  };
  // Hedges stay absent until one falls, so a level without any compares as it always has.
  const hedges = state.hedges ? { hedges: state.hedges } : {};
  const fell = (bridges: number, extra: Partial<StepResult> = {}): StepResult => ({
    state: { block, bridges, layer, ...hedges },
    outcome: 'fall',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed: [],
    ...(held.length ? { held } : {}),
    ...extra,
  });

  const held: Held[] = [];
  const slideOn = (d: Dir) => {
    const { block: to, hit } = slide(view, state, block, d);
    moveTo('slide', d, to);
    if (hit) held.push({ ...hit, dir: d, belt: false, after: motions.length });
  };
  const still = () => supported(view, block, state.bridges, state.hedges ?? 0);
  if (still()) slideOn(dir);
  // Then belts, pads and flip tiles act wherever the block rests, until none does. At most one
  // belt push per move, and each pad or flip tile fires at most once, so every move ends.
  let pushed = false;
  const fired = new Set<number>();
  const cellKeys = () => blockCells(block).map(([x, y]) => (layer * level.height + y) * level.width + x);
  while (still()) {
    const push = pushed ? null : conveyorPush(view, block);
    if (push) {
      pushed = true;
      // A wall where the belt would push holds the block where it is. The belt tries again only the
      // next time the block lands on it.
      const hit = inTheWay(view, state, block, shift(block, push));
      if (hit) {
        held.push({ ...hit, dir: push, belt: true, after: motions.length });
        continue;
      }
      moveTo('push', push, shift(block, push));
      if (still()) slideOn(push);
      continue;
    }
    const launch = padLaunch(view, block);
    const flips = !launch && flipFires(view, block);
    if (!launch && !flips) break;
    const cells = cellKeys();
    if (cells.some((c) => fired.has(c))) break;
    cells.forEach((c) => fired.add(c));
    if (launch) {
      const { to, hit, crashed } = landing(view, state, block, launch);
      moveTo('fly', launch, to);
      const flown = motions[motions.length - 1];
      if (hit && flown?.to === to) flown.wall = hit;
      if (hit) held.push({ ...hit, dir: launch, belt: false, after: motions.length });
      if (crashed) return fell(state.bridges);
      continue;
    }
    // Gravity flips: the block drops "up" to the tiles directly over it, in the same pose, and
    // those tiles may not fire back this move.
    motions.push({ kind: 'flip', dir, from: block, to: block });
    layer = 1 - layer;
    view = layerView(level, layer);
    cellKeys().forEach((c) => fired.add(c));
  }

  if (!still()) return fell(state.bridges);
  // Weight: a standing block breaks fragile tiles and presses heavy switches, except the light
  // cube; only a standing tall block presses extra-heavy switches.
  const length = blockLength(block);
  const standing = block.o === 'S';
  if (standing && length >= 2 && tileAt(view, block.x, block.y) === Tile.Fragile) {
    return fell(state.bridges, { broke: { x: block.x, y: block.y } });
  }

  let bridges = state.bridges;
  const pressed: { x: number; y: number }[] = [];
  for (const [x, y] of blockCells(block)) {
    const t = tileAt(view, x, y);
    const fires =
      t === Tile.SoftSwitch ||
      (t === Tile.HeavySwitch && standing && length >= 2) ||
      (t === Tile.ExtraHeavy && standing && length === 3);
    if (fires) {
      bridges ^= 1 << groupAt(view, x, y);
      pressed.push({ x, y });
    }
  }

  // A shape switch under a standing block sets its shape, right where it stands.
  let reshaped: StepResult['reshaped'];
  if (standing && tileAt(view, block.x, block.y) === Tile.ShapeSwitch) {
    const to = groupAt(view, block.x, block.y);
    if (to !== length) {
      reshaped = { from: length, to };
      block = withLength(block, to);
    }
  }

  // A switch can retract the bridge the block is resting on.
  if (!supported(view, block, bridges, state.hedges ?? 0)) return { ...fell(bridges), pressed };

  // The goal takes a standing block of its shape: normal unless the goal is marked (group = length).
  const goalShape = (x: number, y: number) => (groupAt(view, x, y) > 0 ? groupAt(view, x, y) : 2);
  const won =
    block.o === 'S' &&
    tileAt(view, block.x, block.y) === Tile.Goal &&
    blockLength(block) === goalShape(block.x, block.y);
  return {
    state: { block, bridges, layer, ...hedges },
    outcome: won ? 'win' : 'ok',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed,
    ...(reshaped ? { reshaped } : {}),
    ...(held.length ? { held } : {}),
  };
}

export function findGoal(level: Level): { x: number; y: number; layer: number } | null {
  for (const layer of level.ceiling ? [0, 1] : [0]) {
    const i = layerView(level, layer).tiles.indexOf(Tile.Goal);
    if (i >= 0) return { x: i % level.width, y: Math.floor(i / level.width), layer };
  }
  return null;
}
