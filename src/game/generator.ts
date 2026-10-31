import { blockCells, findGoal, initialState, step, tileAt } from './rules';
import { Rng } from './rng';
import { Solution, solve } from './solver';
import { DIRS, Level, State, Tier, Tile } from './types';

/** Bump whenever generation changes; seeds from older versions may produce different levels. */
export const GENERATOR_VERSION = 1;

interface TierConfig {
  width: number;
  height: number;
  minMoves: number;
  maxMoves: number;
  fragile: boolean;
  /** Fewer tiles than this feels cramped. */
  minTiles: number;
  /** Number of bridge groups (each with one switch). */
  bridges: number;
  attempts: number;
  iterations: number;
}

const CONFIG: Record<Tier, TierConfig> = {
  easy: { width: 12, height: 8, minMoves: 10, maxMoves: 20, minTiles: 26, fragile: true, bridges: 0, attempts: 5, iterations: 600 },
  medium: { width: 18, height: 9, minMoves: 16, maxMoves: 36, minTiles: 42, fragile: true, bridges: 2, attempts: 6, iterations: 1000 },
};

export interface Generated {
  level: Level;
  solution: Solution;
  score: number;
}

export function generate(tier: Tier, seed: string): Generated {
  const cfg = CONFIG[tier];
  const rng = new Rng(`${GENERATOR_VERSION}:${tier}:${seed}`);
  let best: Generated | null = null;

  for (let a = 0; a < cfg.attempts; a++) {
    let cur = randomBase(rng, cfg);
    let curEval = evaluate(cur, cfg);
    for (let i = 0; i < cfg.iterations; i++) {
      const next = mutate(cur, rng, cfg);
      if (!next) continue;
      const nextEval = evaluate(next, cfg);
      if (nextEval.score >= curEval.score) {
        cur = next;
        curEval = nextEval;
      }
    }
    if (curEval.solution && (!best || curEval.score > best.score)) {
      best = { level: cur, solution: curEval.solution, score: curEval.score };
    }
  }

  if (!best) throw new Error(`Generator found no solvable level for ${tier}:${seed}`);
  const level = crop(pruneUnreachable(best.level));
  // Cropping shifts coordinates, so re-solve for the final par and path.
  return { level, solution: solve(level)!, score: best.score };
}

// ---------------------------------------------------------------------------
// Base layout: islands left to right, joined by retracted bridges.

function emptyLevel(width: number, height: number): Level {
  const n = width * height;
  return {
    width,
    height,
    tiles: new Array(n).fill(Tile.Empty),
    groups: new Array(n).fill(-1),
    start: { x: 0, y: 0 },
    bridgesOn: 0,
  };
}

function set(level: Level, x: number, y: number, t: Tile, group = -1): void {
  const i = y * level.width + x;
  level.tiles[i] = t;
  level.groups[i] = group;
}

/** Fill a few overlapping rectangles inside [x0, x1] so the island is one connected blob. */
function island(level: Level, rng: Rng, x0: number, x1: number): void {
  const cells: [number, number][] = [];
  const rects = rng.int(2, 4);
  for (let r = 0; r < rects; r++) {
    const w = rng.int(1, Math.min(4, x1 - x0 + 1));
    const h = rng.int(1, 4);
    let ax: number;
    let ay: number;
    if (cells.length === 0) {
      ax = rng.int(x0, x1 - w + 1);
      ay = rng.int(0, level.height - h);
    } else {
      // Anchor on an existing cell so rectangles always connect.
      const [cx, cy] = rng.pick(cells);
      ax = Math.min(Math.max(cx - rng.int(0, w - 1), x0), x1 - w + 1);
      ay = Math.min(Math.max(cy - rng.int(0, h - 1), 0), level.height - h);
    }
    for (let y = ay; y < ay + h; y++) {
      for (let x = ax; x < ax + w; x++) {
        set(level, x, y, Tile.Floor);
        cells.push([x, y]);
      }
    }
  }
}

function floorCells(level: Level, x0 = 0, x1 = level.width - 1): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tileAt(level, x, y) === Tile.Floor && !(x === level.start.x && y === level.start.y)) out.push([x, y]);
    }
  }
  return out;
}

