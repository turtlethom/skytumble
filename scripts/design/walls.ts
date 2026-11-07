// Does each switch-wall color have to move? Fixes every wall of a color down for good, then up for good,
// and re-solves: a color earns its place only if both change the par.
//   npm run -s walls -- <file|id|prefix>...
import { parOf, toLevel, wallColors, wallsText } from './checks';
import { loadDrafts } from './drafts';

for (const arg of process.argv.slice(2)) {
  for (const d of await loadDrafts(arg)) {
    const level = toLevel(d);
    const colors = wallColors(level);
    console.log(`@${d.name}  par ${parOf(level) ?? 'X'}  ${colors.length ? wallsText(colors) : 'no switch walls'}`);
  }
}
