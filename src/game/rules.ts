import { Block, DIR_DELTA, Dir, Level, State, Tile } from './types';

export type Outcome = 'ok' | 'fall' | 'win';

export interface StepResult {
  state: State;
  outcome: Outcome;
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

export function step(level: Level, state: State, dir: Dir): StepResult {
  const block = roll(state.block, dir);
  const fell = (bridges: number, extra: Partial<StepResult> = {}): StepResult => ({
    state: { block, bridges },
    outcome: 'fall',
    toggled: state.bridges ^ bridges,
    pressed: [],
    ...extra,
  });

  if (!supported(level, block, state.bridges)) return fell(state.bridges);
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
    toggled: state.bridges ^ bridges,
    pressed,
  };
}

export function findGoal(level: Level): { x: number; y: number } | null {
  const i = level.tiles.indexOf(Tile.Goal);
  return i < 0 ? null : { x: i % level.width, y: Math.floor(i / level.width) };
}
