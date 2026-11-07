// Add back tiles a strip removed, keeping each only if par holds and every wall color that has to move
// still does: wrong turns and decoys that raise the state count without changing the puzzle.
//   npm run -s regrow -- <stripped file> <full file>      (blocks paired in order)
import { block, normalize, regrow, report } from './checks';
import { loadDrafts } from './drafts';

const [strippedArg, fullArg] = process.argv.slice(2);
if (!strippedArg || !fullArg) {
  console.error('usage: regrow.ts <stripped file> <full file>');
  process.exit(2);
}
const stripped = await loadDrafts(strippedArg);
const full = await loadDrafts(fullArg);
stripped.forEach((s, i) => {
  if (!full[i]) return;
  const grown = regrow(normalize(s), normalize(full[i]));
  const r = report(grown);
  console.log(`${block(`${s.name} regrown: par ${r?.par} states ${r?.states} dead ends ${r?.deadEnds}/${r?.reachable}`, grown)}\n`);
});
