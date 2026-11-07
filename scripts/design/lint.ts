// Check a draft before solving it: switches in reading order with their colors, colors with nothing to
// press them, belts that can be skipped, a goal only reachable lying, and what raised walls hide from the
// opening camera (and whether flipping the board north to south fixes that).
//   npm run -s lint -- <file|id|prefix>...        (templates allowed: `?` reads as floor)
import { flipNS, hidden, lint, tryLevel } from './checks';
import { loadDrafts } from './drafts';

for (const arg of process.argv.slice(2)) {
  for (const d of await loadDrafts(arg)) {
    const level = tryLevel(d);
    const lines = lint(d);
    const hid = level ? hidden(level) : [];
    for (const h of hid) lines.push(`HIDDEN: ${h}`);
    if (hid.length) {
      const flipped = tryLevel(flipNS(d));
      const after = flipped ? hidden(flipped).length : hid.length;
      lines.push(after < hid.length ? `flipping north to south leaves ${after} hidden` : 'flipping north to south does not help');
    }
    console.log(`@${d.name}${lines.length ? '' : '  ok'}`);
    for (const l of lines) console.log(`  ${l}`);
  }
}
