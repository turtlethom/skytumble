import { Block, DIR_DELTA, DIRS, Dir, Level, State, Tile } from './types';

export type Outcome = 'ok' | 'fall' | 'win';

/** A move after the roll that keeps the block's orientation: an ice slide or a conveyor push. */
export interface Motion {
  kind: 'slide' | 'push';
  dir: Dir;
  from: Block;
  to: Block;
}

export interface StepResult {
  state: State;
  outcome: Outcome;
  /** Where the roll itself landed, before any slides or pushes. */
  rolled: Block;
  /** Slides and pushes after the roll, in order; the last one ends at state.block. */
  motions: Motion[];
  /** Bitmask of bridge groups flipped by this move. */
  toggled: number;
  /** Switch cells the block landed on with enough weight to trigger. */
  pressed: { x: number; y: number }[];
  /** Fragile cell that broke under a standing block. */
  broke?: { x: number; y: number };
}

export function initialState(level: Level): State {
  return { block: { x: level.start.x, y: level.start.y, o: 'S' }, bridges: level.bridgesOn };
}

/** Cells covered by the block: one when standing, two when lying. */
export function blockCells(b: Block): [number, number][] {
  if (b.o === 'S') return [[b.x, b.y]];
  if (b.o === 'X') return [[b.x, b.y], [b.x + 1, b.y]];
  return [[b.x, b.y], [b.x, b.y + 1]];
}

/** Tip the block over one edge in the given direction. */
export function roll(b: Block, dir: Dir): Block {
  const { dx, dy } = DIR_DELTA[dir];
  switch (b.o) {
    case 'S':
      if (dx === 1) return { x: b.x + 1, y: b.y, o: 'X' };
      if (dx === -1) return { x: b.x - 2, y: b.y, o: 'X' };
      if (dy === 1) return { x: b.x, y: b.y + 1, o: 'Y' };
      return { x: b.x, y: b.y - 2, o: 'Y' };
    case 'X':
      if (dx === 1) return { x: b.x + 2, y: b.y, o: 'S' };
      if (dx === -1) return { x: b.x - 1, y: b.y, o: 'S' };
      return { x: b.x, y: b.y + dy, o: 'X' };
    case 'Y':
      if (dy === 1) return { x: b.x, y: b.y + 2, o: 'S' };
      if (dy === -1) return { x: b.x, y: b.y - 1, o: 'S' };
      return { x: b.x + dx, y: b.y, o: 'Y' };
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

function supported(level: Level, b: Block, bridges: number): boolean {
  return blockCells(b).every(([x, y]) => isSolid(level, x, y, bridges));
}

/** Whole-block rule: special tiles act only when every cell of the block is on them. */
function fullyOn(level: Level, b: Block, tile: Tile): boolean {
  return blockCells(b).every(([x, y]) => tileAt(level, x, y) === tile);
}

function shift(b: Block, dir: Dir): Block {
  const { dx, dy } = DIR_DELTA[dir];
  return { x: b.x + dx, y: b.y + dy, o: b.o };
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

/**
 * One player move: roll → slide while fully on ice → one conveyor push (then slide again if
 * that lands a lying block fully on ice). Support is checked after every motion; switches and
 * fragile tiles act only where the block comes to rest.
 */
export function step(level: Level, state: State, dir: Dir): StepResult {
  const rolled = roll(state.block, dir);
  let block = rolled;
  const motions: Motion[] = [];
  const moveTo = (kind: Motion['kind'], d: Dir, to: Block) => {
    if (to.x === block.x && to.y === block.y) return;
    motions.push({ kind, dir: d, from: block, to });
    block = to;
  };
  const fell = (bridges: number, extra: Partial<StepResult> = {}): StepResult => ({
    state: { block, bridges },
    outcome: 'fall',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed: [],
    ...extra,
  });

  const still = () => supported(level, block, state.bridges);
  if (still()) moveTo('slide', dir, slide(level, block, dir, state.bridges));
  const push = still() ? conveyorPush(level, block) : null;
  if (push) {
    moveTo('push', push, shift(block, push));
    if (still()) moveTo('slide', push, slide(level, block, push, state.bridges));
  }

  if (!still()) return fell(state.bridges);
  if (block.o === 'S' && tileAt(level, block.x, block.y) === Tile.Fragile) {
    return fell(state.bridges, { broke: { x: block.x, y: block.y } });
  }

  let bridges = state.bridges;
  const pressed: { x: number; y: number }[] = [];
  for (const [x, y] of blockCells(block)) {
    const t = tileAt(level, x, y);
    if (t === Tile.SoftSwitch || (t === Tile.HeavySwitch && block.o === 'S')) {
      bridges ^= 1 << groupAt(level, x, y);
      pressed.push({ x, y });
    }
  }

  // A switch can retract the bridge the block is resting on.
  if (!supported(level, block, bridges)) return { ...fell(bridges), pressed };

  const won = block.o === 'S' && tileAt(level, block.x, block.y) === Tile.Goal;
  return {
    state: { block, bridges },
    outcome: won ? 'win' : 'ok',
    rolled,
    motions,
    toggled: state.bridges ^ bridges,
    pressed,
  };
}

export function findGoal(level: Level): { x: number; y: number } | null {
  const i = level.tiles.indexOf(Tile.Goal);
  return i < 0 ? null : { x: i % level.width, y: Math.floor(i / level.width) };
}
