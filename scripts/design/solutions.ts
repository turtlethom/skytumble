// Print optimal solutions for handmade levels as JSON: npx vite-node scripts/design/solutions.ts [id-prefix]
// LAYERS=1 prints instead, per move, whether it starts on the ceiling ({ ceiling: true }), for play.mjs
// to check SOLUTIONS.md's arrows against the keys the game uses.
import { HANDMADE } from '../../src/levels';
import { initialState, play } from '../../src/game/rules';
import { solve } from '../../src/game/solver';

const prefix = process.argv[2] ?? '';
const out: Record<string, unknown[]> = {};
for (const h of HANDMADE) {
  if (!h.id.startsWith(prefix)) continue;
  // Every action, swaps included: play.mjs presses Tab for a swap.
  const moves = solve(h.level)?.steps ?? [];
  if (!process.env.LAYERS) {
    out[h.id] = moves;
    continue;
  }
  let state = initialState(h.level);
  out[h.id] = moves.map((d) => {
    const ceiling = !!state.layer;
    state = play(h.level, state, d).state;
    return { ceiling };
  });
}
console.log(JSON.stringify(out));
