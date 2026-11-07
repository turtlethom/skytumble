// Load drafts for the check tools: a design file (templates allowed: `?` reads as floor, `%` as ice),
// a level id (`frost-11`) or an id prefix (`frost-`).
import { existsSync, readFileSync } from 'node:fs';
import { Draft, openTemplate } from './checks';
import { loadDesigns, parseBlock } from './lib';

export async function loadDrafts(arg: string): Promise<(Draft & { name: string })[]> {
  if (existsSync(arg)) {
    return readFileSync(arg, 'utf8')
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b && !b.startsWith('The template'))
      .map((b, i) => {
        const lines = b.split('\n');
        const { rows, switches, on, shape } = parseBlock(lines);
        return { name: lines.find((l) => l.startsWith('@'))?.slice(1) ?? `#${i + 1}`, rows: openTemplate(rows), switches, on, shape };
      });
  }
  return (await loadDesigns(arg)).map((d) => ({ name: d.name, rows: d.rows, switches: d.switches, on: d.on, shape: d.level.startShape ?? 2 }));
}
