// Analyze levels: npx vite-node scripts/design/analyze.ts <file | level id | id prefix>...
//   A file holds design blocks (see lib.ts) separated by blank lines; `wind-06` or `wind-` reads the chapters.
// For each level: par, explored states, dead ends, ice and pad uses, switches pressed, and the grid with
// '*' on every tile the optimal solution never touches. An unsolvable level gets a diagnosis instead:
// where every pad sends the block, the closest it gets to the goal, and a map of where it can reach.
// Env: TRACE=1 move-by-move trace · DIAG=1 diagnosis for solvable levels too · BLOCK=1 print each as a
// design block (to copy a chapter level into a draft file).
import { initialState, step } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { iceUses, padUses } from '../../src/levels/validate';
import { diagnose, explore } from './explore';
import { build, describeMotions, designBlock, loadDesigns, touched } from './lib';

const env = (k: string) => process.env[k] === '1';
for (const arg of process.argv.slice(2)) {
  for (const d of await loadDesigns(arg)) {
    const { rows, switches, on, level } = d;
    console.log(`\n@${d.name}`);
    if (env('BLOCK')) console.log(designBlock(d));
    const sol = solve(level);
    const ex = explore(level);
    if (!sol) {
      console.log('UNSOLVABLE');
      console.log(diagnose(rows, level, ex).join('\n'));
      continue;
    }
    const u = iceUses(level, sol.moves);
    let st = initialState(level);
    const trace: string[] = [];
    const pressed: string[] = [];
    for (const dir of sol.moves) {
      const r = step(level, st, dir);
      const m = describeMotions(r.motions);
      r.pressed.forEach((c) => pressed.push(`${rows[c.y][c.x]}@${c.x},${c.y}`));
      const b = r.state.block;
      trace.push(`${dir[0].toUpperCase()}:${b.o}(${b.x},${b.y})${m ? ` [${m}]` : ''}${r.pressed.length ? ' PRESS' : ''}`);
      st = r.state;
    }
    const plain = solve(build(rows.map((l) => l.replace(/[~^v<>UDLR]/g, '#')), switches, on));
    const pads = padUses(level, sol.moves);
    // A dead end: a state you can reach but never win from (without undo).
    const dead = ex.nodes.size - ex.canWin.size;
    console.log(
      `par ${sol.moves.length}  states ${sol.explored}  dead ends ${dead}/${ex.nodes.size}  ` +
        `uses [${[...u.uses, ...pads].join(', ')}]  pushes ${u.pushes}  presses [${pressed.join(' ')}]  ` +
        `| specials→floor par: ${plain ? plain.moves.length : 'unsolvable'}`,
    );
    const seen = touched(level, sol.moves);
    console.log(rows.map((r, y) => [...r].map((c, x) => (c !== '.' && !seen.has(`${x},${y}`) ? '*' : c)).join('')).join('\n'));
    if (env('TRACE')) console.log(`  ${trace.join('\n  ')}`);
    if (env('DIAG')) console.log(diagnose(rows, level, ex).join('\n'));
  }
}
