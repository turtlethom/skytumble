import { initialState, successors } from './rules';
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
export function stateKey(level: Level, s: State, splits = level.tiles.includes(Tile.Splitter)): number {
  if (!splits) return blockKey(level, s, s.block);
  const cells = level.width * level.height;
  if (!s.other) return blockKey(level, s, s.block) * (cells + 1);
  const a = s.block.y * level.width + s.block.x;
  const b = s.other.y * level.width + s.other.x;
  const [lo, hi] = a < b ? [s.block, s.other] : [s.other, s.block];
  return blockKey(level, s, { x: lo.x, y: lo.y, o: 'S', n: 1 }) * (cells + 1) + hi.y * level.width + hi.x + 1;
}

/** Breadth-first search for the shortest solution, or null if the level is unsolvable. */
export function solve(level: Level, from: State = initialState(level)): Solution | null {
  const start = from;
  const splits = level.tiles.includes(Tile.Splitter);
  const key = (s: State) => stateKey(level, s, splits);
  const parent = new Map<number, { prev: number; steps: Move[]; state: State } | null>();
  const startKey = key(start);
  parent.set(startKey, null);
  const queue: State[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const curKey = key(cur);
    for (const { steps, result: r } of successors(level, cur)) {
      if (r.outcome === 'fall' || r.outcome === 'bump') continue;
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
