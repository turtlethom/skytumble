// Analyze draft levels: npx vite-node scripts/design/analyze.ts <file>   (TRACE=1 for the move-by-move trace)
// The file holds design blocks (see lib.ts) separated by blank lines. For each: par, explored states, ice
// and pad uses, switches pressed, and the grid with '*' on every tile the optimal solution never touches.
import { readFileSync } from 'node:fs';
import { initialState, step } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { iceUses, padUses } from '../../src/levels/validate';
import { build, parseBlock, touched } from './lib';

const showTrace = process.env.TRACE === '1';
for (const block of readFileSync(process.argv[2], 'utf8').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
  const lines = block.split('\n');
  const { rows, switches, on } = parseBlock(lines);
  const level = build(rows, switches, on);
  const sol = solve(level);
  console.log(`\n${lines.find((l) => l.startsWith('@')) ?? '@?'}`);
  if (!sol) {
    console.log('UNSOLVABLE');
    continue;
  }
  const u = iceUses(level, sol.moves);
  let st = initialState(level);
  const trace: string[] = [];
  const pressed: string[] = [];
  for (const d of sol.moves) {
    const r = step(level, st, d);
    const m = r.motions.map((x) => `${x.kind}-${x.dir}→(${x.to.x},${x.to.y})`).join(' ');
    r.pressed.forEach((c) => pressed.push(`${rows[c.y][c.x]}@${c.x},${c.y}`));
    const b = r.state.block;
    trace.push(`${d[0].toUpperCase()}:${b.o}(${b.x},${b.y})${m ? ` [${m}]` : ''}${r.pressed.length ? ' PRESS' : ''}`);
    st = r.state;
  }
  const plain = solve(build(rows.map((l) => l.replace(/[~^v<>UDLR]/g, '#')), switches, on));
  const pads = padUses(level, sol.moves);
  console.log(
    `par ${sol.moves.length}  states ${sol.explored}  uses [${[...u.uses, ...pads].join(', ')}]  pushes ${u.pushes}  ` +
      `presses [${pressed.join(' ')}]  | specials→floor par: ${plain ? plain.moves.length : 'unsolvable'}`,
  );
  const seen = touched(level, sol.moves);
  console.log(rows.map((r, y) => [...r].map((c, x) => (c !== '.' && !seen.has(`${x},${y}`) ? '*' : c)).join('')).join('\n'));
  if (showTrace) console.log(`  ${trace.join('\n  ')}`);
}
