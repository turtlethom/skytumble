// The puzzle behind the main menu, which the block solves over and over. Not a level anyone plays.
import { parseLevel } from '../game/ascii';

/** Roll onto the switch, cross the bridge it opens, and turn down into the goal. */
export const MENU_LEVEL = parseLevel([
  '####....',
  '#S#o00##',
  '####..##',
  '......##',
  '......#G',
  '......##',
]);
