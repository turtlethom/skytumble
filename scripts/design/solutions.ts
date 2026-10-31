// Print optimal solutions for handmade levels as JSON: npx vite-node scripts/design/solutions.ts [id-prefix]
import { HANDMADE } from '../../src/levels';
import { solve } from '../../src/game/solver';

const prefix = process.argv[2] ?? '';
const out: Record<string, string[]> = {};
for (const h of HANDMADE) if (h.id.startsWith(prefix)) out[h.id] = solve(h.level)?.moves ?? [];
console.log(JSON.stringify(out));
