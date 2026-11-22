import { describe, expect, it } from 'vitest';
import { gridStep } from '../src/ui/map';

describe('a world\'s level grid (five cards a row)', () => {
  it('left and right step through the levels and wrap round', () => {
    expect(gridStep(0, 20, 1, 0)).toBe(1);
    expect(gridStep(19, 20, 1, 0)).toBe(0);
    expect(gridStep(0, 20, -1, 0)).toBe(19);
  });

  it('up and down move a row and stop at the edges', () => {
    expect(gridStep(2, 20, 0, 1)).toBe(7);
    expect(gridStep(17, 20, 0, 1)).toBe(17);
    expect(gridStep(3, 20, 0, -1)).toBe(3);
  });

  it('a short last row is reached from any column above it', () => {
    // 12 levels: the last row holds 10 and 11; down from 8 lands on 11.
    expect(gridStep(8, 12, 0, 1)).toBe(11);
    expect(gridStep(6, 12, 0, 1)).toBe(11);
    expect(gridStep(11, 12, 0, 1)).toBe(11);
  });
});
