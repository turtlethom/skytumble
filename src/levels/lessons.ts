// What the Tutorial says as you play. Each lesson answers one question: given where the block is and
// what the last move did, what should the player hear now? The answer depends only on that moment, so
// undo and restart need no bookkeeping. `[Z]` in a line is drawn as a key.
import { StepResult, blockCells, tileAt } from '../game/rules';
import { Level, State, Tile } from '../game/types';

export interface Moment {
  level: Level;
  state: State;
  /** The state before the last move; null when nothing has just moved (a new level, undo, restart). */
  before: State | null;
  /** The last move; null when nothing has just moved. */
  last: StepResult | null;
  moves: number;
}

interface Lesson {
  say(m: Moment): string;
  /** The rule to take away, on the win panel. */
  done: string;
}

const standing = (m: Moment) => m.state.block.o === 'S';
const onTile = (m: Moment, tile: Tile) => blockCells(m.state.block).some(([x, y]) => tileAt(m.level, x, y) === tile);
const fell = (m: Moment) => m.last?.outcome === 'fall';
const bridgeUp = (m: Moment) => (m.state.bridges & 1) !== 0;
/** The last move rolled a lying block sideways: still lying, the same way as before. */
const shifted = (m: Moment) => !!m.before && !standing(m) && m.before.block.o === m.state.block.o;

const LESSONS: Record<string, Lesson> = {
  'tutorial-01': {
    say(m) {
      if (fell(m)) return 'Off the edge! Any part of the block over empty space makes it fall. Press [Z] to take that back.';
      if (m.moves === 0) return 'Press an arrow key, or [W] [A] [S] [D], to roll the block.';
      if (!standing(m) && onTile(m, Tile.Goal)) return 'So close! Lying across the goal is safe, but it only counts when the block stands on it.';
      if (!standing(m)) return 'It tips over and lies across two tiles. Roll it again.';
      return 'Now roll it to the yellow goal, and stand it up there.';
    },
    done: "That's the whole game: stand the block on the goal. [Q] and [E] turn the view when you want another angle.",
  },
  'tutorial-02': {
    say(m) {
      if (fell(m)) return 'A lying block needs ground under both ends, so the ledge only takes it lengthwise. Press [Z] to take that back.';
      if (m.state.block.y >= 3) return 'Lined up! Follow the ledge to the goal.';
      if (shifted(m)) return 'Rolled sideways, a lying block shifts one tile and stays lying. Are you in line with the ledge yet?';
      if (!standing(m)) return 'Lying, it covers two tiles. Now roll it sideways, along its length, and see what changes.';
      if (m.moves === 0) return 'The ledge is one tile wide, and rolling straight ahead won\'t line you up with it. Start by lying the block down.';
      return 'Stand at the top of the ledge to walk it. Lie down and shift sideways until you line up.';
    },
    done: 'Rolled sideways, a lying block shifts one tile. You\'ll use this everywhere to line up.',
  },
  'tutorial-03': {
    say(m) {
      if (m.last?.broke) return 'The planks snapped under the standing block. Press [Z] to take that back, and cross lying down.';
      if (fell(m)) return 'Both ends of the block need ground under them. Press [Z] to take that back.';
      if (m.moves === 0) return 'Old planks break under a standing block, but hold one lying down. Get across without standing on them.';
      if (m.state.block.o === 'X' && onTile(m, Tile.Fragile)) return 'Careful: one more roll this way would stand it on the planks.';
      if (onTile(m, Tile.Fragile)) return 'The planks hold! Keep rolling sideways.';
      if (m.state.block.x >= 5) return 'Across! Now stand it on the goal.';
      if (m.state.block.o === 'Y') return 'Lying across both rows, it can roll sideways over the planks.';
      if (standing(m) && m.state.block.y === 0) return 'Good spot: roll down from here, and the block lies across both rows.';
      return 'To cross, the block has to lie across both rows. Stand in the row above them first.';
    },
    done: 'Planks hold a lying block, but never a standing one.',
  },
  'tutorial-04': {
    say(m) {
      if (fell(m)) return bridgeUp(m) ? 'Off the edge! Press [Z] to take that back.' : 'No bridge there yet! Press [Z] to take that back.';
      if (m.moves === 0) return 'A bridge can fill this gap. The round button is a soft switch: touch it with any part of the block.';
      if (m.last?.toggled) return bridgeUp(m) ? 'The bridge is up! Cross it.' : 'Every touch flips the switch, so that lowered the bridge. Touch it once more.';
      return bridgeUp(m) ? 'The bridge is up. Cross it, then stand on the goal.' : 'Touch the round switch with any part of the block to raise the bridge.';
    },
    done: 'A soft switch answers any touch, and every touch flips its bridge.',
  },
  'tutorial-05': {
    say(m) {
      if (fell(m)) return bridgeUp(m) ? 'Off the edge! Press [Z] to take that back.' : 'No bridge there yet! Press [Z] to take that back.';
      if (m.moves === 0) return 'The X is a heavy switch: it only answers the block\'s full weight, standing on it.';
      if (m.last?.toggled) return bridgeUp(m) ? 'That did it: the bridge is up!' : 'Standing on it again lowered the bridge. Press it once more.';
      if (!standing(m) && onTile(m, Tile.HeavySwitch)) return 'Lying across it does nothing. It only answers a block standing on it.';
      if (bridgeUp(m)) return 'Cross the bridge, then stand on the goal.';
      return 'Stand on the X. Rolling straight there won\'t work: lie down and shift sideways to line up, as on the ledge.';
    },
    done: 'Only a standing block presses a heavy switch. That\'s all the basics: the Campaign is waiting.',
  },
};

export function isLesson(id: string): boolean {
  return id in LESSONS;
}

/** What the lesson says at this moment. */
export function lessonPrompt(id: string, m: Moment): string {
  return LESSONS[id].say(m);
}

/** What the win panel says when this lesson is solved. */
export function lessonDone(id: string): string {
  return LESSONS[id].done;
}
