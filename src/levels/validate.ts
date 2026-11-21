import { blockCells, blockLength, findGoal, initialState, isRing, isSolid, isWall, layerView, play, ringLocked, tileAt } from '../game/rules';
import { solve } from '../game/solver';
import { Level, Move, State, Tile } from '../game/types';
import { Chapter, HandmadeLevel } from './format';

/**
 * Distinct ways a solution can use ice. The one-trick guard asks for at least two, so a level
 * can't be "roll onto the ice once and watch".
 */
export type IceUse =
  | 'slide' // a lying block glided across ice
  | 'grip' // came to rest standing on ice
  | 'anchor' // rolled to rest lying half on ice, so the whole-block rule kept it from sliding
  | 'brake' // a raised wall stopped a slide on the tile before it
  | 'held' // a raised wall kept a belt from pushing
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
  | 'flight→belt' // a flight landed on belts that pushed it
  | 'short'; // a raised wall on the landing stopped a flight short, standing before it

/** Distinct ways a solution can use gravity flips; the `gravity` signature asks for two. */
export type FlipUse =
  | 'flip up' // flipped from the ground to the ceiling
  | 'flip down' // flipped from the ceiling back to the ground
  | 'lying flip' // flipped while lying across two flip tiles
  | 'belt→flip' // a belt pushed the block onto flip tiles that fired
  | 'flight→flip' // a pad flight landed on flip tiles that fired
  | 'flip→pad' // a flip landed the block on pads that fired
  | 'cross-layer press' // pressed a switch that drives bridges, walls or rings on the other floor
  | 'locked' // came to rest fully on flip rings that were locked, so they didn't fire
  | 'unlocked'; // flipped through a ring that was locked at the start, after a press opened it

