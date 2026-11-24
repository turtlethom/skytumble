export enum Tile {
  Empty = 0,
  Floor = 1,
  Fragile = 2,
  Goal = 3,
  SoftSwitch = 4,
  HeavySwitch = 5,
  Bridge = 6,
  /** A lying block fully on ice slides; a standing block grips. */
  Ice = 7,
  /** Shifts a block that is fully on conveyors one tile along its arrow after each move. */
  Conveyor = 8,
  /** Flings a block standing on it (or lying fully on two that agree) along its arrow. */
  Pad = 9,
  /** Flips gravity for a block standing on it (or lying fully on two): it moves to the other layer. */
  Flip = 10,
  /** Sets the block's shape (group = its length: 1 cube, 2 normal, 3 tall) when it stands on it. */
  ShapeSwitch = 11,
  /** Toggles its bridge group only under a standing tall block. */
  ExtraHeavy = 12,
  /** A bridge that is out while its group's bit is off, the opposite of a Bridge. */
  BridgeReversed = 13,
  /** A wall that starts raised; each press of its group's switch lowers or raises it. Lowered, it is floor. */
  WallUp = 14,
  /** The same wall, starting lowered. */
  WallDown = 15,
  /** Holds until a standing block rolls into it, then topples that way for good. Group = its index in `Level.hedgeCells`. */
  Hedge = 16,
  /**
   * A flip tile that starts locked: it won't fire until a press of its group's switch opens it. A
   * `Flip` with a group (0-3) starts open and locks on a press; one with no group (-1) never changes.
   */
  FlipLocked = 17,
  /** A glass tube (group 0 east-west, 1 north-south): only the cube rides it, entering and leaving through its open ends. */
  Door = 18,
  /**
   * A normal block standing on it splits into two cubes: one stays here, the other appears on the
   * side the splitter marks (group = index into DIRS), unless that side is a gap or a raised wall.
   */
  Splitter = 19,
  /** A tray of wet paint (group = its primary color, 1-3): it coats the part of the block resting on it. */
  Tray = 20,
  /** A gate in a paint color (group = the color, 1-6): only a part of the block in that color passes onto it. */
  Gate = 21,
  /** Water: it strips the paint from the part of the block resting on it. */
  Wash = 22,
  /**
   * A held switch (the Chasm): its group's walls, bridges and rings stay switched only while
   * anything rests on it (a cube, either half of a lying block, a standing block, the idle cube).
   */
  HoldSwitch = 23,
  /** Floor that can't be seen until its light color is lit (group = the light color, 0-3). The rules treat it as floor. */
  Dark = 24,
  /**
   * A light switch (group = color + 4 × timer): a timed one lights its color's dark tiles for that
   * many moves after a press, a held one (timer 0) while anything rests on it. Floor to the rules.
   */
  Lamp = 25,
}

/**
 * Paint colors: 0 none, the primaries 1 red, 2 blue, 3 yellow, their mixes 4 purple (red + blue),
 * 5 orange (red + yellow), 6 green (blue + yellow), and 7 mud (a coat on a mix), which passes no gate.
 */
export type Paint = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const PAINT_NAMES = ['none', 'red', 'blue', 'yellow', 'purple', 'orange', 'green', 'mud'] as const;

/** Standing upright, lying along the x axis, or lying along the y axis. */
export type Orientation = 'S' | 'X' | 'Y';

export interface Block {
  /** For lying blocks, (x, y) is the cell with the smaller coordinate. */
  x: number;
  y: number;
  o: Orientation;
  /**
   * Length in tiles: 1 is the cube (always standing), 3 the tall block. Absent means the normal
   * block (2), so every level and test written before shapes still compares equal.
   */
  n?: 1 | 3;
}

export interface Level {
  width: number;
  height: number;
  /** Row-major, index = y * width + x. */
  tiles: Tile[];
  /**
   * Group for Bridge and wall tiles, switch target group for switch tiles, index for Hedge tiles,
   * arrow direction (index into DIRS) for Conveyor and Pad tiles, -1 otherwise.
   */
  groups: number[];
  start: { x: number; y: number };
  /** Bitmask of bridge groups that start switched on. */
  bridgesOn: number;
  /** Where each hedge stands, by its index; absent if there are none. */
  hedgeCells?: { x: number; y: number }[];
  /** The block's shape at the start (its length: 1 cube, 3 tall); absent means normal. */
  startShape?: 1 | 3;
  /** The block's paint at the start, [bottom, top]; absent means unpainted. */
  startPaint?: [Paint, Paint];
  /**
   * Optional second layer directly above the ground, same size and coordinates, walked upside
   * down. Bridge groups are shared between layers; the start is always on the ground.
   */
  ceiling?: { tiles: Tile[]; groups: number[] };
}

export interface State {
  block: Block;
  bridges: number;
  /** 0 on the ground, 1 on the ceiling (gravity flipped). Absent means 0. */
  layer?: number;
  /** Which way each hedge fell: three bits per hedge, 0 still up, otherwise its index in DIRS + 1. Absent means none fell. */
  hedges?: number;
  /**
   * After a split: the idle cube, standing where it was left. The cube the arrows move is always
   * `block`, so a swap exchanges the two. Absent while the block is whole.
   */
  other?: { x: number; y: number };
  /**
   * The block's paint, per half: a lying block's halves in `blockCells` order, a standing block's as
   * [bottom, top], a cube's as [c, c]. Absent while unpainted.
   */
  paint?: [Paint, Paint];
  /** The idle cube's paint after a split; absent while unpainted. */
  otherPaint?: Paint;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

/** A roll, or a swap of which cube the arrows move (free: it never counts as a move). */
export type Move = Dir | 'swap';

export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];

/** Grid deltas: "up" is -y (north). */
export const DIR_DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export type Tier = 'easy' | 'medium';

export const TIERS: readonly Tier[] = ['easy', 'medium'];
