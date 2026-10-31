import { Level, Tile } from './types';

/**
 * Text level format, one character per cell:
 *   .  empty        #  floor        f  fragile      G  goal
 *   S  start        o  soft switch  x  heavy switch 0-9  bridge (group = digit)
 * Switches target group 0 unless `switchGroups` lists groups in reading order.
 */
export function parseLevel(rows: string[], switchGroups: number[] = [], bridgesOn = 0): Level {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const tiles: Tile[] = [];
  const groups: number[] = [];
  let start = { x: -1, y: -1 };
  let switchIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = rows[y][x] ?? '.';
      let tile = Tile.Empty;
      let group = -1;
      if (c === '#') tile = Tile.Floor;
      else if (c === 'f') tile = Tile.Fragile;
      else if (c === 'G') tile = Tile.Goal;
      else if (c === 'S') {
        tile = Tile.Floor;
        start = { x, y };
      } else if (c === 'o' || c === 'x') {
        tile = c === 'o' ? Tile.SoftSwitch : Tile.HeavySwitch;
        group = switchGroups[switchIndex++] ?? 0;
      } else if (c >= '0' && c <= '9') {
        tile = Tile.Bridge;
        group = Number(c);
      } else if (c !== '.') {
        throw new Error(`Unknown level character '${c}' at ${x},${y}`);
      }
      tiles.push(tile);
      groups.push(group);
    }
  }
  if (start.x < 0) throw new Error('Level has no start (S)');
  return { width, height, tiles, groups, start, bridgesOn };
}

const CHARS: Record<Tile, string> = {
  [Tile.Empty]: '.',
  [Tile.Floor]: '#',
  [Tile.Fragile]: 'f',
  [Tile.Goal]: 'G',
  [Tile.SoftSwitch]: 'o',
  [Tile.HeavySwitch]: 'x',
  [Tile.Bridge]: '?',
};

export function formatLevel(level: Level): string {
  const rows: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let row = '';
    for (let x = 0; x < level.width; x++) {
      const i = y * level.width + x;
      const t = level.tiles[i];
      if (x === level.start.x && y === level.start.y) row += 'S';
      else if (t === Tile.Bridge) row += String(level.groups[i]);
      else row += CHARS[t];
    }
    rows.push(row);
  }
  return rows.join('\n');
}
