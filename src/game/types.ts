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
}

/** Standing upright, lying along the x axis, or lying along the y axis. */
export type Orientation = 'S' | 'X' | 'Y';

export interface Block {
  /** For lying blocks, (x, y) is the cell with the smaller coordinate. */
  x: number;
  y: number;
  o: Orientation;
}

export interface Level {
  width: number;
  height: number;
  /** Row-major, index = y * width + x. */
  tiles: Tile[];
  /**
   * Bridge group for Bridge tiles, switch target group for switch tiles,
   * arrow direction (index into DIRS) for Conveyor and Pad tiles, -1 otherwise.
   */
  groups: number[];
  start: { x: number; y: number };
  /** Bitmask of bridge groups that start switched on. */
  bridgesOn: number;
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
}

export type Dir = 'up' | 'down' | 'left' | 'right';

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
