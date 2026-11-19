// Ring-network puzzles: every way to color the ring slots and fill the switch slots of a template,
// solved and ranked. For Starfall's locked rings, where a press opens some rings and locks others.
//   npm run -s locks -- <template> <parLo> <parHi> [rings=+MmPp] [colors=01] [top=5] > out.txt
// In the template, `Z` is a ring slot (each takes one of `rings`) and `Y` a switch slot (floor, or a
// heavy switch in one of `colors`; KINDS=xo allows soft ones too). Other switches keep the groups their `!switches` line gives, read
// in order with the slots. A candidate counts only if it solves within the par range, every color it
// switches has to move (fixing it either way changes par, as `walls` checks), and no switch's color
// is missing from the level. STRICT=1 asks more: every color is needed in both states, so fixing it
// either way leaves no solution (the tension `star-13`'s orange has). COLORS=<n> asks for at least n
// switched colors (default 1). Best first: most states,
// then highest par. `?` cells read as floor, as in every template.
import { Tile } from '../../src/game/types';
import { solve } from '../../src/game/solver';
import { flipUses } from '../../src/levels/validate';
import { block, tryLevel, wallColors } from './checks';
import { loadDrafts } from './drafts';

const [file, lo, hi, ringSet = '+MmPp', colorSet = '01', topArg = '5'] = process.argv.slice(2);
if (!file || !lo || !hi) {
  console.error('usage: locks.ts <template> <parLo> <parHi> [rings=+MmPp] [colors=01] [top=5]');
  process.exit(1);
}
const [parLo, parHi, top] = [Number(lo), Number(hi), Number(topArg)];
const SWITCHES = 'oxX';
/** Tiles a switch moves: walls, bridges and rings in its color. */
const MOVERS = [Tile.WallUp, Tile.WallDown, Tile.Bridge, Tile.BridgeReversed, Tile.Flip, Tile.FlipLocked];

for (const d of await loadDrafts(file)) {
  const text = d.rows.join('\n');
  const zs = [...text].flatMap((c, i) => (c === 'Z' ? [i] : []));
  const ys = [...text].flatMap((c, i) => (c === 'Y' ? [i] : []));
  // KINDS=xo lets switch slots be heavy or soft (default heavy only).
  const kinds = process.env.KINDS ?? 'x';
  const ySlot = ['#', ...[...kinds].flatMap((k) => [...colorSet].map((g) => `${k}${g}`))];
  const total = ringSet.length ** zs.length * ySlot.length ** ys.length;
  console.error(`@${d.name}: ${zs.length} ring slots, ${ys.length} switch slots, ${total} candidates`);
  // About 40k candidates a minute: past MAX (default 500k), narrow the slots or the choices instead.
  if (total > Number(process.env.MAX ?? 500_000)) {
    console.error('  too many: fewer slots, fewer ring kinds or colors, or MAX=<n>');
    continue;
  }
  const found: { states: number; par: number; draft: typeof d; uses: string[] }[] = [];
  for (let n = 0; n < total; n++) {
    const chars = [...text];
    let k = n;
    for (const i of zs) {
      chars[i] = ringSet[k % ringSet.length];
      k = Math.floor(k / ringSet.length);
    }
    const groupAt = new Map<number, number>();
    for (const i of ys) {
      const pick = ySlot[k % ySlot.length];
      k = Math.floor(k / ySlot.length);
      chars[i] = pick[0];
      if (pick.length > 1) groupAt.set(i, Number(pick[1]));
    }
    // Switch groups in reading order: the template's own switches keep theirs, slots take their pick.
    const fixed = [...d.switches];
    const switches: number[] = [];
    chars.forEach((c, i) => {
      if (!SWITCHES.includes(c)) return;
      switches.push(groupAt.has(i) ? groupAt.get(i)! : (fixed.shift() ?? 0));
    });
    const draft = { ...d, rows: chars.join('').split('\n'), switches };
    const level = tryLevel(draft);
    if (!level) continue;
    // A switch whose color moves nothing is decoration.
    const floors = [level, ...(level.ceiling ? [level.ceiling] : [])];
    const moved = new Set(floors.flatMap((f) => f.tiles.flatMap((t, i) => (MOVERS.includes(t) && f.groups[i] >= 0 ? [f.groups[i]] : []))));
    if (switches.some((g) => !moved.has(g))) continue;
    const sol = solve(level);
    if (!sol || sol.moves.length < parLo || sol.moves.length > parHi) continue;
    const colors = wallColors(level, sol.moves.length);
    if (colors.length < Number(process.env.COLORS ?? 1) || colors.some((c) => !c.moves)) continue;
    // STRICT=1: every color is needed both ways, so fixing it either way leaves no solution.
    if (process.env.STRICT === '1' && colors.some((c) => c.allDown !== null || c.allUp !== null)) continue;
    const uses = flipUses(level, sol.moves);
    found.push({ states: sol.explored, par: sol.moves.length, draft, uses });
  }
  found.sort((a, b) => b.states - a.states || b.par - a.par);
  console.error(`  ${found.length} pass`);
  for (const f of found.slice(0, top)) {
    console.log(`${block(`${d.name} par ${f.par} states ${f.states} [${f.uses.join(', ')}]`, f.draft)}\n`);
  }
}
