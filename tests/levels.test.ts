import { describe, expect, it } from 'vitest';
import { formatLevel } from '../src/game/ascii';
import { generate } from '../src/game/generator';
import { solve } from '../src/game/solver';
import { TIERS } from '../src/game/types';
import { REFERENCE_LEVELS } from '../src/levels/reference';

describe('reference levels', () => {
  for (const ref of REFERENCE_LEVELS) {
    it(`${ref.name} is solvable`, () => {
      expect(solve(ref.level)).not.toBeNull();
    });
  }
});

describe('generator', () => {
  const seeds = ['a', 'b', 'c', 'seed42', 'xyz789'];

  for (const tier of TIERS) {
    it(`${tier}: same seed gives the same level`, () => {
      expect(formatLevel(generate(tier, 'repeat').level)).toBe(formatLevel(generate(tier, 'repeat').level));
    });

    it(`${tier}: levels are solvable and par matches the solver`, () => {
      for (const seed of seeds) {
        const g = generate(tier, seed);
        const s = solve(g.level);
        expect(s).not.toBeNull();
        expect(g.solution.moves.length).toBe(s!.moves.length);
      }
    });
  }
});
