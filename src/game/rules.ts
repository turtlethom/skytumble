import { Block, DIR_DELTA, DIRS, Dir, Level, State, Tile } from './types';

export type Outcome = 'ok' | 'fall' | 'win';

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

export function isSolid(level: Level, x: number, y: number, bridges: number): boolean {
  const t = tileAt(level, x, y);
  if (t === Tile.Empty) return false;
  if (t === Tile.Bridge) return ((bridges >> groupAt(level, x, y)) & 1) === 1;
  return true;
}

/**
 * Every cell must be on something, except that a lying tall block rests on its two ends like a
 * plank, so its middle can hang over a gap.
 */
function supported(level: Level, b: Block, bridges: number): boolean {
  const cells = blockCells(b);
  const needed = blockLength(b) === 3 && b.o !== 'S' ? [cells[0], cells[2]] : cells;
  return needed.every(([x, y]) => isSolid(level, x, y, bridges));
}

/** Whole-block rule: special tiles act only when every cell of the block is on them. */
function fullyOn(level: Level, b: Block, tile: Tile): boolean {
  return blockCells(b).every(([x, y]) => tileAt(level, x, y) === tile);
}

function shift(b: Block, dir: Dir): Block {
  const { dx, dy } = DIR_DELTA[dir];
  return { ...b, x: b.x + dx, y: b.y + dy };
}

/** Slide a lying block along `dir` while it is fully on ice; stops on leaving ice or losing support. */
function slide(level: Level, b: Block, dir: Dir, bridges: number): Block {
  let cur = b;
  while (cur.o !== 'S' && fullyOn(level, cur, Tile.Ice)) {
    cur = shift(cur, dir);
    if (!supported(level, cur, bridges)) break;
  }
  return cur;
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

/** Every grid cell some flight in this level can land on, for the landing marks. */
export function flightLandings(level: Level): { x: number; y: number }[] {
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
    for (const [x, y] of blockCells(flight(b, dir))) cells.set(y * level.width + x, { x, y });
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
  const motions: Motion[] = [];
  const moveTo = (kind: Motion['kind'], d: Dir, to: Block) => {
    if (to.x === block.x && to.y === block.y) return;
    motions.push({ kind, dir: d, from: block, to });
    block = to;
  };
  const fell = (bridges: number, extra: Partial<StepResult> = {}): StepResult => ({
    state: { block, bridges, layer },
    outcome: 'fall',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed: [],
    ...extra,
  });

  const still = () => supported(view, block, state.bridges);
  if (still()) moveTo('slide', dir, slide(view, block, dir, state.bridges));
  // Then belts, pads and flip tiles act wherever the block rests, until none does. At most one
  // belt push per move, and each pad or flip tile fires at most once, so every move ends.
  let pushed = false;
  const fired = new Set<number>();
  const cellKeys = () => blockCells(block).map(([x, y]) => (layer * level.height + y) * level.width + x);
  while (still()) {
    const push = pushed ? null : conveyorPush(view, block);
    if (push) {
      pushed = true;
      moveTo('push', push, shift(block, push));
      if (still()) moveTo('slide', push, slide(view, block, push, state.bridges));
      continue;
    }
    const launch = padLaunch(view, block);
    const flips = !launch && flipFires(view, block);
    if (!launch && !flips) break;
    const cells = cellKeys();
    if (cells.some((c) => fired.has(c))) break;
    cells.forEach((c) => fired.add(c));
    if (launch) {
      moveTo('fly', launch, flight(block, launch));
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
  if (!supported(view, block, bridges)) return { ...fell(bridges), pressed };

  // The goal takes a standing block of its shape: normal unless the goal is marked (group = length).
  const goalShape = (x: number, y: number) => (groupAt(view, x, y) > 0 ? groupAt(view, x, y) : 2);
  const won =
    block.o === 'S' &&
    tileAt(view, block.x, block.y) === Tile.Goal &&
    blockLength(block) === goalShape(block.x, block.y);
  return {
    state: { block, bridges, layer },
    outcome: won ? 'win' : 'ok',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed,
    ...(reshaped ? { reshaped } : {}),
  };
}

export function findGoal(level: Level): { x: number; y: number; layer: number } | null {
  for (const layer of level.ceiling ? [0, 1] : [0]) {
    const i = layerView(level, layer).tiles.indexOf(Tile.Goal);
    if (i >= 0) return { x: i % level.width, y: Math.floor(i / level.width), layer };
  }
  return null;
}
