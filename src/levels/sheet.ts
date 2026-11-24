import { parseLamps, parseLevel } from '../game/ascii';
import { Level } from '../game/types';

/**
 * Every tile in one view, for approving a theme's readability before any scenery goes on:
 * `?sheet=forest` shows bridges extended, `?sheet=forest&bridges=0` retracted. Not a puzzle.
 */
const ROWS = [
  '#o#o#o#o##f#f#f#',
  '################',
  '#x#x#x#x##~#~#~#',
  '################',
  '#X#c#n#t##^#v#<#',
  '################',
  '0011#2233##>#G##',
  '################',
  'HIJK#hijk#&&#&##',
  '################',
  'aabbddee########',
  '################',
  'S#U#R#D#L##+#C#T',
];

/** Switch target groups in reading order: all four colors of soft and heavy, then an extra-heavy. */
const SWITCH_GROUPS = [0, 1, 2, 3, 0, 1, 2, 3, 2];

export function tileSheet(bridgesOn: number): Level {
  return parseLevel(ROWS, SWITCH_GROUPS, bridgesOn);
}

/** A strip of floor for close-up samples (`?sheet=toybox&toys`, `?sheet=peaks&aerie`), beside the block. */
export function toySampleFloor(): Level {
  return parseLevel(['#############', '#############', '#############', 'S############', '#############']);
}

/**
 * A world's walls up close (`?sheet=frost&walls`), for approving their stone: two raised and two sunk
 * walls, low stone that never moves (group 1 has no switch), and the tiles walls must not be mistaken
 * for (ice, fragile, a switch) beside them. Not a puzzle.
 */
export function wallSampleFloor(): Level {
  return parseLevel([
    '##############',
    '#HH##hh##~~~##',
    '#######IIII~##',
    '#o#######I##f#',
    '###~~#######f#',
    'S##~I#IIIII###',
    '###~I#####I###',
    '##########I~~#',
  ]);
}

/**
 * Starfall's walls up close (`?sheet=night&walls`), on both floors: raised and sunk walls by flip
 * rings (a plain one, a locked orange one, an open blue one), the teal planks and moonstone switches,
 * and low stone that never moves (group 3 has no switch).
 * `&up` puts the block on the ceiling. Not a puzzle.
 */
export function starWallSampleFloor(): Level {
  return parseLevel([
    '##############',
    '#o##HH##hh##f#',
    '#######+####f#',
    'S###KKKK######',
    '####K###M##HH#',
    '##############',
    '---',
    '##############',
    '#x##JJ##jj##f#',
    '#######+####f#',
    '######KKKK####',
    '######K#q##JJ#',
    '##############',
  ], [0, 2]);
}

/**
 * Splatter Studio's tiles (`?sheet=splatter`, `&painted` coats the block orange below and green on top):
 * the paint trays, the six gate colors, water and the cutting-mat splitter, beside the switches, belts,
 * tubes, planks, walls and bridges they mix with, so paint can be judged against switch and belt colors.
 * Six gates in a north-south run, as in a corridor (one sheet each), and a seventh at a junction.
 * Not a puzzle.
 */
export function splatterSheet(painted: boolean): Level {
  const level = parseLevel(
    [
      '#o#o#o#o##x#x#x#x#',
      '##################',
      '#r#u#y##s###]#####',
      '##################',
      '.{.{.{.{.{.{..{###',
      '##################',
      '#^#v#<#>##==##ff#G',
      '##################',
      '#H#h##0011##C#####',
      '##################',
      'S#################',
    ],
    [0, 1, 2, 3, 0, 1, 2, 3],
    3,
    2,
    [1, 2, 3, 4, 5, 6, 4],
  );
  if (painted) level.startPaint = [5, 6];
  return level;
}

/**
 * The Hollow Deep's tiles (`?sheet=hollow`): dark tiles in the three light colors (no blue: it would
 * vanish in the teal haze) beside their light switches (a timed orange, a held purple, a timed red),
 * held switches as iron plates, iron gates raised and sunk, low stone, the iron seam splitter, the
 * iron-ringed goal, planks, belts and a press switch to compare. The lights show lit; `&dark` leaves them
 * out, and a roll east puts the block on a dark tile in the dark (its footing glow). Not a puzzle.
 */
export function hollowSheet(): Level {
  return parseLevel(
    [
      '#o#x##O#O#O##f#f#',
      '#################',
      '#H#I#J##h##K#KK##',
      '#################',
      '#*#*#*##,,,#;;;##',
      '##########,#;#"##',
      '#]##00##G#"""###',
      '#################',
      'S,,#^#v###########',
    ],
    [0, 1, 0, 1, 2],
    1,
    2,
    [],
    parseLamps('4 held/1 6/3'),
  );
}
