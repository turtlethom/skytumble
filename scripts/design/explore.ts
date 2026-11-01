// Whole-level exploration for the design tools: every reachable state, which of them can still
// win, where each pad sends the block, and a map of where the block can get to. diagnose() turns
// it into a report that says *why* a draft is unsolvable instead of just "UNSOLVABLE".
import { blockCells, findGoal, flight, initialState, isSolid, step, tileAt } from '../../src/game/rules';
import { Block, DIRS, Dir, Level, State, Tile } from '../../src/game/types';

const keyOf = (s: State) => `${s.block.x},${s.block.y},${s.block.o},${s.bridges}`;
const blockKey = (b: Block) => `${b.x},${b.y},${b.o}`;

interface Node {
  state: State;
  depth: number;
  parent: string | null;
  move: Dir | null;
}

export interface Exploration {
  nodes: Map<string, Node>;
  /** States from which the goal can still be reached. */
  canWin: Set<string>;
  /** Launch poses (block on pads) that fired at least once, by blockKey. */
  launched: Set<string>;
  /** True if the search stopped at the state limit. */
  truncated: boolean;
}

export function explore(level: Level, limit = 300_000): Exploration {
  const start = initialState(level);
  const nodes = new Map<string, Node>([[keyOf(start), { state: start, depth: 0, parent: null, move: null }]]);
  const preds = new Map<string, string[]>();
  const winners: string[] = [];
  const launched = new Set<string>();
  const queue = [keyOf(start)];
  let truncated = false;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    const node = nodes.get(k)!;
    for (const dir of DIRS) {
      const r = step(level, node.state, dir);
      r.motions.filter((m) => m.kind === 'fly').forEach((m) => launched.add(blockKey(m.from)));
      if (r.outcome === 'fall') continue;
      if (r.outcome === 'win') {
        winners.push(k);
        continue;
      }
      const nk = keyOf(r.state);
      if (!preds.has(nk)) preds.set(nk, []);
      preds.get(nk)!.push(k);
      if (nodes.has(nk)) continue;
      if (nodes.size >= limit) {
        truncated = true;
        continue;
      }
      nodes.set(nk, { state: r.state, depth: node.depth + 1, parent: k, move: dir });
      queue.push(nk);
    }
  }
  const canWin = new Set(winners);
  const back = [...winners];
  while (back.length) for (const p of preds.get(back.pop()!) ?? []) if (!canWin.has(p)) canWin.add(p), back.push(p);
  return { nodes, canWin, launched, truncated };
}

/** Moves from the start to an explored state. */
export function pathTo(ex: Exploration, key: string): Dir[] {
  const moves: Dir[] = [];
  for (let n = ex.nodes.get(key); n?.move; n = ex.nodes.get(n.parent!)) moves.push(n.move);
  return moves.reverse();
}

const DIR_LETTER: Record<Dir, string> = { up: 'U', down: 'D', left: 'L', right: 'R' };
export const movesText = (moves: Dir[]) => moves.map((d) => DIR_LETTER[d]).join('');

const POSE: Record<Block['o'], string> = { S: 'standing', X: 'lying along x', Y: 'lying along y' };
const cellsText = (b: Block) => blockCells(b).map(([x, y]) => `${x},${y}`).join(' + ');

/** The arrow pads fire with under `b`, mirroring rules.ts: standing on one, or lying fully on two that agree. */
function padArrow(level: Level, b: Block): Dir | null {
  const cells = blockCells(b);
  if (!cells.every(([x, y]) => tileAt(level, x, y) === Tile.Pad)) return null;
  const arrows = new Set(cells.map(([x, y]) => level.groups[y * level.width + x]));
  return arrows.size === 1 ? DIRS[[...arrows][0]] : null;
}

