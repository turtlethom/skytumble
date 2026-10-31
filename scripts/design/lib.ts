// Shared helpers for the level-design tools in this folder.
import { parseLevel } from '../../src/game/ascii';
import { blockCells, initialState, step } from '../../src/game/rules';
import { DIR_DELTA, Dir, Level } from '../../src/game/types';

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

/** Cells the block covers anywhere along a solution, including tiles passed mid-slide. */
export function touched(level: Level, moves: Dir[]): Set<string> {
  const seen = new Set<string>();
  const mark = (b: { x: number; y: number; o: 'S' | 'X' | 'Y' }) =>
    blockCells(b).forEach(([x, y]) => seen.add(`${x},${y}`));
  let s = initialState(level);
  mark(s.block);
  for (const d of moves) {
    const r = step(level, s, d);
    mark(r.rolled);
    for (const m of r.motions) {
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
