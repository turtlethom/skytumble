// Replay moves on a level: npx vite-node scripts/design/sim.ts <file | level id> <moves> [design name]
//   Moves are letters (`RRDL`, spaces allowed). With a design file holding several blocks, name the one
//   to use (default: the first). Prints each move's result and the board at the end, with the block
//   drawn as @ (standing) or = (lying) and switched-off bridges as ','. SHOW=1 draws the board after
//   every move. Stops at the first fall or win. Use it to check a route you have in mind, or to replay
//   a playtester's moves.
import { blockCells, initialState, isSolid, step, tileAt } from '../../src/game/rules';
import { Level, State, Tile } from '../../src/game/types';
import { describeMotions, loadDesigns, parseMoves } from './lib';

const [arg, movesArg, name] = process.argv.slice(2);
if (!arg || movesArg === undefined) {
  console.error('usage: sim.ts <file | level id> <moves> [design name]');
  process.exit(2);
}
const designs = await loadDesigns(arg);
const d = name ? designs.find((x) => x.name === name) : designs[0];
if (!d) throw new Error(`No design named '${name}' in ${arg}`);

function board(rows: string[], level: Level, s: State): string {
  const body = new Set(blockCells(s.block).map(([x, y]) => `${x},${y}`));
  return rows
    .map((r, y) =>
      [...r.padEnd(level.width, '.')]
        .map((c, x) => {
          if (body.has(`${x},${y}`)) return s.block.o === 'S' ? '@' : '=';
          if (tileAt(level, x, y) === Tile.Bridge && !isSolid(level, x, y, s.bridges)) return ',';
          return c;
        })
        .join(''),
    )
    .join('\n');
}

let s = initialState(d.level);
const moves = parseMoves(movesArg);
console.log(`@${d.name}  start ${s.block.o}(${s.block.x},${s.block.y})`);
for (const [i, dir] of moves.entries()) {
  const r = step(d.level, s, dir);
  const b = r.state.block;
  const extra = [describeMotions(r.motions), r.pressed.length ? 'PRESS' : '', r.broke ? 'BROKE' : ''].filter(Boolean);
  console.log(`${String(i + 1).padStart(3)} ${dir[0].toUpperCase()} → ${b.o}(${b.x},${b.y}) ${r.outcome}${extra.length ? `  ${extra.join(' ')}` : ''}`);
  s = r.state;
  if (process.env.SHOW === '1') console.log(board(d.rows, d.level, s));
  if (r.outcome !== 'ok') break;
}
if (process.env.SHOW !== '1') console.log(board(d.rows, d.level, s));
