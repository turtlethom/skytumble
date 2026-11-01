// Shared helpers for the level-design tools in this folder.
import { existsSync, readFileSync } from 'node:fs';
import { formatLevel, parseLevel } from '../../src/game/ascii';
import { blockCells, initialState, step } from '../../src/game/rules';
import { Block, DIR_DELTA, Dir, Level, Tile } from '../../src/game/types';

/**
 * A design block: grid rows plus optional option lines.
 *   @name          label for output
 *   !switches 0 1  switch target groups in reading order
 *   !on 1          bridge groups that start extended
 */
export function parseBlock(lines: string[]): { rows: string[]; switches: number[]; on: number[] } {
  const opt = (k: string) =>
    (lines.find((l) => l.startsWith(`!${k} `)) ?? '').split(/\s+/).slice(1).filter(Boolean).map(Number);
  return { rows: lines.filter((l) => !l.startsWith('!') && !l.startsWith('@')), switches: opt('switches'), on: opt('on') };
}

export function build(rows: string[], switches: number[], on: number[]): Level {
  return parseLevel(rows, switches, on.reduce((mask, g) => mask | (1 << g), 0));
}

/** Where a layer's row sits in the level text: the ceiling follows the ground and a `---` line. */
export const textRow = (level: Level, layer: number, y: number) => (layer ? level.height + 1 + y : y);

/**
 * Cells the block covers anywhere along a solution, including tiles passed mid-slide (not mid-flight),
 * as `x,row` keys in the level text's coordinates (see textRow).
 */
export function touched(level: Level, moves: Dir[]): Set<string> {
  const seen = new Set<string>();
  let layer = 0;
  const mark = (b: { x: number; y: number; o: 'S' | 'X' | 'Y' }) =>
    blockCells(b).forEach(([x, y]) => seen.add(`${x},${textRow(level, layer, y)}`));
  let s = initialState(level);
  mark(s.block);
  for (const d of moves) {
    const r = step(level, s, d);
    mark(r.rolled);
    for (const m of r.motions) {
      // Flights pass over everything: only take-off and landing touch tiles. A flip changes layer.
      if (m.kind === 'fly' || m.kind === 'flip') {
        mark(m.from);
        if (m.kind === 'flip') layer = 1 - layer;
        mark(m.to);
        continue;
      }
      const { dx, dy } = DIR_DELTA[m.dir];
      for (let b = m.from; ; b = { ...b, x: b.x + dx, y: b.y + dy }) {
        mark(b);
        if (b.x === m.to.x && b.y === m.to.y) break;
      }
    }
    s = r.state;
  }
  return seen;
}

/** A level to work on, from a design file or from the chapters. */
export interface Design {
  name: string;
  rows: string[];
  switches: number[];
  on: number[];
  level: Level;
}

/**
 * Load designs from `arg`: a design file (blocks separated by blank lines, see parseBlock), or a
 * handmade level id (`wind-06`), or an id prefix (`wind-`) for a whole chapter.
 */
export async function loadDesigns(arg: string): Promise<Design[]> {
  if (existsSync(arg)) {
    return readFileSync(arg, 'utf8')
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((block, i) => {
        const lines = block.split('\n');
        const { rows, switches, on } = parseBlock(lines);
        const name = lines.find((l) => l.startsWith('@'))?.slice(1) ?? `#${i + 1}`;
        const level = build(rows, switches, on);
        // Re-print the rows from the parsed level so every layer is full height and width, and the
        // ceiling starts where textRow expects it.
        return { name, rows: formatLevel(level).split('\n'), switches, on, level };
      });
  }
  // Imported lazily: the chapters pull in Vite's ?raw imports, which only vite-node understands.
  const { HANDMADE } = await import('../../src/levels');
  const exact = HANDMADE.filter((h) => h.id === arg);
  const found = exact.length ? exact : HANDMADE.filter((h) => h.id.startsWith(arg));
  if (!found.length) throw new Error(`'${arg}' is neither a file nor a level id`);
  return found.map((h) => fromLevel(h.id, h.level));
}

/** The design-block view of a parsed level (rows, switch groups in reading order, bridges on). */
export function fromLevel(name: string, level: Level): Design {
  const switches: number[] = [];
  level.tiles.forEach((t, i) => {
    if (t === Tile.SoftSwitch || t === Tile.HeavySwitch) switches.push(level.groups[i]);
  });
  const on = [...Array(10).keys()].filter((g) => (level.bridgesOn >> g) & 1);
  return { name, rows: formatLevel(level).split('\n'), switches, on, level };
}

/** Print a design as a block that analyze.ts, sim.ts and search.ts read back. */
export function designBlock(d: Design): string {
  const opts = [d.switches.length ? `!switches ${d.switches.join(' ')}` : '', d.on.length ? `!on ${d.on.join(' ')}` : ''];
  return [`@${d.name}`, ...opts.filter(Boolean), ...d.rows].join('\n');
}

/** Parse moves written as letters (`RRDL`, spaces allowed) or full words (`right,down`). */
export function parseMoves(text: string): Dir[] {
  const words: Record<string, Dir> = { U: 'up', D: 'down', L: 'left', R: 'right' };
  const parts = text.includes(',') ? text.split(',') : [...text.replace(/\s+/g, '')];
  return parts.map((p) => {
    const d = words[p.trim()[0]?.toUpperCase()];
    if (!d) throw new Error(`Bad move '${p}': use U D L R`);
    return d;
  });
}

/** Short text for a step's motions: `push-left→(9,4) fly-left→(3,4)`. */
export function describeMotions(motions: { kind: string; dir: Dir; to: Block }[]): string {
  return motions.map((m) => `${m.kind}-${m.dir}→(${m.to.x},${m.to.y})`).join(' ');
}
