import { describe, expect, it } from 'vitest';
import { formatLevel } from '../src/game/ascii';
import { generate } from '../src/game/generator';
import { solve } from '../src/game/solver';
import { TIERS } from '../src/game/types';
import { CHAPTERS } from '../src/levels';
import { validateChapters } from '../src/levels/validate';

describe('handmade levels', () => {
  const reports = validateChapters(CHAPTERS);
  for (const [id, report] of reports) {
    // Fails when a rule change alters a level's par or makes it unsolvable: see `npm run levels:check`.
    it(`${id} passes validation`, () => {
      expect(report.errors).toEqual([]);
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
