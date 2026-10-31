import { Dir } from '../game/types';

/**
 * Conveyor arrow colour per direction, so opposing lanes side by side read as different
 * belts even when perspective makes the chevrons hard to tell apart. Chosen to stay clear of
 * the bridge-group colours.
 */
export const CONVEYOR_COLORS: Record<Dir, number> = {
  up: 0xffd166,
  down: 0xff6fae,
  left: 0x7ee081,
  right: 0x5eead4,
};

export const cssColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
