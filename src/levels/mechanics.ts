// How To Play's entries: one per mechanic, each with a description and a little scene the block plays
// through on the real rules, over and over. Not levels anyone plays, so they aren't in a chapter file.
// Moves are written out, not solved, so a scene can show every way a mechanic behaves in one loop, mistakes
// included: standing and lying, pressed and pressed again. `[Z]` in a text is drawn as a key.
import { parseLamps, parseLevel } from '../game/ascii';
import { Level, Move, PAINT_NAMES, Tile } from '../game/types';

export type MechanicId =
  | 'rolling' | 'lying' | 'planks' | 'soft' | 'heavy' | 'walls'
  | 'ice' | 'belts' | 'iceWalls' | 'pads' | 'padWalls' | 'flips' | 'lockedRings' | 'shapeWalls' | 'cube' | 'tall' | 'extraHeavy' | 'hedges'
  | 'tubes' | 'split' | 'paint' | 'mixing' | 'padPaint' | 'hold' | 'lights';

export interface Mechanic {
  id: MechanicId;
  name: string;
  text: string;
  /** Always shown; the others open once a level using them has been reached. */
  basic: boolean;
  level: Level;
  /** Rolls, and `swap` (Tab) between split cubes. */
  moves: Move[];
}

const DIR: Record<string, Move> = { U: 'up', D: 'down', L: 'left', R: 'right', T: 'swap' };
/** Moves as letters: `UDLR` roll, `T` swaps cubes (Tab). */
const moves = (letters: string) => [...letters].map((c) => DIR[c]);
const gates = (...names: string[]) => names.map((n) => PAINT_NAMES.indexOf(n as (typeof PAINT_NAMES)[number]));

