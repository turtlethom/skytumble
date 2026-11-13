// Print each handmade level's optimal solution as the arrow keys to press, for playtesting and reference:
//   npm run -s directions -- wind-13        (a level id or an id prefix; nothing for every level)
//   npm run -s directions -- --write        (rewrite SOLUTIONS.md with every handmade level)
// Arrows are the keys at the starting view: the camera always starts at the same angle, where ↑ rolls
// north (toward the top of the board). Turning the view with Q/E changes which key rolls which way.
// Moves come in numbered groups of five; after a move, ✈ marks a flight, ● a switch press, ⇄ a flip
// to the other floor, and ✔ the win.
import { writeFileSync } from 'node:fs';
import { HANDMADE } from '../../src/levels';
import { directions, solutionsMarkdown } from './arrows';

const arg = process.argv[2] ?? '';
if (arg === '--write') {
  writeFileSync('SOLUTIONS.md', solutionsMarkdown());
  console.log('wrote SOLUTIONS.md');
} else {
  for (const h of HANDMADE.filter((l) => l.id.startsWith(arg))) {
    console.log(`${h.id}  ${h.name}  (par ${h.par ?? '?'})`);
    for (const line of directions(h.level)) console.log(`  ${line}`);
    console.log();
  }
}
