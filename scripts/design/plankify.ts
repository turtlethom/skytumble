// Turn floor into planks wherever the level still solves at the same par or longer:
//   npm run -s plankify -- <design file|id> [x0-x1]
// For plank levels: a search fills a plank field with floor, since floor adds states; this keeps only
// the stones the puzzle needs to stand on. Tries tiles in reading order, keeping each swap that holds,
// within columns x0-x1 if given (the field, so start and goal islands stay stone). Prints each design
// with its par and states before and after.
import { block, normalize, plankify, report } from './checks';
import { loadDrafts } from './drafts';

const [file, cols] = process.argv.slice(2);
if (!file) {
  console.error('usage: plankify.ts <design file|id> [x0-x1]');
  process.exit(2);
}
const [x0, x1] = cols ? cols.split('-').map(Number) : [0, Infinity];
for (const d of await loadDrafts(file)) {
  const before = report(normalize(d));
  if (!before) {
    console.log(`${d.name}: unsolvable, skipped\n`);
    continue;
  }
  const p = plankify(normalize(d), (x) => x >= x0 && x <= x1);
  const after = report(p);
  console.log(`${block(`${d.name} plankified: par ${before.par} → ${after?.par}, states ${before.states} → ${after?.states}`, p)}\n`);
}