function randomBase(rng: Rng, cfg: TierConfig): Level {
  const level = emptyLevel(cfg.width, cfg.height);
  const count = cfg.bridges + 1;
  const gap = cfg.bridges > 0 ? 2 : 0;
  const span = Math.floor((cfg.width - gap * cfg.bridges) / count);
  const ranges: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const x0 = i * (span + gap);
    const x1 = i === count - 1 ? cfg.width - 1 : x0 + span - 1;
    ranges.push([x0, x1]);
    island(level, rng, x0, x1);
  }

  // Join neighbouring islands with a bridge across the gap, retracted at start.
  for (let g = 0; g < cfg.bridges; g++) {
    const y = rng.int(0, level.height - 1);
    const left = ranges[g][1];
    const right = ranges[g + 1][0];
    // Extend each island along the row to reach the gap.
    for (let x = left; x >= ranges[g][0] && tileAt(level, x, y) === Tile.Empty; x--) set(level, x, y, Tile.Floor);
    for (let x = right; x <= ranges[g + 1][1] && tileAt(level, x, y) === Tile.Empty; x++) set(level, x, y, Tile.Floor);
    for (let x = left + 1; x < right; x++) set(level, x, y, Tile.Bridge, g);
  }

  const [sx, sy] = rng.pick(floorCells(level, ...ranges[0]));
  level.start = { x: sx, y: sy };
  const [gx, gy] = rng.pick(floorCells(level, ...ranges[count - 1]));
  set(level, gx, gy, Tile.Goal);

  // Each bridge's switch sits somewhere already reachable before that bridge.
  for (let g = 0; g < cfg.bridges; g++) {
    const [wx, wy] = rng.pick(floorCells(level, ranges[0][0], ranges[g][1]));
    set(level, wx, wy, rng.chance(0.5) ? Tile.SoftSwitch : Tile.HeavySwitch, g);
  }

  // Mirror half the time so starts aren't always on the left.
  return rng.chance(0.5) ? mirror(level) : level;
}

function mirror(level: Level): Level {
  const out = emptyLevel(level.width, level.height);
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const i = y * level.width + x;
      set(out, level.width - 1 - x, y, level.tiles[i], level.groups[i]);
    }
  }
  out.start = { x: level.width - 1 - level.start.x, y: level.start.y };
  out.bridgesOn = level.bridgesOn;
  return out;
}

// ---------------------------------------------------------------------------
// Hill climbing.

function clone(level: Level): Level {
  return { ...level, tiles: level.tiles.slice(), groups: level.groups.slice(), start: { ...level.start } };
}

function hasNeighbour(level: Level, x: number, y: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(level, x + dx, y + dy) !== Tile.Empty);
}

function mutate(src: Level, rng: Rng, cfg: TierConfig): Level | null {
  const level = clone(src);
  const x = rng.int(0, level.width - 1);
  const y = rng.int(0, level.height - 1);
  const t = tileAt(level, x, y);
  const isStart = x === level.start.x && y === level.start.y;
  const roll = rng.next();

  if (roll < 0.3) {
    // Grow the island edge.
    if (t !== Tile.Empty || !hasNeighbour(level, x, y)) return null;
    set(level, x, y, Tile.Floor);
  } else if (roll < 0.6) {
    // Carve a hole.
    if ((t !== Tile.Floor && t !== Tile.Fragile) || isStart) return null;
    set(level, x, y, Tile.Empty);
  } else if (roll < 0.78) {
    if (!cfg.fragile || isStart) return null;
    if (t === Tile.Floor) set(level, x, y, Tile.Fragile);
    else if (t === Tile.Fragile) set(level, x, y, Tile.Floor);
    else return null;
  } else if (roll < 0.86) {
    // Move the goal.
    if (t !== Tile.Floor || isStart) return null;
    const goal = findGoal(level)!;
    set(level, goal.x, goal.y, Tile.Floor);
    set(level, x, y, Tile.Goal);
  } else if (roll < 0.93) {
    if (t !== Tile.Floor) return null;
    level.start = { x, y };
  } else {
    // Move a switch, sometimes changing its kind.
    if (cfg.bridges === 0 || t !== Tile.Floor || isStart) return null;
    const switches = level.tiles
      .map((tile, i) => (tile === Tile.SoftSwitch || tile === Tile.HeavySwitch ? i : -1))
      .filter((i) => i >= 0);
    if (switches.length === 0) return null;
    const i = rng.pick(switches);
    const kind = rng.chance(0.3) ? (level.tiles[i] === Tile.SoftSwitch ? Tile.HeavySwitch : Tile.SoftSwitch) : level.tiles[i];
    const group = level.groups[i];
    set(level, i % level.width, Math.floor(i / level.width), Tile.Floor);
    set(level, x, y, kind, group);
  }
  return level;
}

interface Evaluation {
  score: number;
  solution: Solution | null;
}

function legalMoves(level: Level, s: State): number {
  return DIRS.filter((d) => step(level, s, d).outcome !== 'fall').length;
}