function tileName(level: Level, x: number, y: number, bridges: number): string {
  const t = tileAt(level, x, y);
  const g = x >= 0 && y >= 0 && x < level.width && y < level.height ? level.groups[y * level.width + x] : -1;
  switch (t) {
    case Tile.Empty:
      return 'EMPTY';
    case Tile.Bridge:
      return `bridge ${g} (${(bridges >> g) & 1 ? 'on' : 'off'} at start)`;
    case Tile.Pad:
      return `pad ${DIRS[g]}`;
    case Tile.Conveyor:
      return `belt ${DIRS[g]}`;
    default:
      return Tile[t].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
}

/** One line per launch pose in the level: where it lands, on what, and whether play ever fires it. */
export function padReport(level: Level, ex: Exploration): string[] {
  const lines: string[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (tileAt(level, x, y) !== Tile.Pad) continue;
      for (const o of ['S', 'X', 'Y'] as const) {
        const b: Block = { x, y, o };
        const dir = padArrow(level, b);
        if (!dir) continue;
        const land = flight(b, dir);
        const under = blockCells(land).map(([cx, cy]) => tileName(level, cx, cy, level.bridgesOn));
        const notes: string[] = [];
        if (!blockCells(land).every(([cx, cy]) => isSolid(level, cx, cy, ~0))) notes.push('✗ FALLS');
        else if (!blockCells(land).every(([cx, cy]) => isSolid(level, cx, cy, level.bridgesOn)))
          notes.push('needs a bridge on');
        if (land.o === 'S' && tileAt(level, land.x, land.y) === Tile.Fragile) notes.push('✗ BREAKS the fragile tile');
        if (land.o === 'S' && tileAt(level, land.x, land.y) === Tile.Goal) notes.push('wins');
        if (padArrow(level, land)) notes.push('chains');
        notes.push(ex.launched.has(blockKey(b)) ? 'fired in play' : 'never fired in play');
        lines.push(
          `${dir.padEnd(5)} ${POSE[o].padEnd(13)} from ${cellsText(b).padEnd(11)} → ${POSE[land.o]} on ` +
            `${cellsText(land)} [${under.join(', ')}]  ${notes.join(' · ')}`,
        );
      }
    }
  }
  return lines;
}

/**
 * The level beside a reach map: S = the block rests standing here, l = only ever lies across it,
 * - = a tile the block never rests on, . = empty. Both grids keep the level's coordinates.
 */
export function reachMap(rows: string[], level: Level, ex: Exploration): string[] {
  const standing = new Set<string>();
  const covered = new Set<string>();
  for (const { state } of ex.nodes.values()) {
    for (const [x, y] of blockCells(state.block)) covered.add(`${x},${y}`);
    if (state.block.o === 'S') standing.add(`${state.block.x},${state.block.y}`);
  }
  const ruler = (pad: string) => pad + [...Array(level.width).keys()].map((x) => x % 10).join('');
  const out = [`${ruler('    ')}   ${ruler('')}`];
  for (let y = 0; y < level.height; y++) {
    let reach = '';
    for (let x = 0; x < level.width; x++) {
      const k = `${x},${y}`;
      reach += tileAt(level, x, y) === Tile.Empty ? '.' : standing.has(k) ? 'S' : covered.has(k) ? 'l' : '-';
    }
    out.push(`${String(y).padStart(3)} ${(rows[y] ?? '').padEnd(level.width)}   ${reach}`);
  }
  return out;
}

/** The reached state nearest the goal (standing preferred, then fewest moves). */
export function closest(level: Level, ex: Exploration): { key: string; dist: number; block: Block } | null {
  const goal = findGoal(level);
  if (!goal) return null;
  let best: { key: string; dist: number; block: Block; score: number } | null = null;
  for (const [key, n] of ex.nodes) {
    const dist = Math.min(...blockCells(n.state.block).map(([x, y]) => Math.abs(x - goal.x) + Math.abs(y - goal.y)));
    const score = dist * 2 + (n.state.block.o === 'S' ? 0 : 1) + n.depth / 1000;
    if (!best || score < best.score) best = { key, dist, block: n.state.block, score };
  }
  return best;
}

/** The full "why is this unsolvable" report. */
export function diagnose(rows: string[], level: Level, ex = explore(level)): string[] {
  const out: string[] = [];
  const masks = new Set([...ex.nodes.values()].map((n) => n.state.bridges));
  out.push(
    `reachable states ${ex.nodes.size}${ex.truncated ? ' (search cut off)' : ''} · bridge settings seen: ` +
      [...masks].map((m) => (m ? `on {${[...Array(10).keys()].filter((g) => (m >> g) & 1).join(',')}}` : 'all off')).join(' | '),
  );
  const goal = findGoal(level);
  if (!goal) out.push('no goal tile (G)');
  const near = closest(level, ex);
  if (near && goal) {
    const where = near.dist === 0 ? 'on the goal but not standing' : `${near.dist} tile${near.dist > 1 ? 's' : ''} from the goal`;
    out.push(
      `closest approach: ${POSE[near.block.o]} on ${cellsText(near.block)}, ${where}, ` +
        `after ${movesText(pathTo(ex, near.key)) || '(start)'}`,
    );
  }
  const pads = padReport(level, ex);
  if (pads.length) out.push('pads:', ...pads.map((l) => `  ${l}`));
  out.push('reach (S stand · l lie · - never · . empty):', ...reachMap(rows, level, ex));
  return out;
}
