import { DIRS, Dir, Level, Tile } from './types';


const CONVEYOR_CHARS: Record<Dir, string> = { up: '^', down: 'v', left: '<', right: '>' };
const PAD_CHARS: Record<Dir, string> = { up: 'U', down: 'D', left: 'L', right: 'R' };
/** Splitters by the side the second cube appears on. */
const SPLITTER_CHARS: Record<Dir, string> = { up: 'A', down: 'V', left: '[', right: ']' };
/** Paint trays by color: red, blue, yellow (index + 1). Every gate is `{`, colored by `gateColors`. */
const TRAY_CHARS = 'ruy';
/** One character per switch color, groups 0-3: a wall starting up, a wall starting down, a reversed bridge. */
const WALLS_UP = 'HIJK';
const WALLS_DOWN = 'hijk';
const BRIDGES_REVERSED = 'abde';
/** Flip rings in a switch color, groups 0-3: starting locked, starting open. */
const RINGS_LOCKED = 'MPQW';
const RINGS_OPEN = 'mpqw';
/** Dark floor by light color 0-3. */
const DARK_CHARS = ",;'\"";
/** Each hedge takes three bits in `State.hedges`, and the solver's key has to stay a safe whole number. */
const MAX_HEDGES = 9;

/**
 * Text level format, one character per cell:
 *   .  empty        #  floor        f  fragile      G  goal
 *   S  start        o  soft switch  x  heavy switch 0-9  bridge (group = digit)
 *   ~  ice          ^ v < >  conveyor pointing that way
 *   U D L R  launch pad flinging up / down / left / right
 *   +  flip tile (gravity)
 *   = |  glass tube running east-west / north-south: only the cube rides it, in and out of its ends
 *   M P Q W  flip tile in the color of group 0 / 1 / 2 / 3, starting locked (a press opens it)
 *   m p q w  the same, starting open (a press locks it)
 *   c t n  shape switch: turns a block standing on it into a cube / tall block / normal block
 *   X  extra-heavy switch (only a standing tall block presses it)
 *   C T  goal marked for a cube / a tall block (G takes the normal block)
 *   H I J K  wall starting raised, in the color of group 0 / 1 / 2 / 3
 *   h i j k  the same, starting lowered
 *   a b d e  bridge in group 0 / 1 / 2 / 3 that is out when a digit bridge of its group is in
 *   &  toppling hedge
 *   r u y  paint tray, red / blue / yellow: coats the part of the block resting on it (coats mix)
 *   {  gate: only a part in its color passes onto it (colors from `gateColors`, in reading order)
 *   s  wash: strips the paint from the part of the block resting on it
 *   [ ] A V  splitter: a normal block standing on it splits into two cubes, the second to the
 *            west / east / north / south
 *   O  held switch: its group's walls, bridges and rings stay switched while anything rests on it
 *   , ; ' "  dark floor in light color 0 / 1 / 2 / 3: unseen until lit, floor to the rules
 *   *  light switch: color and timer from `lamps` in reading order (`6` lights color 0 for six
 *      moves after a press, `held/1` lights color 1 while anything rests on it)
 * A line of dashes (`---`) ends the ground and starts the ceiling layer: the same grid seen from
 * above, cell for cell directly over the ground (not mirrored). The start is on the ground.
 * Switches target group 0 unless `switchGroups` lists groups in reading order (ground, then ceiling).
 */
export function parseLevel(rows: string[], switchGroups: number[] = [], bridgesOn = 0, startShape = 2, gateColors: number[] = [], lamps: Lamp[] = []): Level {
  const split = rows.findIndex((r) => /^-{3,}\s*$/.test(r));
  const groundRows = split < 0 ? rows : rows.slice(0, split);
  const ceilingRows = split < 0 ? null : rows.slice(split + 1);
  // The level is as tall as its taller layer; missing rows are empty.
  const height = Math.max(groundRows.length, ceilingRows?.length ?? 0);
  const width = Math.max(...[...groundRows, ...(ceilingRows ?? [])].map((r) => r.length));
  let start = { x: -1, y: -1 };
  let switchIndex = 0;
  let gateIndex = 0;
  let lampIndex = 0;
  const hedgeCells: { x: number; y: number }[] = [];

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
        else if (c === '=' || c === '|') {
          tile = Tile.Door;
          group = c === '=' ? 0 : 1;
        }
        else if (c === 'S') {
          if (!ground) throw new Error(`The start must be on the ground, not the ceiling (${x},${y})`);
          tile = Tile.Floor;
          start = { x, y };
        } else if (c === 'o' || c === 'x' || c === 'X' || c === 'O') {
          tile = c === 'o' ? Tile.SoftSwitch : c === 'x' ? Tile.HeavySwitch : c === 'O' ? Tile.HoldSwitch : Tile.ExtraHeavy;
          group = switchGroups[switchIndex++] ?? 0;
        } else if (c === '~') {
          tile = Tile.Ice;
        } else if ('^v<>'.includes(c)) {
          tile = Tile.Conveyor;
          group = DIRS.findIndex((d) => CONVEYOR_CHARS[d] === c);
        } else if (TRAY_CHARS.includes(c)) {
          tile = Tile.Tray;
          group = TRAY_CHARS.indexOf(c) + 1;
        } else if (c === '{') {
          tile = Tile.Gate;
          group = gateColors[gateIndex++] ?? 1;
        } else if (c === 's') {
          tile = Tile.Wash;
        } else if (DARK_CHARS.includes(c)) {
          tile = Tile.Dark;
          group = DARK_CHARS.indexOf(c);
        } else if (c === '*') {
          tile = Tile.Lamp;
          const lamp = lamps[lampIndex++] ?? { color: 0, timer: 6 };
          group = lamp.color + 4 * lamp.timer;
        } else if ('[]AV'.includes(c)) {
          tile = Tile.Splitter;
          group = DIRS.findIndex((d) => SPLITTER_CHARS[d] === c);
        } else if ('UDLR'.includes(c)) {
          tile = Tile.Pad;
          group = DIRS.findIndex((d) => PAD_CHARS[d] === c);
        } else if (c >= '0' && c <= '9') {
          tile = Tile.Bridge;
          group = Number(c);
        } else if (WALLS_UP.includes(c) || WALLS_DOWN.includes(c)) {
          tile = WALLS_UP.includes(c) ? Tile.WallUp : Tile.WallDown;
          group = (WALLS_UP.includes(c) ? WALLS_UP : WALLS_DOWN).indexOf(c);
        } else if (RINGS_LOCKED.includes(c) || RINGS_OPEN.includes(c)) {
          tile = RINGS_LOCKED.includes(c) ? Tile.FlipLocked : Tile.Flip;
          group = (RINGS_LOCKED.includes(c) ? RINGS_LOCKED : RINGS_OPEN).indexOf(c);
        } else if (BRIDGES_REVERSED.includes(c)) {
          tile = Tile.BridgeReversed;
          group = BRIDGES_REVERSED.indexOf(c);
        } else if (c === '&') {
          if (hedgeCells.length === MAX_HEDGES) throw new Error(`More than ${MAX_HEDGES} hedges`);
          tile = Tile.Hedge;
          group = hedgeCells.length;
          hedgeCells.push({ x, y });
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
    ...(hedgeCells.length ? { hedgeCells } : {}),
    ...(startShape !== 2 ? { startShape: startShape as 1 | 3 } : {}),
  };
}

