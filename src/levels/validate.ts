import { blockCells, blockLength, findGoal, initialState, isSolid, layerView, step, tileAt } from '../game/rules';
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

/** Distinct ways a solution can use gravity flips; the `gravity` signature asks for two. */
export type FlipUse =
  | 'flip up' // flipped from the ground to the ceiling
  | 'flip down' // flipped from the ceiling back to the ground
  | 'lying flip' // flipped while lying across two flip tiles
  | 'belt→flip' // a belt pushed the block onto flip tiles that fired
  | 'flight→flip' // a pad flight landed on flip tiles that fired
  | 'cross-layer press'; // pressed a switch that drives bridges on the other floor

export function flipUses(level: Level, moves: Dir[]): FlipUse[] {
  const uses = new Set<FlipUse>();
  if (!level.ceiling) return [];
  // Which floors each bridge group has tiles on.
  const groupLayers = new Map<number, Set<number>>();
  for (const layer of [0, 1]) {
    const view = layerView(level, layer);
    view.tiles.forEach((t, i) => {
      if (t !== Tile.Bridge) return;
      if (!groupLayers.has(view.groups[i])) groupLayers.set(view.groups[i], new Set());
      groupLayers.get(view.groups[i])!.add(layer);
    });
  }
  let state = initialState(level);
  for (const dir of moves) {
    const r = step(level, state, dir);
    let layer = state.layer ?? 0;
    r.motions.forEach((m, i) => {
      if (m.kind !== 'flip') return;
      uses.add(layer === 0 ? 'flip up' : 'flip down');
      if (m.from.o !== 'S') uses.add('lying flip');
      const before = r.motions[i - 1]?.kind;
      if (before === 'push') uses.add('belt→flip');
      if (before === 'fly') uses.add('flight→flip');
      layer = 1 - layer;
    });
    const view = layerView(level, r.state.layer ?? 0);
    for (const c of r.pressed) {
      const g = view.groups[c.y * level.width + c.x];
      if (groupLayers.get(g)?.has(1 - (r.state.layer ?? 0))) uses.add('cross-layer press');
    }
    state = r.state;
  }
  return [...uses];
}

/** Distinct ways a solution can use shapes; the `shapes` signature asks for two. */
export type ShapeUse =
  | 'become cube'
  | 'become tall'
  | 'back to normal'
  | 'cube crosses fragile' // a cube rested standing on a fragile tile
  | 'tall spans a gap' // a lying tall block rested with its middle over nothing
  | 'tall presses extra-heavy'
  | 'shaped goal'; // won as a cube or a tall block

export function shapeUses(level: Level, moves: Dir[]): ShapeUse[] {
  const uses = new Set<ShapeUse>();
  let state = initialState(level);
  for (const dir of moves) {
    const r = step(level, state, dir);
    const b = r.state.block;
    const view = layerView(level, r.state.layer ?? 0);
    if (r.reshaped) uses.add(r.reshaped.to === 1 ? 'become cube' : r.reshaped.to === 3 ? 'become tall' : 'back to normal');
    if (blockLength(b) === 1 && tileAt(view, b.x, b.y) === Tile.Fragile) uses.add('cube crosses fragile');
    if (blockLength(b) === 3 && b.o !== 'S') {
      const [mx, my] = blockCells(b)[1];
      if (!isSolid(view, mx, my, r.state.bridges)) uses.add('tall spans a gap');
    }
    if (r.pressed.some((c) => tileAt(view, c.x, c.y) === Tile.ExtraHeavy)) uses.add('tall presses extra-heavy');
    if (r.outcome === 'win' && blockLength(b) !== 2) uses.add('shaped goal');
    state = r.state;
  }
  return [...uses];
}

export interface LevelReport {
  id: string;
  /** The solver's optimal move count, or null if unsolvable. */
  par: number | null;
  /** States the solver explored: a rough measure of how much there is to figure out. */
  explored: number;
  iceUses: IceUse[];
  pushes: number;
  padUses: PadUse[];
  flipUses: FlipUse[];
  shapeUses: ShapeUse[];
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
  if (!findGoal(h.level)) errors.push('no goal (G)');

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
  const flips = solution ? flipUses(h.level, solution.moves) : [];
  if (solution && h.guard && chapter.signature === 'gravity' && flips.length < 2) {
    errors.push(`one-trick: the solution uses flips only as [${flips.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  const shapes = solution ? shapeUses(h.level, solution.moves) : [];
  if (solution && h.guard && chapter.signature === 'shapes' && shapes.length < 2) {
    errors.push(`one-trick: the solution uses shapes only as [${shapes.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  return { id: h.id, par, explored: solution?.explored ?? 0, iceUses: uses, pushes, padUses: pads, flipUses: flips, shapeUses: shapes, errors };
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