function evaluate(level: Level, cfg: TierConfig): Evaluation {
  if (tileAt(level, level.start.x, level.start.y) !== Tile.Floor) return { score: -Infinity, solution: null };
  const solution = solve(level);
  if (!solution) return { score: -Infinity, solution: null };

  const goal = findGoal(level)!;
  const L = solution.moves.length;
  let detours = 0;
  let presses = 0;
  let groupsUsed = 0;
  let narrow = 0;
  let fragileUse = 0;
  for (let i = 1; i < solution.path.length; i++) {
    const prev = solution.path[i - 1];
    const cur = solution.path[i];
    if (distance(cur, goal) > distance(prev, goal)) detours++;
    if (cur.bridges !== prev.bridges) {
      presses++;
      groupsUsed |= cur.bridges ^ prev.bridges;
    }
    if (legalMoves(level, cur) <= 2) narrow++;
    if (blockCells(cur.block).some(([x, y]) => tileAt(level, x, y) === Tile.Fragile)) fragileUse++;
  }
  if (cfg.bridges > 0 && presses === 0) return { score: -Infinity, solution: null };

  const tiles = level.tiles.filter((t) => t !== Tile.Empty).length;
  const fragile = level.tiles.filter((t) => t === Tile.Fragile).length;
  let score = Math.min(L, cfg.maxMoves) - Math.max(0, L - cfg.maxMoves) * 1.5;
  if (L < cfg.minMoves) score -= (cfg.minMoves - L) * 3;
  score += detours * 0.6 + narrow * 0.25 + Math.min(fragileUse, 6) * 0.5;
  score += popcount(groupsUsed) * 3 + Math.min(presses, 4);
  score += Math.min(solution.explored, 400) * 0.005;
  // Keep levels roomy, and fragile tiles an accent rather than the whole floor.
  score -= Math.max(0, cfg.minTiles - tiles) + tiles * 0.01;
  score -= Math.max(0, fragile - tiles * 0.2) * 2;
  // Lone tiles poking out of an island look like noise.
  score -= spikes(level) * 0.3;
  // Starting next to the goal never feels like a puzzle.
  if (Math.abs(level.start.x - goal.x) + Math.abs(level.start.y - goal.y) < 3) score -= 5;
  return { score, solution };
}

function spikes(level: Level): number {
  let n = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (tileAt(level, x, y) === Tile.Empty) continue;
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
        ([dx, dy]) => tileAt(level, x + dx, y + dy) !== Tile.Empty,
      ).length;
      if (neighbours <= 1) n++;
    }
  }
  return n;
}

function popcount(n: number): number {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
}

function distance(s: State, goal: { x: number; y: number }): number {
  const cells = blockCells(s.block);
  const cx = cells.reduce((a, [x]) => a + x, 0) / cells.length;
  const cy = cells.reduce((a, [, y]) => a + y, 0) / cells.length;
  return Math.abs(cx - goal.x) + Math.abs(cy - goal.y);
}

// ---------------------------------------------------------------------------
// Cleanup.

/** Remove tiles that no reachable state ever touches (stray floor, unused switches/bridges). */
function pruneUnreachable(level: Level): Level {
  const touched = new Set<number>();
  const seen = new Set<string>();
  const start = initialState(level);
  const queue: State[] = [start];
  const id = (s: State) => `${s.block.x},${s.block.y},${s.block.o},${s.bridges}`;
  seen.add(id(start));
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const [x, y] of blockCells(cur.block)) touched.add(y * level.width + x);
    for (const d of DIRS) {
      const r = step(level, cur, d);
      if (r.outcome === 'fall') continue;
      if (r.outcome === 'win') {
        touched.add(r.state.block.y * level.width + r.state.block.x);
        continue;
      }
      if (seen.has(id(r.state))) continue;
      seen.add(id(r.state));
      queue.push(r.state);
    }
  }
  const out = clone(level);
  out.tiles.forEach((t, i) => {
    if (t !== Tile.Goal && !touched.has(i)) {
      out.tiles[i] = Tile.Empty;
      out.groups[i] = -1;
    }
  });
  return out;
}

/** Trim empty rows/columns around the level. */
function crop(level: Level): Level {
  let minX = level.width, minY = level.height, maxX = -1, maxY = -1;
  level.tiles.forEach((t, i) => {
    if (t === Tile.Empty) return;
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const out = emptyLevel(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y + minY) * level.width + (x + minX);
      set(out, x, y, level.tiles[i], level.groups[i]);
    }
  }
  out.start = { x: level.start.x - minX, y: level.start.y - minY };
  out.bridgesOn = level.bridgesOn;
  return out;
}
