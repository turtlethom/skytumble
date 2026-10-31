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
   * arrow direction (index into DIRS) for Conveyor tiles, -1 otherwise.
   */
  groups: number[];
  start: { x: number; y: number };
  /** Bitmask of bridge groups that start switched on. */
  bridgesOn: number;
}

export interface State {
  block: Block;
  bridges: number;
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
