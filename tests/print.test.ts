import { it } from 'vitest';
import { formatLevel } from '../src/game/ascii';
import { generate } from '../src/game/generator';
import { TIERS } from '../src/game/types';
import { REFERENCE_LEVELS } from '../src/levels/reference';
import { solve } from '../src/game/solver';

// Not an assertion test: prints levels for eyeballing generator quality (`npm run levels`).
it('prints sample levels', () => {
  for (const ref of REFERENCE_LEVELS) {
    console.log(`REF ${ref.name}  par ${solve(ref.level)!.moves.length}\n${formatLevel(ref.level)}\n`);
  }
  for (const tier of TIERS) {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const t0 = performance.now();
      const g = generate(tier, seed);
      const ms = Math.round(performance.now() - t0);
      console.log(`${tier}:${seed}  par ${g.solution.moves.length}  score ${g.score.toFixed(1)}  ${ms}ms\n${formatLevel(g.level)}\n`);
    }
  }
});
