// Remove every tile a level's solution doesn't need, keeping par:
//   npm run -s strip -- <design file> [design name]...
// Takes a file of design blocks (see lib.ts), such as lattice.ts prints, and prints each stripped, with
// its par, states and dead ends. What's left is the puzzle's skeleton. Removing tiles also removes choices,
// so compare the states: a level can be better with a few of its unused lanes kept as wrong turns.
import { formatLevel, parseLevel } from '../../src/game/ascii';
import { solve } from '../../src/game/solver';
import { explore } from './explore';
import { loadDesigns } from './lib';

const [file, ...names] = process.argv.slice(2);
if (!file) {
  console.error('usage: strip.ts <design file> [design name]...');
  process.exit(2);
}

/** Which switch this cell is, in reading order; -1 if it isn't one. */
function switchIndex(rows: string[][], x0: number, y0: number): number {
  let k = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (!'oxX'.includes(rows[y][x])) continue;
      if (x === x0 && y === y0) return k;
      k++;
    }
  }
  return -1;
}

for (const d of await loadDesigns(file)) {
  if (names.length && !names.some((n) => d.name.startsWith(n))) continue;
  const rows = d.rows.map((r) => [...r]);
  let switches = [...d.switches];
  const bridgesOn = d.on.reduce((mask, g) => mask | (1 << g), 0);
  const tryLevel = () => {
    try {
      return parseLevel(rows.map((r) => r.join('')), switches, bridgesOn);
    } catch {
      return null;
    }
  };
  const par = solve(tryLevel()!)!.moves.length;
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const c = rows[y][x];
        if (c === '.' || c === 'S' || c === 'G') continue;
        const k = switchIndex(rows, x, y);
        const saved = [...switches];
        if (k >= 0) switches.splice(k, 1);
        rows[y][x] = '.';
        const level = tryLevel();
        const solution = level && solve(level);
        if (solution && solution.moves.length === par) {
          changed = true;
        } else {
          rows[y][x] = c;
          switches = saved;
        }
      }
    }
  }
  const level = tryLevel()!;
  const ex = explore(level);
  console.log(
    `@${d.name} stripped: par ${par} states ${solve(level)!.explored} dead ends ${ex.nodes.size - ex.canWin.size}/${ex.nodes.size}\n` +
      `!switches ${switches.join(' ')}${d.on.length ? `\n!on ${d.on.join(' ')}` : ''}\n${formatLevel(level)}\n`,
  );
}
