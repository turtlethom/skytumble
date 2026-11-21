// Analyze levels: npx vite-node scripts/design/analyze.ts <file | level id | id prefix>...
//   A file holds design blocks (see lib.ts) separated by blank lines; `wind-06` or `wind-` reads the chapters.
// For each level: par, explored states, dead ends, ice and pad uses, switches pressed, and the grid with
// '*' on every tile the optimal solution never touches. An unsolvable level gets a diagnosis instead:
// where every pad sends the block, the closest it gets to the goal, and a map of where it can reach.
// Env: TRACE=1 move-by-move trace · DIAG=1 diagnosis for solvable levels too · BLOCK=1 print each as a
// design block (to copy a chapter level into a draft file).
import { initialState, play } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { flipUses, iceUses, padUses, shapeUses } from '../../src/levels/validate';
import { diagnose, explore } from './explore';
import { levelColors } from './checks';
import { build, describeMotions, designBlock, loadDesigns, paintText, textRow, touched } from './lib';

const env = (k: string) => process.env[k] === '1';
// Paint levels rotate their colors: two in a row with the same set get flagged.
let lastColors: { name: string; set: string } | null = null;
for (const arg of process.argv.slice(2)) {
  for (const d of await loadDesigns(arg)) {
    const { rows, switches, on, level } = d;
    console.log(`\n@${d.name}`);
    const colors = levelColors(level);
    if (colors.length) {
      const set = colors.join(', ');
      console.log(`colors [${set}]${lastColors?.set === set ? `  SAME COLORS as ${lastColors.name}: rotate them` : ''}`);
      lastColors = { name: d.name, set };
    }
    if (env('BLOCK')) console.log(designBlock(d));
    const sol = solve(level);
    const ex = explore(level);
    if (!sol) {
      console.log('UNSOLVABLE');
      console.log(diagnose(rows, level, ex).join('\n'));
      continue;
    }
    const u = iceUses(level, sol.steps);
    let st = initialState(level);
    const trace: string[] = [];
    const pressed: string[] = [];
    const splitUses = new Set<string>();
    for (const dir of sol.steps) {
      const r = play(level, st, dir);
      if (dir === 'swap') {
        trace.push(`T: swap → cube (${r.state.block.x},${r.state.block.y}) moves`);
        st = r.state;
        continue;
      }
      if (r.split) splitUses.add('split');
      if (r.joined) splitUses.add('join');
      if (r.painted) {
        const p = r.state.paint ?? [0, 0];
        splitUses.add(p.some((c) => c === 7) ? 'mud' : p.some((c) => c >= 4) ? 'mix' : p[0] !== p[1] && r.state.block.n !== 1 ? 'two-tone' : 'paint');
      }
      if (r.washed) splitUses.add('wash');
      // A standing block on a gate with two different halves passed on their blend.
      const bs = r.state.block;
      if (bs.o === 'S' && bs.n !== 1 && rows[bs.y]?.[bs.x] === '{' && r.state.paint && r.state.paint[0] !== r.state.paint[1]) splitUses.add('blend');
      if (r.state.block && [r.state.block].some((b) => (b.o === 'S' ? [[b.x, b.y]] : b.o === 'X' ? [[b.x, b.y], [b.x + 1, b.y]] : [[b.x, b.y], [b.x, b.y + 1]]).some(([x, y]) => rows[y]?.[x] === '{'))) splitUses.add('gate');
      const m = describeMotions(r.motions);
      r.pressed.forEach((c) => pressed.push(`${rows[textRow(level, r.state.layer ?? 0, c.y)][c.x]}@${c.x},${c.y}${r.state.layer ? '↑' : ''}`));
      const b = r.state.block;
      const up = level.ceiling && r.state.layer ? '↑' : '';
      const shape = b.n === 1 ? 'cube ' : b.n === 3 ? 'tall ' : '';
      trace.push(`${dir[0].toUpperCase()}:${shape}${b.o}(${b.x},${b.y})${up}${paintText(r.state)}${m ? ` [${m}]` : ''}${(r.held ?? []).map((h) => ` ${h.belt ? 'HELD' : r.motions[h.after - 1]?.kind === 'fly' ? (r.outcome === 'fall' ? 'CRASH' : 'SHORT') : 'BRAKE'}(${h.x},${h.y})`).join('')}${r.locked ? ` LOCKED(${r.locked.map((c) => `${c.x},${c.y}`).join(' ')})` : ''}${r.pressed.length ? ' PRESS' : ''}${r.painted ? ' PAINT' : ''}${r.washed ? ' WASH' : ''}${r.split ? ` SPLIT→(${r.split.x},${r.split.y})` : ''}${r.joined ? ` JOIN(${r.joined.x},${r.joined.y})` : ''}${r.knocked ? ` TOPPLE(${r.bumped!.x},${r.bumped!.y})${r.bridged ? ` bridges(${r.bridged.x},${r.bridged.y})` : ' wasted'}` : ''}`);
      st = r.state;
    }
    const plain = solve(build(rows.map((l) => (/^-{3,}/.test(l) ? l : l.replace(/[~^v<>UDLR+\[\]AVruys{]/g, '#'))), switches, on, level.startShape ?? 2));
    const pads = [...padUses(level, sol.steps), ...flipUses(level, sol.steps), ...shapeUses(level, sol.steps), ...splitUses];
    // Swaps are free; their share of all actions is the swap-tedium measure.
    const swaps = sol.steps.length - sol.moves.length;
    const swapText = swaps ? `  swaps ${swaps} (${Math.round((100 * swaps) / sol.steps.length)}% of actions)` : '';
    // A dead end: a state you can reach but never win from (without undo).
    const dead = ex.nodes.size - ex.canWin.size;
    console.log(
      `par ${sol.moves.length}  states ${sol.explored}  dead ends ${dead}/${ex.nodes.size}  ` +
        `uses [${[...u.uses, ...pads].join(', ')}]  pushes ${u.pushes}  presses [${pressed.join(' ')}]  ` +
        `| specials→floor par: ${plain ? plain.moves.length : 'unsolvable'}${swapText}`,
    );
    const seen = touched(level, sol.steps);
    console.log(rows.map((r, y) => [...r].map((c, x) => ('.-'.includes(c) || seen.has(`${x},${y}`) ? c : '*')).join('')).join('\n'));
    // Special pieces the solution never touches read as clutter (toy-17's stray cube switch). Raised walls
    // are left out: one the solution never bumps can still be doing its job.
    const unused = rows.flatMap((r, y) => [...r].flatMap((c, x) => (/[oxXcnt=|<>^vUDLR+MPQWmpqw\[\]AVruys{]/.test(c) && !seen.has(`${x},${y}`) ? [`${c}@${x},${y}`] : [])));
    if (unused.length) console.log(`UNUSED specials (the solution never touches them; keep only deliberate decoys): ${unused.join(' ')}`);
    if (env('TRACE')) console.log(`  ${trace.join('\n  ')}`);
    if (env('DIAG')) console.log(diagnose(rows, level, ex).join('\n'));
  }
}
