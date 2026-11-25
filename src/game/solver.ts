import { StepResult, initialState, successors } from './rules';
import { Dir, Level, Move, State, Tile } from './types';

export interface Solution {
  /** The rolls, which are what par counts. */
  moves: Dir[];
  /** Every action in order: the rolls, with a swap before each roll of the other cube after a split. */
  steps: Move[];
  /** States along the solution, starting with the initial state (one per roll). */
  path: State[];
  /** Distinct states discovered before the goal was found: a rough measure of search space. */
  explored: number;
}

const O_INDEX = { S: 0, X: 1, Y: 2 } as const;

/** More than every bridge group can add up to (ten digits, 0-9), so fallen hedges sit above them. */
const HEDGE_STEP = 1024;

function blockKey(level: Level, s: State, b: State['block']): number {
  const shape = (b.n ?? 2) - 1;
  const switched = s.bridges + (s.hedges ?? 0) * HEDGE_STEP;
  return ((((switched * 3 + O_INDEX[b.o]) * 2 + (s.layer ?? 0)) * 3 + shape) * level.height + b.y) * level.width + b.x;
}

/**
 * A number per state. After a split the two cubes are interchangeable (a swap is free), so the key
 * puts the lower cell first. Levels with splitters have no hedges, which keeps the key a safe integer.
 */
/** Whether a level's states carry paint: it has trays or starts painted. */
export const hasPaint = (level: Level) => !!level.startPaint || level.tiles.includes(Tile.Tray) || level.tiles.includes(Tile.Wash);

export function stateKey(level: Level, s: State, splits = level.tiles.includes(Tile.Splitter), paints = hasPaint(level)): number {
  // Paint: eight colors per half (levels with paint have no hedges either).
  const colors = (s.paint?.[0] ?? 0) * 8 + (s.paint?.[1] ?? 0);
  if (!splits) return paints ? blockKey(level, s, s.block) * 64 + colors : blockKey(level, s, s.block);
  const cells = level.width * level.height;
  if (!s.other) return (blockKey(level, s, s.block) * 64 + colors) * (cells * 8 + 1);
  // The two cubes in a fixed order, each with its color.
  const a = s.block.y * level.width + s.block.x;
  const b = s.other.y * level.width + s.other.x;
  const [ca, cb] = [s.paint?.[0] ?? 0, s.otherPaint ?? 0];
  const [lo, loColor, hi, hiColor] = a < b ? [s.block, ca, s.other, cb] : [s.other, cb, s.block, ca];
  return (blockKey(level, s, { x: lo.x, y: lo.y, o: 'S', n: 1 }) * 64 + loColor) * (cells * 8 + 1) + (hi.y * level.width + hi.x) * 8 + hiColor + 1;
}

/**
 * Breadth-first search for the shortest solution, or null if the level is unsolvable. `allow`, for the
 * design tools, skips moves it rejects (the par a level would have without some trick).
 */
export function solve(level: Level, from: State = initialState(level), allow?: (from: State, steps: Move[], r: StepResult) => boolean): Solution | null {
  const start = from;
  const splits = level.tiles.includes(Tile.Splitter);
  const paints = hasPaint(level);
  const key = (s: State) => stateKey(level, s, splits, paints);
  const parent = new Map<number, { prev: number; steps: Move[]; state: State } | null>();
  const startKey = key(start);
  parent.set(startKey, null);
  const queue: State[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const curKey = key(cur);
    for (const { steps, result: r } of successors(level, cur)) {
      if (r.outcome === 'fall' || r.outcome === 'bump') continue;
      if (allow && !allow(cur, steps, r)) continue;
      const k = key(r.state);
      if (parent.has(k)) continue;
      parent.set(k, { prev: curKey, steps, state: r.state });
      if (r.outcome === 'win') {
        const chunks: Move[][] = [];
        const path: State[] = [];
        let at: number = k;
        for (let link = parent.get(at); link; link = parent.get(at)) {
          chunks.push(link.steps);
          path.push(link.state);
          at = link.prev;
        }
        path.push(start);
        const all = chunks.reverse().flat();
        return { moves: all.filter((m): m is Dir => m !== 'swap'), steps: all, path: path.reverse(), explored: parent.size };
      }
      queue.push(r.state);
    }
  }
  return null;
}
