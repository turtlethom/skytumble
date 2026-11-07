// Replay moves on a level: npx vite-node scripts/design/sim.ts <file | level id> <moves> [design name]
//   Moves are letters (`RRDL`, spaces allowed). With a design file holding several blocks, name the one
//   to use (default: the first). Prints each move's result and the board at the end, with the block
//   drawn as @ (standing) or = (lying), switched-off bridges as ',', walls in capitals when
//   raised, and fallen hedges (their own tile and any gap they bridged) as '_'. SHOW=1 draws the board after
//   every move. Stops at the first fall or win. Use it to check a route you have in mind, or to replay
//   a playtester's moves.
import { blockCells, hedgeFell, initialState, isBridge, isBridged, isSolid, isWall, layerView, step, tileAt, wallUp } from '../../src/game/rules';
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

function board(rows: string[], full: Level, s: State): string {
  const at = (layer: number, x: number, y: number) => `${layer},${x},${y}`;
  const body = new Set(blockCells(s.block).map(([x, y]) => at(s.layer ?? 0, x, y)));
  return rows
    .map((r, row) => {
      if (/^-{3,}/.test(r)) return r;
      const layer = row > full.height ? 1 : 0;
      const y = layer ? row - full.height - 1 : row;
      const level = layerView(full, layer);
      return [...r.padEnd(full.width, '.')]
        .map((c, x) => {
          if (body.has(at(layer, x, y))) return s.block.o === 'S' ? '@' : '=';
          const t = tileAt(level, x, y);
          const g = level.groups[y * level.width + x];
          if (isBridge(t) && !isSolid(level, x, y, s.bridges)) return ',';
          if (isWall(t)) return wallUp(t, g, s.bridges, level.bridgesOn) ? c.toUpperCase() : c.toLowerCase();
          if (t === Tile.Hedge && hedgeFell(g, s.hedges ?? 0)) return '_';
          if (isBridged(level, x, y, s.hedges ?? 0)) return '_';
          return c;
        })
        .join('');
    })
    .join('\n');
}

let s = initialState(d.level);
const moves = parseMoves(movesArg);
console.log(`@${d.name}  start ${s.block.o}(${s.block.x},${s.block.y})`);
for (const [i, dir] of moves.entries()) {
  const r = step(d.level, s, dir);
  const b = r.state.block;
  const hit = r.bumped ? `${r.knocked ? 'TOPPLED' : 'BUMPED'}(${r.bumped.x},${r.bumped.y})${r.bridged ? ` →bridged(${r.bridged.x},${r.bridged.y})` : ''}` : '';
  const held = (r.held ?? []).map((h) => `${h.belt ? 'HELD' : 'BRAKE'}(${h.x},${h.y})`).join(' ');
  const extra = [describeMotions(r.motions), held, r.pressed.length ? 'PRESS' : '', r.broke ? 'BROKE' : '', hit].filter(Boolean);
  const up = d.level.ceiling ? (r.state.layer ? ' ceiling' : ' ground') : '';
  const shape = b.n === 1 ? 'cube ' : b.n === 3 ? 'tall ' : '';
  console.log(`${String(i + 1).padStart(3)} ${dir[0].toUpperCase()} → ${shape}${b.o}(${b.x},${b.y})${up} ${r.outcome}${extra.length ? `  ${extra.join(' ')}` : ''}`);
  s = r.state;
  if (process.env.SHOW === '1') console.log(board(d.rows, d.level, s));
  if (r.outcome === 'fall' || r.outcome === 'win') break;
}
if (process.env.SHOW !== '1') console.log(board(d.rows, d.level, s));
