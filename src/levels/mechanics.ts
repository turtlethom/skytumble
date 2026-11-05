// How To Play's entries: one per mechanic, each with a description and a little scene the block plays
// through on the real rules, over and over. Not levels anyone plays, so they aren't in a chapter file.
// Moves are written out, not solved, so a scene can show every way a mechanic behaves in one loop, mistakes
// included: standing and lying, pressed and pressed again. `[Z]` in a text is drawn as a key.
import { parseLevel } from '../game/ascii';
import { Dir, Level, Tile } from '../game/types';

export type MechanicId =
  | 'rolling' | 'lying' | 'planks' | 'soft' | 'heavy' | 'walls'
  | 'ice' | 'belts' | 'pads' | 'flips' | 'cube' | 'tall' | 'extraHeavy' | 'hedges';

export interface Mechanic {
  id: MechanicId;
  name: string;
  text: string;
  /** Always shown; the others open once a level using them has been reached. */
  basic: boolean;
  level: Level;
  moves: Dir[];
}

const DIR: Record<string, Dir> = { U: 'up', D: 'down', L: 'left', R: 'right' };
const moves = (letters: string) => [...letters].map((c) => DIR[c]);

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
    id: 'pads',
    name: 'Launch pads',
    text: 'Stand on a pad and it flings you far along its arrow, landing lying. Lie fully on two pads for a short hop. Lying half on one is safe. Marks on the floor show where a flight can land, and a landing over nothing is a fall.',
    basic: false,
    // Standing on one pad: the long fling. Lying on two: the short hop, right onto the goal.
    level: parseLevel(['S##R...###', '.........D', '.........D', '..........', '.........G']),
    moves: moves('RRRD'),
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
];

/** The mechanics a player meets in this level, among those that have to be unlocked. */
export function mechanicsIn(level: Level): MechanicId[] {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  const groups = [...level.groups, ...(level.ceiling?.groups ?? [])];
  const found = new Set<MechanicId>();
  if (level.startShape === 1) found.add('cube');
  if (level.startShape === 3) found.add('tall');
  tiles.forEach((t, i) => {
    if (t === Tile.Ice) found.add('ice');
    else if (t === Tile.Conveyor) found.add('belts');
    else if (t === Tile.Pad) found.add('pads');
    else if (t === Tile.Flip) found.add('flips');
    else if (t === Tile.ExtraHeavy) found.add('extraHeavy');
    else if (t === Tile.Hedge) found.add('hedges');
    else if (t === Tile.ShapeSwitch && groups[i] === 1) found.add('cube');
    else if (t === Tile.ShapeSwitch && groups[i] === 3) found.add('tall');
  });
  return [...found];
}