export function flipUses(level: Level, moves: Move[], from?: State): FlipUse[] {
  const uses = new Set<FlipUse>();
  if (!level.ceiling) return [];
  // Which floors each bridge group has tiles on.
  const groupLayers = new Map<number, Set<number>>();
  for (const layer of [0, 1]) {
    const view = layerView(level, layer);
    view.tiles.forEach((t, i) => {
      if (t !== Tile.Bridge && t !== Tile.BridgeReversed && !isWall(t) && !(isRing(t) && view.groups[i] >= 0)) return;
      if (!groupLayers.has(view.groups[i])) groupLayers.set(view.groups[i], new Set());
      groupLayers.get(view.groups[i])!.add(layer);
    });
  }
  let state = from ?? initialState(level);
  const start = state;
  for (const dir of moves) {
    const r = play(level, state, dir);
    let layer = state.layer ?? 0;
    if (r.locked) uses.add('locked');
    r.motions.forEach((m, i) => {
      if (m.kind !== 'flip') return;
      uses.add(layer === 0 ? 'flip up' : 'flip down');
      if (blockCells(m.from).some(([x, y]) => ringLocked(level, start, x, y, layer))) uses.add('unlocked');
      if (m.from.o !== 'S') uses.add('lying flip');
      const before = r.motions[i - 1]?.kind;
      if (r.motions[i + 1]?.kind === 'fly') uses.add('flip→pad');
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
  | 'shaped goal' // won as a cube or a tall block
  | 'tube slide' // a block slid through a glass tube (the cube rolling in, or a lying block fed in by belts)
  | 'long tube slide'; // a lying normal or tall block, fed in by belts, slid through a glass tube

export function shapeUses(level: Level, moves: Move[]): ShapeUse[] {
  const uses = new Set<ShapeUse>();
  let state = initialState(level);
  for (const dir of moves) {
    const r = play(level, state, dir);
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
    for (const m of r.motions.filter((m) => tubeSlide(view, m))) uses.add(blockLength(m.from) === 1 ? 'tube slide' : 'long tube slide');
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

/** Whether a motion is a slide through a glass tube: it starts with a part of the block in one. */
function tubeSlide(level: Level, m: { kind: string; from: Parameters<typeof blockCells>[0] }): boolean {
  return m.kind === 'slide' && blockCells(m.from).some(([x, y]) => tileAt(level, x, y) === Tile.Door);
}

export function iceUses(level: Level, moves: Move[]): { uses: IceUse[]; pushes: number } {
  const uses = new Set<IceUse>();
  let pushes = 0;
  let state = initialState(level);
  for (const dir of moves) {
    const r = play(level, state, dir);
    // Slides through glass tubes are tube uses, not ice uses.
    const kinds = r.motions.map((m) => (tubeSlide(level, m) ? 'tube' : m.kind));
    pushes += kinds.filter((k) => k === 'push').length;
    if (kinds.includes('slide')) uses.add('slide');
    for (let i = 1; i < kinds.length; i++) {
      if (kinds[i - 1] === 'slide' && kinds[i] === 'push') uses.add('slide→belt');
      if (kinds[i - 1] === 'push' && kinds[i] === 'slide') uses.add('belt→slide');
    }
    if (kinds[kinds.length - 1] === 'slide' && r.pressed.length > 0) uses.add('slide→switch');
    for (const h of r.held ?? []) if (r.motions[h.after - 1]?.kind !== 'fly') uses.add(h.belt ? 'held' : 'brake');
    const b = r.state.block;
    const onIce = blockCells(b).filter(([x, y]) => tileAt(level, x, y) === Tile.Ice).length;
    if (b.o === 'S' && onIce === 1) uses.add('grip');
    // Every lengthwise slide ends half on ice, so only a roll that stopped there counts as anchoring.
    if (b.o !== 'S' && onIce === 1 && r.motions.length === 0) uses.add('anchor');
    state = r.state;
  }
  return { uses: [...uses], pushes };
}

export function padUses(level: Level, moves: Move[]): PadUse[] {
  const uses = new Set<PadUse>();
  let state = initialState(level);
  for (const dir of moves) {
    const r = play(level, state, dir);
    const flights = r.motions.filter((m) => m.kind === 'fly');
    for (const f of flights) uses.add(f.from.o === 'S' ? 'fling' : 'hop');
    if (flights.length > 1) uses.add('chain');
    for (const h of r.held ?? []) if (!h.belt && r.outcome !== 'fall' && r.motions[h.after - 1]?.kind === 'fly') uses.add('short');
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

/**
 * Walls mix with everything: ice and belts (Frost Isle), pads (Windy Peaks), flips (Starfall) and
 * shapes (Toybox, in its lab). Hedges stay in First Glade, with the basics only, on one floor.
 */
const NOT_WITH_HEDGES = [Tile.ShapeSwitch, Tile.ExtraHeavy, Tile.Flip, Tile.Pad, Tile.Ice, Tile.Conveyor];

/** Rings with a wall directly over (or under) them on the other floor, where a flip would land inside the wall. */
export function wallsOverRings(level: Level): { x: number; y: number; layer: number }[] {
  if (!level.ceiling) return [];
  const out: { x: number; y: number; layer: number }[] = [];
  for (const layer of [0, 1]) {
    const here = layerView(level, layer).tiles;
    const there = layerView(level, 1 - layer).tiles;
    here.forEach((t, i) => {
      if (isRing(t) && isWall(there[i])) out.push({ x: i % level.width, y: Math.floor(i / level.width), layer });
    });
  }
  return out;
}

/** Glass tubes are Toybox's: they mix with the basics, shapes, walls and belts until their other interactions are settled. */
const NOT_WITH_GATES = [Tile.Ice, Tile.Pad, Tile.Flip, Tile.FlipLocked, Tile.Hedge];

function mixesGates(level: Level): boolean {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  return tiles.includes(Tile.Door) && (!!level.ceiling || tiles.some((t) => NOT_WITH_GATES.includes(t)));
}

/** Splitting is new (Splatter Studio's split lab): one floor, no hedges, shape switches or marked goals while its rules settle. */
function mixesSplits(level: Level): boolean {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  return tiles.includes(Tile.Splitter) && (!!level.ceiling || !!level.startShape || tiles.some((t) => t === Tile.Hedge || t === Tile.ShapeSwitch || t === Tile.ExtraHeavy) || level.tiles.some((t, i) => t === Tile.Goal && level.groups[i] > 0));
}

function mixesWalls(level: Level): boolean {
  const tiles = [...level.tiles, ...(level.ceiling?.tiles ?? [])];
  return tiles.includes(Tile.Hedge) && (!!level.ceiling || !!level.startShape || tiles.some((t) => NOT_WITH_HEDGES.includes(t)));
}

export function validateLevel(h: HandmadeLevel, chapter: Chapter): LevelReport {
  const errors: string[] = [];
  for (const c of wallsOverRings(h.level)) errors.push(`a wall on the other floor over the ring at ${c.x},${c.y}: walls and rings stay out of each other's way, so a ring always has somewhere to land`);
  if (mixesGates(h.level)) errors.push('glass tubes only mix with the basics, shapes, walls and belts, on one floor, until their other interactions are settled');
  if (mixesWalls(h.level)) errors.push('hedges only mix with the basics, on one floor, until their other interactions are settled');
  if (mixesSplits(h.level)) errors.push('splitters stay on one floor, with no hedges, shape switches, extra-heavy switches or marked goals, until their other interactions are settled');
  h.level.tiles.forEach((t, i) => {
    if (t !== Tile.Splitter) return;
    const [x, y] = [i % h.level.width, Math.floor(i / h.level.width)];
    const side = [[0, -1], [0, 1], [-1, 0], [1, 0]][h.level.groups[i]];
    const [sx, sy] = [x + side[0], y + side[1]];
    if (sx < 0 || sy < 0 || sx >= h.level.width || sy >= h.level.height) errors.push(`the splitter at ${x},${y} splits off the grid`);
  });
  // A hedge falling off the grid would just vanish, while one falling onto an empty tile bridges it,
  // and both look like open sky.
  for (const c of h.level.hedgeCells ?? []) {
    if (c.x === 0 || c.y === 0 || c.x === h.level.width - 1 || c.y === h.level.height - 1) {
      errors.push(`the hedge at ${c.x},${c.y} is on the edge of the grid: pad the grid so it can fall every way`);
    }
  }
  if (!h.id.startsWith(`${chapter.id}-`)) errors.push(`id should start with '${chapter.id}-'`);
  if (!findGoal(h.level)) errors.push('no goal (G)');

  const solution = solve(h.level);
  const par = solution ? solution.moves.length : null;
  const { uses, pushes } = solution ? iceUses(h.level, solution.steps) : { uses: [], pushes: 0 };

  if (!solution) errors.push('unsolvable');
  else if (h.par === null) errors.push(`par missing (solver says ${par})`);
  else if (h.par !== par) errors.push(`par is ${h.par} in the file but the solver finds ${par}: did a rule change?`);

  const pads = solution ? padUses(h.level, solution.steps) : [];
  if (solution && h.guard && chapter.signature === 'ice' && uses.length < 2) {
    errors.push(`one-trick: the solution uses ice only as [${uses.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  if (solution && h.guard && chapter.signature === 'pads' && pads.length < 2) {
    errors.push(`one-trick: the solution uses pads only as [${pads.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  const flips = solution ? flipUses(h.level, solution.steps) : [];
  if (solution && h.guard && chapter.signature === 'gravity' && flips.length < 2) {
    errors.push(`one-trick: the solution uses flips only as [${flips.join(', ') || 'nothing'}]; needs 2 distinct ways`);
  }
  const shapes = solution ? shapeUses(h.level, solution.steps) : [];
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
