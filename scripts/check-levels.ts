// Validates every handmade level and prints a table. Exits 1 if any level has errors.
//   npm run levels:check                 report only
//   npm run levels:check -- --fill-par   also write the solver's par into levels missing one
import { readFileSync, writeFileSync } from 'node:fs';
import { CHAPTERS } from '../src/levels';
import { validateChapters } from '../src/levels/validate';

const fillPar = process.argv.includes('--fill-par');
const reports = validateChapters(CHAPTERS);
let failed = 0;

for (const chapter of CHAPTERS) {
  const file = new URL(`../src/levels/${chapter.id}.txt`, import.meta.url);
  let text = readFileSync(file, 'utf8');
  console.log(`\n${chapter.title} (${chapter.id}.txt)${chapter.signature ? ` · signature: ${chapter.signature}` : ''}`);

  for (const h of chapter.levels) {
    const r = reports.get(h.id)!;
    if (fillPar && h.par === null && r.par !== null) {
      text = text.replace(new RegExp(`^(=== ${h.id}\\s*)$`, 'm'), `$1\npar: ${r.par}`);
      r.errors = r.errors.filter((e) => !e.startsWith('par missing'));
    }
    const ice = r.iceUses.length ? `  ice: ${r.iceUses.join(', ')}` : '';
    const belts = r.pushes ? `  pushes: ${r.pushes}` : '';
    const pads = r.padUses.length ? `  pads: ${r.padUses.join(', ')}` : '';
    const flips = r.flipUses.length ? `  flips: ${r.flipUses.join(', ')}` : '';
    const shapes = r.shapeUses.length ? `  shapes: ${r.shapeUses.join(', ')}` : '';
    const status = r.errors.length ? `✗ ${r.errors.join('; ')}` : '✓';
    console.log(`  ${h.id.padEnd(12)} par ${String(r.par ?? '–').padStart(3)}  states ${String(r.explored).padStart(5)}${ice}${belts}${pads}${flips}${shapes}  ${status}`);
    if (r.errors.length) failed++;
  }
  if (fillPar) writeFileSync(file, text);
}

console.log(failed ? `\n${failed} level(s) need attention.` : '\nAll levels OK.');
process.exit(failed ? 1 : 0);
