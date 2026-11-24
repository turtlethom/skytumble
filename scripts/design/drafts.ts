// Load drafts for the check tools: a design file (templates allowed: `?` reads as floor, `%` as ice),
// a level id (`frost-11`) or an id prefix (`frost-`).
import { existsSync, readFileSync } from 'node:fs';
import { Draft, openTemplate } from './checks';
import { loadDesigns, parseBlock } from './lib';
import { Tile } from '../../src/game/types';
import { lampOf } from '../../src/game/ascii';

export async function loadDrafts(arg: string): Promise<(Draft & { name: string })[]> {
  if (existsSync(arg)) {
    return readFileSync(arg, 'utf8')
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b && !b.startsWith('The template'))
      .map((b, i) => {
        const lines = b.split('\n');
        const { rows, switches, on, shape, paint, gates, lamps } = parseBlock(lines);
        return { name: lines.find((l) => l.startsWith('@'))?.slice(1) ?? `#${i + 1}`, rows: openTemplate(rows), switches, on, shape, ...(paint ? { paint } : {}), ...(gates ? { gates } : {}), ...(lamps ? { lamps } : {}) };
      });
  }
  return (await loadDesigns(arg)).map((d) => ({
    name: d.name,
    rows: d.rows,
    switches: d.switches,
    on: d.on,
    shape: d.level.startShape ?? 2,
    ...(d.level.startPaint ? { paint: d.level.startPaint } : {}),
    gates: d.level.tiles.flatMap((t, i) => (t === Tile.Gate ? [d.level.groups[i]] : [])),
    lamps: [d.level, ...(d.level.ceiling ? [d.level.ceiling] : [])].flatMap((l) => l.tiles.flatMap((t, i) => (t === Tile.Lamp ? [lampOf(l.groups[i])] : []))),
  }));
}
