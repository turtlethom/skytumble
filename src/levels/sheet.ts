import { parseLevel } from '../game/ascii';
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