/** Shape switch characters by the block length they set, and marked goals by the length they take. */
const SHAPE_SWITCHES: Record<string, number> = { c: 1, n: 2, t: 3 };
const SHAPE_GOALS: Record<string, number> = { C: 1, T: 3 };

/** A light switch: its color (0-3) and timer (moves lit after a press; 0 = held). */
export interface Lamp {
  color: number;
  timer: number;
}

/** A light switch's color and timer from its group. */
export function lampOf(group: number): Lamp {
  return { color: group & 3, timer: group >> 2 };
}

/** `6`, `held`, `4/1`, `held/2`: a lamp's timer (or held) and color (default 0), as in a `lamps:` line. */
export function parseLamps(text: string): Lamp[] {
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const m = /^(held|\d+)(?:\/([0-3]))?$/.exec(w);
    if (!m || m[1] === '0') throw new Error(`expected a lamp like 6, held, 4/1 or held/2, got '${w}'`);
    return { color: Number(m[2] ?? 0), timer: m[1] === 'held' ? 0 : Number(m[1]) };
  });
}

/** The `lamps:` line for a level's lamps, in reading order (ground, then ceiling). */
export function formatLamps(level: Level): string {
  const groups = [level, ...(level.ceiling ? [level.ceiling] : [])].flatMap((l) => l.groups.filter((_, i) => l.tiles[i] === Tile.Lamp));
  return groups.map((g) => {
    const { color, timer } = lampOf(g);
    return `${timer ? timer : 'held'}${color ? `/${color}` : ''}`;
  }).join(' ');
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
  [Tile.ShapeSwitch]: '?',
  [Tile.ExtraHeavy]: 'X',
  [Tile.BridgeReversed]: '?',
  [Tile.WallUp]: '?',
  [Tile.WallDown]: '?',
  [Tile.Hedge]: '&',
  [Tile.FlipLocked]: '?',
  [Tile.Door]: '?',
  [Tile.Splitter]: '?',
  [Tile.Tray]: '?',
  [Tile.Gate]: '{',
  [Tile.Wash]: 's',
  [Tile.HoldSwitch]: 'O',
  [Tile.Dark]: '?',
  [Tile.Lamp]: '*',
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
        else if (t === Tile.BridgeReversed) row += BRIDGES_REVERSED[l.groups[i]];
        else if (t === Tile.WallUp) row += WALLS_UP[l.groups[i]];
        else if (t === Tile.WallDown) row += WALLS_DOWN[l.groups[i]];
        else if (t === Tile.FlipLocked) row += RINGS_LOCKED[l.groups[i]];
        else if (t === Tile.Door) row += l.groups[i] === 1 ? '|' : '=';
        else if (t === Tile.Flip && l.groups[i] >= 0) row += RINGS_OPEN[l.groups[i]];
        else if (t === Tile.Conveyor) row += CONVEYOR_CHARS[DIRS[l.groups[i]]];
        else if (t === Tile.Pad) row += PAD_CHARS[DIRS[l.groups[i]]];
        else if (t === Tile.Splitter) row += SPLITTER_CHARS[DIRS[l.groups[i]]];
        else if (t === Tile.Tray) row += TRAY_CHARS[l.groups[i] - 1];
        else if (t === Tile.Dark) row += DARK_CHARS[l.groups[i]];
        else if (t === Tile.ShapeSwitch) row += Object.keys(SHAPE_SWITCHES).find((k) => SHAPE_SWITCHES[k] === l.groups[i]);
        else if (t === Tile.Goal && l.groups[i] > 0) row += Object.keys(SHAPE_GOALS).find((k) => SHAPE_GOALS[k] === l.groups[i]);
        else row += CHARS[t];
      }
      rows.push(row);
    }
  });
  return rows.join('\n');
}