export const MECHANICS: Mechanic[] = [
  {
    id: 'rolling',
    name: 'Rolling and the goal',
    text: 'Roll with the arrow keys or [W] [A] [S] [D], and turn the view with [Q] and [E]. Stand the block on the goal to finish: lying across it is safe, but doesn\'t count. If any part of the block hangs over empty space, it falls. [Z] takes a move back.',
    basic: true,
    level: parseLevel(['S###', '...#', '...#', '...G']),
    moves: moves('RRDD'),
  },
  {
    id: 'lying',
    name: 'Standing and lying',
    text: 'Standing, the block covers one tile. Lying, it covers two. Rolled along its length, a lying block stands back up. Rolled sideways, it shifts one tile and stays lying, which is how you line up with a narrow path.',
    basic: true,
    level: parseLevel(['S##', '###', '###', '..G']),
    moves: moves('DRRD'),
  },
  {
    id: 'planks',
    name: 'Old planks',
    text: 'Planks break under a standing block, and it falls. They hold a block lying down, so cross them lying.',
    basic: true,
    level: parseLevel(['S....', '#fff#', '#fff#', '....G']),
    moves: moves('DRRRRD'),
  },
  {
    id: 'soft',
    name: 'Soft switches and bridges',
    text: 'A round switch answers any touch, even half a lying block. Every touch raises or lowers the bridges of its color, so a second touch undoes the first.',
    basic: true,
    // Up, down, up again, then across.
    level: parseLevel(['S#o00#G']),
    moves: moves('RLRLRRRR'),
  },
  {
    id: 'heavy',
    name: 'Heavy switches',
    text: 'An X switch only answers a block standing on it, and lying across it does nothing. Every press raises or lowers the bridges of its color.',
    basic: true,
    level: parseLevel(['####.....', '####.....', 'S#x#00##G']),
    moves: moves('RLURRDRRRR'),
  },
  {
    id: 'walls',
    name: 'Stone walls',
    text: 'A raised wall stops any roll that would land on it, even two tiles ahead, and that isn\'t a move. The thin colored line around it names its switch: every press of that color raises or lowers its walls and bridges together. A lowered wall is floor, and one that comes up under the block waits until the block moves off.',
    basic: true,
    // A bump from two tiles away, then one press: the wall in the way sinks, another rises, and the bridge comes out.
    level: parseLevel(['.h........', 'S#H####00G', '#.........', 'o.........']),
    moves: moves('RDURRRRRR'),
  },
  {
    id: 'ice',
    name: 'Ice',
    text: 'A lying block fully on ice slides, until part of it leaves the ice. A standing block grips and stays put.',
    basic: false,
    // Standing on the first ice tile it grips; lying on the next two it slides.
    level: parseLevel(['S##~~~~#G']),
    moves: moves('RRRR'),
  },
  {
    id: 'belts',
    name: 'Belts',
    text: 'After each move, a block fully on belts is pushed one tile along the arrow. A block only partly on belts stays where it is, and so does one lying on two belts that disagree.',
    basic: false,
    // Pushed standing, pushed lying across two belts, then not pushed lying half on one.
    level: parseLevel(['S##>#..', '....>#>', '....>##', '......G']),
    moves: moves('RRDRD'),
  },
  {
    id: 'iceWalls',
    name: 'Walls on ice and belts',
    text: 'A slide stops on the tile before a raised wall. A lowered wall is floor, so a slide stops half on it. A belt can\'t push you into a raised wall, so you stay put on it until the wall goes down and you land on the belt again.',
    basic: false,
    // Held on the belt by the raised wall. One press lowers that wall and raises the one at the end of
    // the ice. Back on the belt, it carries you onto the lowered wall, and the slide brakes before the other.
    level: parseLevel(['S##>H~~~~~h', '...o....##G', '...#.......']),
    moves: moves('RRDURDR'),
  },
  {
    id: 'pads',
    name: 'Launch pads',
    text: 'Stand on a pad and it flings you far along its arrow, landing lying. Lie fully on two pads for a short hop. Lying half on one is safe. Marks on the floor show where a flight can land, and a landing over nothing is a fall.',
    basic: false,
    // Standing on one pad: the long fling. Lying on two: the short hop, right onto the goal.
    level: parseLevel(['S##R...###', '.........D', '.........D', '..........', '.........G']),
    moves: moves('RRRD'),
  },
  {
    id: 'padWalls',
    name: 'Walls and launch pads',
    text: 'Flights pass over walls: only the landing matters. A raised wall where a fling or a hop along two pads would land stops it short, and you stand up on the tile before the wall, falling if that tile is empty. A sideways hop that lands on a raised wall hits it and falls. A lowered wall is floor, so you land on it.',
    basic: false,
    // The fling stops short, standing on the tile before the raised wall. Back round past the switch,
    // which lowers it, and the same fling flies the full way, lying on the lowered wall, next to the goal.
    level: parseLevel(['S##R..#H#G', '...####...', '...##o#...']),
    moves: moves('RRDLLLUR'),
  },
  {
    id: 'flips',
    name: 'Flip rings',
    text: 'Stand on a ring, or lie fully on two, and the block flips to the other floor, directly above or below, in the same pose. With nothing on the other side, it falls into the sky. Hold [Space] to look at the other floor.',
    basic: false,
    // Up standing on one ring, back down lying on two.
    level: parseLevel(['S##+##G', '---', '...#++']),
    moves: moves('RRRR'),
  },
  {
    id: 'lockedRings',
    name: 'Locked rings',
    text: 'A ring with a thin line of a switch\'s color around it can be locked: dull, with a padlock, it won\'t flip you, and you rest on it like floor. Every press of its color opens or locks it, along with that color\'s walls and bridges. A wall never stands over or under a ring.',
    basic: false,
    // Onto the locked ring: the padlock pops and nothing happens. One press opens it, and back on it, up you go.
    level: parseLevel(['S##M#o', '---', '...###G'], [0]),
    moves: moves('RRRLRR'),
  },
  {
    id: 'shapeWalls',
    name: 'Walls and shapes',
    text: 'A raised wall stops a roll that would land any part of the block on it, so each shape is stopped from its own distance: a tall block from three tiles away, the normal block from two, a cube only from right beside it. A lying tall block can hang its middle over a gap, but not over a raised wall.',
    basic: false,
    // The normal block becomes a cube, which rolls onto the switch right beside the wall (the normal block
    // would bump two tiles short); the wall sinks and the cube rolls through to its goal.
    level: parseLevel(['S##coHC'], [0]),
    moves: moves('RRRRR'),
  },
  {
    id: 'cube',
    name: 'The cube',
    text: 'Stand on a cube switch to become a cube, which rolls one tile at a time. It\'s so light that it never breaks planks or presses heavy switches. Some goals are marked for a cube, and a normal switch turns you back.',
    basic: false,
    level: parseLevel(['S##cff#C']),
    moves: moves('RRRRRR'),
  },
  {
    id: 'tall',
    name: 'The tall block',
    text: 'Stand on a tall switch to grow. A tall block tips three tiles at a time, and lying down it rests on its two ends, so it can span a one-tile gap. Some goals are marked for a tall block.',
    basic: false,
    level: parseLevel(['S##t#.#T']),
    moves: moves('RRRR'),
  },
  {
    id: 'extraHeavy',
    name: 'Extra-heavy switches',
    text: 'A star switch only answers a tall block standing on it. Every press raises or lowers the bridges of its color.',
    basic: false,
    level: parseLevel(['S###X00#T'], [], 0, 3),
    moves: moves('RRRR'),
  },
  {
    id: 'hedges',
    name: 'Toppling hedges',
    text: 'A standing block rolling into a hedge topples it the way it rolled, even from two tiles away, and stays put. It lands on the next tile, and an empty tile becomes floor for good, so choose the side you knock it from. Landing on solid ground, it\'s wasted: [Z] takes it back. A lying block just bumps it, and a hedge can\'t fall onto a raised wall or another hedge still up.',
    basic: false,
    // Lying, it holds. Then upright, from two tiles away, it topples into the gap and the block walks over it.
    level: parseLevel(['##......', '##......', 'S##&.##G', '........']),
    moves: moves('RRLURDRRRRR'),
  },
  {
    id: 'tubes',
    name: 'Glass tubes',
    text: 'A cube that rolls into an open end of a glass tube slides straight through, like ice, and stops on the first tile past the far end (off the end into nothing, it falls). Anything bigger bumps the glass, except a lying block that belts feed in along the tube: it shoots out past the far end. A row of tubes needs no ground, so it can cross a gap.',
    basic: false,
    // The cube rolls in, slides through and stops just past the far end, beside its goal.
    level: parseLevel(['S#===#C'], [], 0, 1),
    moves: moves('RRR'),
  },
  {
    id: 'split',
    name: 'Splitting',
    text: 'Stand on a splitter and the block splits in two cubes: one stays, the other pops out on the marked side and moves first. [Tab] swaps which cube you move, and never counts as a move. The cube you aren\'t moving stays put like a wall: it stops slides, flights and belt pushes, and holds a wall down under it. Roll one cube into the other to join them; only the whole block can stand on the goal, and only it presses heavy switches.',
    basic: false,
    // Split, move the new cube on, swap, and roll the other into it to join; then stand up on the goal.
    level: parseLevel(['S##]##G']),
    moves: moves('RRRTRRR'),
  },
  {
    id: 'paint',
    name: 'Paint and gates',
    text: 'A tray coats whatever part of the block rests on it: a cube all over, the half of a lying block over it, a standing block\'s bottom half. Each half keeps its color as you roll. A gate lets through only a part of exactly its color, and a standing block needs both halves in it; otherwise it holds like a raised wall. The shapes cut in a gate name its color: circle red, square blue, triangle yellow.',
    basic: false,
    // Lying across both trays, the block comes up red on the west, blue on the east, and rolls through the pair of gates.
    level: parseLevel(['Sru.', '.{{.', '.##G'], [], 0, 2, gates('red', 'blue')),
    moves: moves('RDDR'),
  },
  {
    id: 'mixing',
    name: 'Mixing and water',
    text: 'A second color mixes with the first: red and blue make purple, red and yellow orange, blue and yellow green. Any coat on a mix makes mud, which no gate takes. Water washes the part resting on it bare, so you can start again.',
    basic: false,
    // Red, then yellow: orange, through the orange gate. Washed bare, then blue, through the blue gate.
    level: parseLevel(['Sry{su{C'], [], 0, 1, gates('orange', 'blue')),
    moves: moves('RRRRRRR'),
  },
  {
    id: 'padPaint',
    name: 'Flights and paint',
    text: 'A cube on a launch pad flies like a standing block, four tiles out. A landing coats or washes like any other stop. The idle cube, or a gate holding the landing part\'s color, stops a flight short like a raised wall. And a flight tips the block over at the end, so it turns the colors round like one roll.',
    basic: false,
    // Onto the red tray by air; the next flight stops short of the purple gate. Blue below makes purple, and through.
    level: parseLevel(['SR...rR..#{#C', '.........u...'], [], 0, 1, gates('purple')),
    moves: moves('RRDURRR'),
  },
  {
    id: 'hold',
    name: 'Held switches',
    text: 'A square switch works only while something rests on it: a cube, half a lying block, or the cube you aren\'t moving. Its walls stay switched while it\'s held, and switch back the moment it\'s let go. A wall that comes up under a cube waits until the cube moves off, so park a cube on the wall before the holder leaves.',
    basic: false,
    // The new cube pops onto the held switch, which keeps the wall down; the other cube rolls onto the wall, and the holder joins it there. Letting go raises the wall behind.
    // Laid out north to south, so the wall never hides the switch from the camera.
    level: parseLevel(['....G', '...#H', 'S##]O']),
    moves: moves('RRTURTUU'),
  },
  {
    id: 'lights',
    name: 'Dark tiles and lights',
    text: 'Dark tiles are solid, but you can\'t see them, except the one you\'re standing on. A round light switch lights its color\'s dark tiles for the number of moves on it; a square one only while something rests on it. Look as long as you like: only moves count. Fall in the dark and you go back to when the light went out. [H] shows the dark tiles too.',
    basic: false,
    // The light comes on for two moves; the rest of the path is crossed from memory.
    level: parseLevel(['S##*,,,,,G'], [], 0, 2, [], parseLamps('2')),
    moves: moves('RRRRRR'),
  },
];

