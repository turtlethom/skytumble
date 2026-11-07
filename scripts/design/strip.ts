// Remove every tile a level's solution doesn't need, keeping par:
//   npm run -s strip -- <design file> [design name]...
// Takes a file of design blocks (see lib.ts), such as lattice.ts prints, and prints each stripped, with
// its par, states and dead ends. What's left is the puzzle's skeleton. Removing tiles also removes choices,
// so compare the states: a level can be better with a few of its unused lanes kept as wrong turns
// (regrow.ts adds back the ones that keep the puzzle).
import { block, normalize, report, strip } from './checks';
import { loadDrafts } from './drafts';

const [file, ...names] = process.argv.slice(2);
if (!file) {
  console.error('usage: strip.ts <design file> [design name]...');
  process.exit(2);
}
for (const d of await loadDrafts(file)) {
  if (names.length && !names.some((n) => d.name.startsWith(n))) continue;
  const s = strip(normalize(d));
  const r = report(s);
  console.log(`${block(`${d.name} stripped: par ${r?.par} states ${r?.states} dead ends ${r?.deadEnds}/${r?.reachable}`, s)}\n`);
}
