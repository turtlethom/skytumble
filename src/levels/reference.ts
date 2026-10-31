import { parseLevel } from '../game/ascii';
import { Level } from '../game/types';

export interface ReferenceLevel {
  name: string;
  /** What the level is meant to teach or test; the bar generated levels are judged against. */
  idea: string;
  level: Level;
}

export const REFERENCE_LEVELS: ReferenceLevel[] = [
  {
    name: 'First Steps',
    idea: 'Rolling basics: stand, lie down, stand again on the goal.',
    level: parseLevel([
      'S###......',
      '#####.....',
      '.#########',
      '.....##G##',
      '......###.',
    ]),
  },
  {
    name: 'The Ledge',
    idea: 'Precise orientation: one-wide ledges only work if you reach each corner standing.',
    level: parseLevel([
      '######...',
      '######...',
      '##S###...',
      '######...',
      '.....#...',
      '.....#...',
      '.....#...',
      '.....####',
      '........#',
      '........#',
      '........G',
    ]),
  },
  {
    name: 'Thin Ice',
    idea: 'Fragile tiles: cross sideways so your weight is spread over two tiles.',
    level: parseLevel([
      '######..........',
      '#S####ffffff####',
      '######ffffff##G#',
      '............####',
    ]),
  },
  {
    name: 'Drawbridge',
    idea: 'Soft switches: any touch extends the bridge.',
    level: parseLevel([
      '####........',
      '#S#o0000####',
      '####....##G#',
      '........####',
    ]),
  },
  {
    name: 'Long Way Round',
    idea: 'Deception + heavy switch: the goal is right there, but the switch is behind you.',
    level: parseLevel([
      'x##...........',
      '###...........',
      '.##...........',
      '.######.......',
      '.#S####000###.',
      '.######..##G#.',
      '.........####.',
    ]),
  },
];
