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
 *   c t n  shape switch: turns a block standing on it into a cube / tall block / normal block
 *   X  extra-heavy switch (only a standing tall block presses it)
 *   C T  goal marked for a cube / a tall block (G takes the normal block)
 * A line of dashes (`---`) ends the ground and starts the ceiling layer: the same grid seen from
 * above, cell for cell directly over the ground (not mirrored). The start is on the ground.
 * Switches target group 0 unless `switchGroups` lists groups in reading order (ground, then ceiling).
 */
export function parseLevel(rows: string[], switchGroups: number[] = [], bridgesOn = 0, startShape = 2): Level {
  const split = rows.findIndex((r) => /^-{3,}\s*$/.test(r));
  const groundRows = split < 0 ? rows : rows.slice(0, split);
  const ceilingRows = split < 0 ? null : rows.slice(split + 1);
  // The level is as tall as its taller layer; missing rows are empty.
  const height = Math.max(groundRows.length, ceilingRows?.length ?? 0);
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
        else if (c === 'C' || c === 'T') {
          tile = Tile.Goal;
          group = SHAPE_GOALS[c];
        } else if (c in SHAPE_SWITCHES) {
          tile = Tile.ShapeSwitch;
          group = SHAPE_SWITCHES[c];
        }
        else if (c === '+') tile = Tile.Flip;
        else if (c === 'S') {
          if (!ground) throw new Error(`The start must be on the ground, not the ceiling (${x},${y})`);
          tile = Tile.Floor;
          start = { x, y };
        } else if (c === 'o' || c === 'x' || c === 'X') {
          tile = c === 'o' ? Tile.SoftSwitch : c === 'x' ? Tile.HeavySwitch : Tile.ExtraHeavy;
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
  if (startShape !== 1 && startShape !== 2 && startShape !== 3) throw new Error(`Unknown start shape ${startShape}`);
  return {
    width,
    height,
    tiles,
    groups,
    start,
    bridgesOn,
    ...(ceiling ? { ceiling } : {}),
    ...(startShape !== 2 ? { startShape: startShape as 1 | 3 } : {}),
  };
}

/** Shape switch characters by the block length they set, and marked goals by the length they take. */
const SHAPE_SWITCHES: Record<string, number> = { c: 1, n: 2, t: 3 };
const SHAPE_GOALS: Record<string, number> = { C: 1, T: 3 };

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
  [Tile.ShapeSwitch]: '?',
  [Tile.ExtraHeavy]: 'X',
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
        else if (t === Tile.ShapeSwitch) row += Object.keys(SHAPE_SWITCHES).find((k) => SHAPE_SWITCHES[k] === l.groups[i]);
        else if (t === Tile.Goal && l.groups[i] > 0) row += Object.keys(SHAPE_GOALS).find((k) => SHAPE_GOALS[k] === l.groups[i]);
        else row += CHARS[t];
      }
      rows.push(row);
    }
  });
  return rows.join('\n');
}
