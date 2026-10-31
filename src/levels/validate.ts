import { blockCells, initialState, step, tileAt } from '../game/rules';
import { solve } from '../game/solver';
import { Dir, Level, Tile } from '../game/types';
import { Chapter, HandmadeLevel } from './format';

/**
 * Distinct ways a solution can use ice. The one-trick guard asks for at least two, so a level
 * can't be "roll onto the ice once and watch".
 */
export type IceUse =
  | 'slide' // a lying block glided across ice
  | 'grip' // came to rest standing on ice
  | 'anchor' // rolled to rest lying half on ice, so the whole-block rule kept it from sliding
  | 'slide→belt' // a slide ended fully on conveyors, which then pushed
  | 'belt→slide' // a conveyor pushed the block onto ice, and it slid on
  | 'slide→switch'; // a slide's resting place pressed a switch

/** Distinct ways a solution can use launch pads; the `pads` signature asks for two. */
export type PadUse =
  | 'fling' // a standing block was flung (long)
  | 'hop' // a lying block hopped (short)
  | 'chain' // a landing fired more pads in the same move
  | 'flight→switch' // a flight's landing pressed a switch
  | 'flight→goal' // a flight landed upright on the goal
  | 'anchor' // came to rest lying half on a pad, so it didn't fire
  | 'belt→pad' // a belt pushed the block onto pads that fired
  | 'flight→belt'; // a flight landed on belts that pushed it

export interface LevelReport {
  id: string;
  /** The solver's optimal move count, or null if unsolvable. */
  par: number | null;
  /** States the solver explored: a rough measure of how much there is to figure out. */
  explored: number;
  iceUses: IceUse[];
  pushes: number;
  padUses: PadUse[];
  errors: string[];
}

export function iceUses(level: Level, moves: Dir[]): { uses: IceUse[]; pushes: number } {
  const uses = new Set<IceUse>();
  let pushes = 0;
  let state = initialState(level);
  for (const dir of moves) {
    const r = step(level, state, dir);
    const kinds = r.motions.map((m) => m.kind);
    pushes += kinds.filter((k) => k === 'push').length;
    if (kinds.includes('slide')) uses.add('slide');
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i - 1] === 'slide' && kinds[i] === 'push') uses.add('slide→belt');
      if (kinds[i - 1] === 'push' && kinds[i] === 'slide') uses.add('belt→slide');
    }
    if (kinds[kinds.length - 1] === 'slide' && r.pressed.length > 0) uses.add('slide→switch');
    const b = r.state.block;
    const onIce = blockCells(b).filter(([x, y]) => tileAt(level, x, y) === Tile.Ice).length;
    if (b.o === 'S' && onIce === 1) uses.add('grip');
    // Every lengthwise slide ends half on ice, so only a roll that stopped there counts as anchoring.
    if (b.o !== 'S' && onIce === 1 && r.motions.length === 0) uses.add('anchor');
    state = r.state;
  }
  return { uses: [...uses], pushes };
}

export function padUses(level: Level, moves: Dir[]): PadUse[] {
  const uses = new Set<PadUse>();
  let state = initialState(level);
  for (const dir of moves) {
    const r = step(level, state, dir);
    const flights = r.motions.filter((m) => m.kind === 'fly');
    for (const f of flights) uses.add(f.from.o === 'S' ? 'fling' : 'hop');
    if (flights.length > 1) uses.add('chain');
    for (let i = 1; i < r.motions.length; i++) {
      const [a, b] = [r.motions[i - 1].kind, r.motions[i].kind];
      if (a === 'push' && b === 'fly') uses.add('belt→pad');
      if (a === 'fly' && b === 'push') uses.add('flight→belt');
    }
    const landed = r.motions.length > 0 && r.motions[r.motions.length - 1].kind === 'fly';
    if (landed && r.pressed.length > 0) uses.add('flight→switch');
    if (landed && r.outcome === 'win') uses.add('flight→goal');
    const b = r.state.block;
    const onPads = blockCells(b).filter(([x, y]) => tileAt(level, x, y) === Tile.Pad).length;
    if (b.o !== 'S' && onPads === 1) uses.add('anchor');
    state = r.state;
  }
  return [...uses];
}

export function validateLevel(h: HandmadeLevel, chapter: Chapter): LevelReport {
  const errors: string[] = [];
  if (!h.id.startsWith(`${chapter.id}-`)) errors.push(`id should start with '${chapter.id}-'`);
  if (!h.level.tiles.includes(Tile.Goal)) errors.push('no goal (G)');

  const solution = solve(h.level);
  const par = solution ? solution.moves.length : null;
  const { uses, pushes } = solution ? iceUses(h.level, solution.moves) : { uses: [], pushes: 0 };

  if (!solution) errors.push('unsolvable');
  else if (h.par === null) errors.push(`par missing (solver says ${par})`);
  else if (h.par !== par) errors.push(`par is ${h.par} in the file but the solver finds ${par}: did a rule change?`);

  const pads = solution ? padUses(h.level, solution.moves) : [];
  if (solution && h.guard && chapter.signature === 'ice' && uses.length < 2) {
    errors.push(`one-trick: the solution uses ice only as [${uses.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  if (solution && h.guard && chapter.signature === 'pads' && pads.length < 2) {
    errors.push(`one-trick: the solution uses pads only as [${pads.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  return { id: h.id, par, explored: solution?.explored ?? 0, iceUses: uses, pushes, padUses: pads, errors };
}

export function validateChapters(chapters: Chapter[]): Map<string, LevelReport> {
  const reports = new Map<string, LevelReport>();
  for (const chapter of chapters) {
    for (const h of chapter.levels) {
      const report = validateLevel(h, chapter);
      if (reports.has(h.id)) report.errors.push('duplicate id');
      reports.set(h.id, report);
    }
  }
  return reports;
}
