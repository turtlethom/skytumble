import { lampOf } from './ascii';
import { blockCells, layerView, tileAt } from './rules';
import { Level, State, Tile } from './types';

/**
 * The Chasm's lights (settled 2026-11-23/24). Presentation only: dark tiles are floor to the rules,
 * so nothing here changes what's solvable. What's lit is worked out from the play so far, so undo
 * and restart need nothing special.
 *
 * - A held light switch lights its color's dark tiles while anything rests on it.
 * - A timed light switch, pressed (the moving block comes to rest on it), lights them for N moves:
 *   N right after the press, counting down with every roll of either cube; Tab is free. A second
 *   press restarts the count.
 * - A dark tile shows while a block rests on it, lit or not.
 * - A fall beside an unlit dark tile rewinds to the moment its lights last went out.
 */

/** One step of play: the state it led to, and whether it was a roll (a swap isn't). */
export interface Played {
  state: State;
  roll: boolean;
}

export interface LampCell {
  x: number;
  y: number;
  layer: number;
  color: number;
  /** Moves lit after a press; 0 for a held light switch. */
  timer: number;
}

export function lampsOf(level: Level): LampCell[] {
  const out: LampCell[] = [];
  for (const layer of level.ceiling ? [0, 1] : [0]) {
    const view = layerView(level, layer);
    view.tiles.forEach((t, i) => {
      if (t !== Tile.Lamp) return;
      out.push({ x: i % level.width, y: Math.floor(i / level.width), layer, ...lampOf(view.groups[i]) });
    });
  }
  return out;
}

/** Whether a level has anything to light. */
export const hasLights = (level: Level) => level.tiles.includes(Tile.Dark) || !!level.ceiling?.tiles.includes(Tile.Dark);

/** The light colors that have dark tiles in a level (bit per color). */
export function darkColors(level: Level): number {
  let mask = 0;
  for (const layer of level.ceiling ? [0, 1] : [0]) {
    const view = layerView(level, layer);
    view.tiles.forEach((t, i) => t === Tile.Dark && (mask |= 1 << view.groups[i]));
  }
  return mask;
}

/** Cells resting on the floor in a state: the block's and the idle cube's, with the floor they're on. */
function restingCells(s: State): { x: number; y: number; layer: number }[] {
  const layer = s.layer ?? 0;
  return [...blockCells(s.block).map(([x, y]) => ({ x, y, layer })), ...(s.other ? [{ ...s.other, layer }] : [])];
}

/** Whether the moving block rests on this lamp in a state. */
function blockOn(s: State, lamp: LampCell): boolean {
  return (s.layer ?? 0) === lamp.layer && blockCells(s.block).some(([x, y]) => x === lamp.x && y === lamp.y);
}

export interface Lighting {
  /** Bit per light color: lit now. */
  lit: number;
  /** Moves of light left per timed lamp (by `lampsOf` index); 0 while dark. Held lamps show 0. */
  left: number[];
}

/**
 * What's lit after the first `upto` steps of `played` (0: at the start), starting from `start`.
 * `upto` defaults to all of them.
 */
export function lightingAt(level: Level, start: State, played: Played[], upto = played.length, lamps = lampsOf(level)): Lighting {
  const now = upto === 0 ? start : played[upto - 1].state;
  let lit = 0;
  const left = lamps.map(() => 0);
  const resting = restingCells(now);
  lamps.forEach((lamp, i) => {
    if (lamp.timer === 0) {
      if (resting.some((c) => c.x === lamp.x && c.y === lamp.y && c.layer === lamp.layer)) lit |= 1 << lamp.color;
      return;
    }
    // The last press at or before now, counting the rolls since.
    let rolls = 0;
    for (let k = upto; k >= 1; k--) {
      const p = played[k - 1];
      if (p.roll && blockOn(p.state, lamp)) {
        left[i] = Math.max(0, lamp.timer - rolls);
        break;
      }
      if (p.roll) rolls++;
      if (rolls >= lamp.timer) break;
    }
    if (left[i] > 0) lit |= 1 << lamp.color;
  });
  return { lit, left };
}

/**
 * Where a fall in the dark rewinds to: the number of steps to keep (the state the lights last went
 * out in), or null if this fall isn't in the dark. The last step in `played` is the fall. A fall is
 * in the dark when the block left from or fell beside (or onto) a dark tile whose light was out as it
 * moved. With more than one such color, the latest lights-out wins: the shortest way back.
 */
export function darkRewind(level: Level, start: State, played: Played[]): number | null {
  const n = played.length;
  if (n === 0) return null;
  const lamps = lampsOf(level);
  const before = n === 1 ? start : played[n - 2].state;
  const fell = played[n - 1].state;
  const unlit = ~lightingAt(level, start, played, n - 1, lamps).lit & darkColors(level);
  if (!unlit) return null;
  // Dark colors on or next to where the block was and where it fell.
  const colors = new Set<number>();
  for (const s of [before, fell]) {
    const view = layerView(level, s.layer ?? 0);
    for (const [x, y] of blockCells(s.block)) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(view, x + dx, y + dy) === Tile.Dark) {
          const c = view.groups[(y + dy) * level.width + x + dx];
          if ((unlit >> c) & 1) colors.add(c);
        }
      }
    }
  }
  if (!colors.size) return null;
  // Walk back from just before the fall to the step where the light went out.
  const mask = [...colors].reduce((m, c) => m | (1 << c), 0);
  for (let k = n - 1; k >= 1; k--) {
    const earlier = lightingAt(level, start, played, k - 1, lamps).lit;
    if (earlier & mask) return k;
  }
  return 0;
}

/**
 * Steps of a solution taken in the dark: rolls that came to rest with any part of the moving block
 * on a dark tile whose light was out, how many of those changed direction (turns in the dark), rolls
 * onto dark tiles while lit, and `unseen`: dark steps onto a tile that had never been lit before, so
 * the route asks the player to guess. Memory can't be measured by par, so the tools report these.
 */
export function darkSteps(level: Level, start: State, played: Played[], dirs: (string | null)[]): { steps: number; turns: number; litCrossings: number; unseen: number } {
  const lamps = lampsOf(level);
  let steps = 0;
  let turns = 0;
  let litCrossings = 0;
  let unseen = 0;
  let seen = 0;
  let lastDark: string | null = null;
  played.forEach((p, k) => {
    const lit = lightingAt(level, start, played, k + 1, lamps).lit;
    seen |= lit;
    if (!p.roll) return;
    const view = layerView(level, p.state.layer ?? 0);
    const darkHere = blockCells(p.state.block).filter(([x, y]) => tileAt(view, x, y) === Tile.Dark).map(([x, y]) => view.groups[y * level.width + x]);
    if (!darkHere.length) {
      lastDark = null;
      return;
    }
    if (darkHere.some((c) => !((lit >> c) & 1))) {
      steps++;
      if (darkHere.some((c) => !((seen >> c) & 1))) unseen++;
      if (lastDark !== null && dirs[k] !== lastDark) turns++;
      lastDark = dirs[k] ?? null;
    } else {
      litCrossings++;
      lastDark = null;
    }
  });
  return { steps, turns, litCrossings, unseen };
}
