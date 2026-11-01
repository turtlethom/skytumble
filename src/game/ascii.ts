import { DIRS, Dir, Level, Tile } from './types';

const CONVEYOR_CHARS: Record<Dir, string> = { up: '^', down: 'v', left: '<', right: '>' };
const PAD_CHARS: Record<Dir, string> = { up: 'U', down: 'D', left: 'L', right: 'R' };

/**
 * Text level format, one character per cell:
 *   .  empty        #  floor        f  fragile      G  goal
 *   S  start        o  soft switch  x  heavy switch 0-9  bridge (group = digit)
 *   ~  ice          ^ v < >  conveyor pointing that way
 *   U D L R  launch pad flinging up / down / left / right
 *   +  flip tile (gravity)
 * A line of dashes (`---`) ends the ground and starts the ceiling layer: the same grid seen from
 * above, cell for cell directly over the ground (not mirrored). The start is on the ground.
 * Switches target group 0 unless `switchGroups` lists groups in reading order (ground, then ceiling).
 */
export function parseLevel(rows: string[], switchGroups: number[] = [], bridgesOn = 0): Level {
  const split = rows.findIndex((r) => /^-{3,}\s*$/.test(r));
  const groundRows = split < 0 ? rows : rows.slice(0, split);
  const ceilingRows = split < 0 ? null : rows.slice(split + 1);
  if (ceilingRows && ceilingRows.length > groundRows.length) throw new Error('The ceiling has more rows than the ground');
  const height = groundRows.length;
  const width = Math.max(...[...groundRows, ...(ceilingRows ?? [])].map((r) => r.length));
  let start = { x: -1, y: -1 };
  let switchIndex = 0;

  const grid = (lines: string[], ground: boolean) => {
    const tiles: Tile[] = [];
    const groups: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = lines[y]?.[x] ?? '.';
        let tile = Tile.Empty;
        let group = -1;
        if (c === '#') tile = Tile.Floor;
        else if (c === 'f') tile = Tile.Fragile;
        else if (c === 'G') tile = Tile.Goal;
        else if (c === '+') tile = Tile.Flip;
        else if (c === 'S') {
          if (!ground) throw new Error(`The start must be on the ground, not the ceiling (${x},${y})`);
          tile = Tile.Floor;
          start = { x, y };
        } else if (c === 'o' || c === 'x') {
          tile = c === 'o' ? Tile.SoftSwitch : Tile.HeavySwitch;
          group = switchGroups[switchIndex++] ?? 0;
        } else if (c === '~') {
          tile = Tile.Ice;
        } else if ('^v<>'.includes(c)) {
          tile = Tile.Conveyor;
          group = DIRS.findIndex((d) => CONVEYOR_CHARS[d] === c);
        } else if ('UDLR'.includes(c)) {
          tile = Tile.Pad;
          group = DIRS.findIndex((d) => PAD_CHARS[d] === c);
        } else if (c >= '0' && c <= '9') {
          tile = Tile.Bridge;
          group = Number(c);
        } else if (c !== '.') {
          throw new Error(`Unknown level character '${c}' at ${x},${y}${ground ? '' : ' on the ceiling'}`);
        }
        tiles.push(tile);
        groups.push(group);
      }
    }
    return { tiles, groups };
  };

  const { tiles, groups } = grid(groundRows, true);
  const ceiling = ceilingRows ? grid(ceilingRows, false) : undefined;
  if (start.x < 0) throw new Error('Level has no start (S)');
  return { width, height, tiles, groups, start, bridgesOn, ...(ceiling ? { ceiling } : {}) };
}

const CHARS: Record<Tile, string> = {
  [Tile.Empty]: '.',
  [Tile.Floor]: '#',
  [Tile.Fragile]: 'f',
  [Tile.Goal]: 'G',
  [Tile.SoftSwitch]: 'o',
  [Tile.HeavySwitch]: 'x',
  [Tile.Bridge]: '?',
  [Tile.Ice]: '~',
  [Tile.Conveyor]: '?',
  [Tile.Pad]: '?',
  [Tile.Flip]: '+',
};

export function formatLevel(level: Level): string {
  const rows: string[] = [];
  const layers = level.ceiling ? [level, { ...level, ...level.ceiling }] : [level];
  layers.forEach((l, layer) => {
    if (layer === 1) rows.push('---');
    for (let y = 0; y < level.height; y++) {
      let row = '';
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        const t = l.tiles[i];
        if (layer === 0 && x === level.start.x && y === level.start.y) row += 'S';
        else if (t === Tile.Bridge) row += String(l.groups[i]);
        else if (t === Tile.Conveyor) row += CONVEYOR_CHARS[DIRS[l.groups[i]]];
        else if (t === Tile.Pad) row += PAD_CHARS[DIRS[l.groups[i]]];
        else row += CHARS[t];
      }
      rows.push(row);
    }
  });
  return rows.join('\n');
}
