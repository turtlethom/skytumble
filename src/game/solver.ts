import { initialState, step } from './rules';
import { DIRS, Dir, Level, State } from './types';

export interface Solution {
  moves: Dir[];
  /** States along the solution, starting with the initial state. */
  path: State[];
  /** Distinct states discovered before the goal was found: a rough measure of search space. */
  explored: number;
}

const O_INDEX = { S: 0, X: 1, Y: 2 } as const;

function key(level: Level, s: State): number {
  const b = s.block;
  return ((s.bridges * 3 + O_INDEX[b.o]) * level.height + b.y) * level.width + b.x;
}

/** Breadth-first search for the shortest solution, or null if the level is unsolvable. */
export function solve(level: Level, from: State = initialState(level)): Solution | null {
  const start = from;
  const parent = new Map<number, { prev: number; dir: Dir; state: State } | null>();
  const startKey = key(level, start);
  parent.set(startKey, null);
  const queue: State[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const curKey = key(level, cur);
    for (const dir of DIRS) {
      const r = step(level, cur, dir);
      if (r.outcome === 'fall') continue;
      const k = key(level, r.state);
      if (parent.has(k)) continue;
      parent.set(k, { prev: curKey, dir, state: r.state });
      if (r.outcome === 'win') {
        const moves: Dir[] = [];
        const path: State[] = [];
        let at: number = k;
        for (let link = parent.get(at); link; link = parent.get(at)) {
          moves.push(link.dir);
          path.push(link.state);
          at = link.prev;
        }
        path.push(start);
        return { moves: moves.reverse(), path: path.reverse(), explored: parent.size };
      }
      queue.push(r.state);
    }
  }
  return null;
}
