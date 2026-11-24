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

describe('level names', () => {
  // Every level gets a name of its own (the user's call, 2026-11-24: reusing a name is "a big no-no").
  // These pairs predate the rule; the list may only shrink.
  const OLDER_REPEATS = ['Assembly Line', 'Combination', 'Crosswind', 'Featherweight', 'Heavy Lifting', 'Relay', 'Slingshot', 'Stepping Stones', 'Switchback', 'Timber', 'Which Way'];

  it('never repeat, apart from the older repeats', () => {
    const seen = new Map<string, number>();
    for (const c of CHAPTERS) for (const l of c.levels) seen.set(l.name, (seen.get(l.name) ?? 0) + 1);
    const repeated = [...seen].filter(([, n]) => n > 1).map(([name]) => name).sort();
    expect(repeated).toEqual(OLDER_REPEATS);
  });
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