/** The mechanics a player meets in this level, among those that have to be unlocked. */
export function mechanicsIn(level: Level): MechanicId[] {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  const groups = [...level.groups, ...(level.ceiling?.groups ?? [])];
  const found = new Set<MechanicId>();
  if (level.startShape && tiles.some((t) => t === Tile.WallUp || t === Tile.WallDown)) found.add('shapeWalls');
  if (level.startShape === 1) found.add('cube');
  if (level.startShape === 3) found.add('tall');
  const walls = tiles.some((t) => t === Tile.WallUp || t === Tile.WallDown);
  tiles.forEach((t, i) => {
    if (walls && (t === Tile.Ice || t === Tile.Conveyor)) found.add('iceWalls');
    if (walls && t === Tile.Pad) found.add('padWalls');
    if (walls && (t === Tile.ShapeSwitch || t === Tile.ExtraHeavy)) found.add('shapeWalls');
    if (t === Tile.Ice) found.add('ice');
    else if (t === Tile.Conveyor) found.add('belts');
    else if (t === Tile.Pad) found.add('pads');
    else if (t === Tile.Flip || t === Tile.FlipLocked) {
      found.add('flips');
      if (groups[i] >= 0) found.add('lockedRings');
    }
    else if (t === Tile.ExtraHeavy) found.add('extraHeavy');
    else if (t === Tile.Hedge) found.add('hedges');
    else if (t === Tile.ShapeSwitch && groups[i] === 1) found.add('cube');
    else if (t === Tile.ShapeSwitch && groups[i] === 3) found.add('tall');
  });
  // Splatter Studio, and Toybox's tubes.
  if (tiles.includes(Tile.Door)) found.add('tubes');
  if (tiles.includes(Tile.Splitter)) found.add('split');
  const trays = new Set(tiles.flatMap((t, i) => (t === Tile.Tray ? [groups[i]] : [])));
  const paints = trays.size > 0 || tiles.includes(Tile.Gate) || tiles.includes(Tile.Wash) || !!level.startPaint;
  if (paints) found.add('paint');
  // Two colors of tray (or water, which only matters once coats can pile up) is where mixing starts.
  if (trays.size > 1 || tiles.includes(Tile.Wash)) found.add('mixing');
  if (tiles.includes(Tile.Pad) && (paints || tiles.includes(Tile.Splitter))) found.add('padPaint');
  // The Chasm.
  if (tiles.includes(Tile.HoldSwitch)) found.add('hold');
  if (tiles.includes(Tile.Dark) || tiles.includes(Tile.Lamp)) found.add('lights');
  return [...found];
}
