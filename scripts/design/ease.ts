// Make a level easier without changing its idea: fill tiles the solution doesn't use, one at a time,
// with FILL (default '.', or 'K' for a cave or maze, so it stays stone), keeping each change only if it
// lowers the state count (fewer wrong turns), par stays within PAR=lo-hi (default: par ±2), every switch
// color that has to move still does, and the solution never presses a switch and undoes it within two
// moves (a repositioning trick that reads as arbitrary). Stops at TARGET states (default: none).
//   FILL=K TARGET=300 npm run -s ease -- <file|id>
import { blockCells, initialState, step } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { Level } from '../../src/game/types';
import { Draft, block, quickRepresses, report, tryLevel, wallColors } from './checks';
import { loadDrafts } from './drafts';

const fill = process.env.FILL ?? '.';
const target = Number(process.env.TARGET ?? 0);

for (const arg of process.argv.slice(2)) {
  for (const d of await loadDrafts(arg)) {
    const level0 = tryLevel(d)!;
    const sol0 = solve(level0)!;
    const [lo, hi] = (process.env.PAR ?? `${sol0.moves.length - 2}-${sol0.moves.length + 2}`).split('-').map(Number);
    const moving = (l: Level, par: number) => wallColors(l, par).filter((c) => c.moves).map((c) => c.group).sort().join();
    const mustMove = moving(level0, sol0.moves.length);
    /** Lower is easier; a quick re-press costs far more than any number of states. */
    const score = (draft: Draft): number | null => {
      const l = tryLevel(draft);
      const sol = l && solve(l);
      if (!l || !sol || sol.moves.length < lo || sol.moves.length > hi) return null;
      if (moving(l, sol.moves.length) !== mustMove) return null;
      return quickRepresses(l, sol.moves) * 10_000 + sol.explored;
    };
    let cur: Draft = d;
    let best = score(cur)!;
    for (let improved = true; improved && (!target || best % 10_000 > target); ) {
      improved = false;
      const l = tryLevel(cur)!;
      const sol = solve(l)!;
      // Cells the solution's block ever covers, including mid-slide; those stay.
      const usedCells = new Set<string>();
      const mark = (b: Parameters<typeof blockCells>[0]) => blockCells(b).forEach(([x, y]) => usedCells.add(`${x},${y}`));
      let s = initialState(l);
      mark(s.block);
      for (const m of sol.moves) {
        const r = step(l, s, m);
        mark(r.rolled);
        // A slide crosses every tile between its ends.
        for (const mo of r.motions) {
          const [dx, dy] = [Math.sign(mo.to.x - mo.from.x), Math.sign(mo.to.y - mo.from.y)];
          for (let b = mo.from; ; b = { ...b, x: b.x + dx, y: b.y + dy }) {
            mark(b);
            if ((b.x === mo.to.x && b.y === mo.to.y) || (!dx && !dy)) break;
          }
        }
        s = r.state;
      }
      let pick: { draft: Draft; s: number } | null = null;
      cur.rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (!'#~f'.includes(c) || usedCells.has(`${x},${y}`)) return;
          const rows = cur.rows.slice();
          rows[y] = row.slice(0, x) + fill + row.slice(x + 1);
          const sc = score({ ...cur, rows });
          if (sc !== null && sc < best && (!pick || sc < pick.s)) pick = { draft: { ...cur, rows }, s: sc };
        }),
      );
      if (pick) {
        cur = (pick as { draft: Draft }).draft;
        best = (pick as { s: number }).s;
        improved = true;
      }
    }
    const before = report(d)!;
    const after = report(cur)!;
    const re0 = quickRepresses(level0, sol0.moves);
    const lv = tryLevel(cur)!;
    const re1 = quickRepresses(lv, solve(lv)!.moves);
    console.log(
      `@${d.name}: par ${before.par} → ${after.par}, states ${before.states} → ${after.states}, dead ends ${before.deadEnds} → ${after.deadEnds}, quick re-presses ${re0} → ${re1}`,
    );
    console.log(`${block(`${d.name} eased`, cur)}\n   moves: ${after.moves}\n`);
  }
}
