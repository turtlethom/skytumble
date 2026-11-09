// Does each switch-wall color have to move? Fixes every wall of a color down for good, then up for good,
// and re-solves: a color earns its place only if both change the par.
//   npm run -s walls -- <file|id|prefix>...      PLAIN=1 also turns walls it doesn't need into floor
import { block, parOf, plainWalls, toLevel, wallColors, wallsText } from './checks';
import { loadDrafts } from './drafts';

for (const arg of process.argv.slice(2)) {
  for (const d of await loadDrafts(arg)) {
    const level = toLevel(d);
    const colors = wallColors(level);
    console.log(`@${d.name}  par ${parOf(level) ?? 'X'}  ${colors.length ? wallsText(colors) : 'nothing switched'}`);
    // PLAIN=1: also print the level with the walls it doesn't need turned into floor.
    if (process.env.PLAIN === '1') {
      const plain = plainWalls(d);
      const removed = d.rows.join('').split('').filter((c, i) => 'HIJhij'.includes(c) && plain.rows.join('')[i] === '#').length;
      console.log(removed ? `${block(`${d.name} with ${removed} wall(s) as floor`, plain)}\n` : '  every wall is needed');
    }
  }
}
