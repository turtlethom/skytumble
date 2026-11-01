// Solver-backed layout search:
//   npx vite-node scripts/design/search.ts <template> <palette> <parLo> <parHi> [seed] [restarts] [want]
// The template is a design block (see lib.ts) whose '?' cells are filled from <palette> (repeat a
// character to weight it, e.g. "~~~#.f") and whose '%' cells become ice or empty. Hill-climbs to
// reward: par in range, distinct ice and pad uses (and each one listed in <want>, e.g. "slide→switch", "chain"),
// switches pressed, belt pushes, explored states; and penalizes tiles the solution never touches.
// Env: CLUTTER (penalty per untouched filled cell, default 0.5), PRESSES (bonus per switch, default 10).
// Prints the best layout as a design block, ready for analyze.ts.
// A seed range (`1-4`) or list (`1,5,9`) runs one search per seed in parallel and prints every result,
// best first: save the output to a file and run analyze.ts on it.
// Before searching, it fills every '?' with floor (and '%' with ice): if even that can't be solved, the
// fixed pieces are wrong (a pad aimed at nothing, a goal you can't stand on), so it prints a diagnosis
// and stops instead of climbing for minutes with nothing to climb. A restart whose random fill can't be
// solved starts from that skeleton instead.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialState, step } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { flipUses, iceUses, padUses, shapeUses } from '../../src/levels/validate';
import { diagnose } from './explore';
import { build, parseBlock, touched } from './lib';

const [file, palette, lo, hi, seedArg = '1', restartsArg = '4', wantArg = ''] = process.argv.slice(2);
const seeds = seedArg.includes('-')
  ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(seedArg.split('-').map(Number))
  : seedArg.split(',').map(Number);
const want = wantArg.split(',').filter(Boolean);
const { rows: template, switches, on, shape } = parseBlock(readFileSync(file, 'utf8').trim().split('\n'));
const clutter = Number(process.env.CLUTTER ?? 0.5);
const pressBonus = Number(process.env.PRESSES ?? 10);
let seed = Number(seedArg);
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (xs: string) => xs[Math.floor(rand() * xs.length)];

const slots: [number, number][] = [];
const slotPalette: string[] = [];
template.forEach((r, y) =>
  [...r].forEach((c, x) => {
    if (c === '?' || c === '%') {
      slots.push([x, y]);
      slotPalette.push(c === '?' ? palette : '~~.');
    }
  }),
);
const render = (choice: string[]) => {
  const grid = template.map((r) => [...r]);
  slots.forEach(([x, y], i) => (grid[y][x] = choice[i]));
  return grid.map((r) => r.join(''));
};

function score(rows: string[]): number {
  let level;
  try {
    level = build(rows, switches, on, shape);
  } catch {
    return -1e9;
  }
  const sol = solve(level);
  if (!sol) return -1e9;
  const par = sol.moves.length;
  const ice = iceUses(level, sol.moves);
  const uses: string[] = [...ice.uses, ...padUses(level, sol.moves), ...flipUses(level, sol.moves), ...shapeUses(level, sol.moves)];
  const pushes = ice.pushes;
  const seen = touched(level, sol.moves);
  const pressed = new Set<string>();
  let st = initialState(level);
  for (const d of sol.moves) {
    const r = step(level, st, d);
    r.pressed.forEach((c) => pressed.add(`${c.x},${c.y}`));
    st = r.state;
  }
  const untouched = slots.filter(([x, y]) => rows[y][x] !== '.' && !seen.has(`${x},${y}`)).length;
  let s = -Math.max(0, Number(lo) - par, par - Number(hi)) * 4;
  s += want.filter((w) => uses.includes(w)).length * 15;
  s += uses.length * 8 + Math.min(pushes, 5) * 1.5 + pressed.size * pressBonus;
  s += Math.min(sol.explored, 600) * 0.05;
  return s - untouched * clutter;
}

const skeleton = render(slots.map((_, i) => (slotPalette[i] === palette ? '#' : '~')));
if (!solve(build(skeleton, switches, on, shape))) {
  // On stderr, so a redirected results file stays empty rather than holding a non-design.
  console.error('The template is unsolvable even with every ? as floor, so no fill can work. Diagnosis:');
  console.error(diagnose(skeleton, build(skeleton, switches, on, shape)).join('\n'));
  process.exit(1);
}

if (seeds.length > 1) {
  // Fan out: one child search per seed, then print the results best first.
  const runs = seeds.map(
    (sd) =>
      new Promise<string>((resolve) => {
        const args = [fileURLToPath(import.meta.url), file, palette, lo, hi, String(sd), restartsArg, wantArg];
        const child = spawn('node_modules/.bin/vite-node', args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (c) => (out += c));
        child.on('close', () => resolve(out.trim()));
      }),
  );
  const outs = await Promise.all(runs);
  const score = (o: string) => Number(/^@score (\S+)/.exec(o)?.[1] ?? -Infinity);
  if (outs.some((o) => !o.startsWith('@score'))) process.exit(1);
  console.log(outs.sort((a, b) => score(b) - score(a)).join('\n\n'));
  process.exit(0);
}

const results: { s: number; rows: string[] }[] = [];
for (let r = 0; r < Number(restartsArg); r++) {
  // Start from a random fill; if that can't be solved (common when the fixed pieces are far apart),
  // start from the all-floor skeleton instead, which is known to work, and carve from there.
  let cur = slots.map((_, i) => pick(slotPalette[i]));
  let best = score(render(cur));
  if (best <= -1e9) {
    cur = slots.map((_, i) => (slotPalette[i] === palette ? '#' : '~'));
    best = score(render(cur));
  }
  for (let i = 0; i < 3000; i++) {
    const next = [...cur];
    for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) {
      const j = Math.floor(rand() * slots.length);
      next[j] = pick(slotPalette[j]);
    }
    const sc = score(render(next));
    if (sc >= best) {
      best = sc;
      cur = next;
    }
  }
  results.push({ s: best, rows: render(cur) });
}
results.sort((a, b) => b.s - a.s);
const opts = [switches.length ? `!switches ${switches.join(' ')}` : '', on.length ? `!on ${on.join(' ')}` : ''];
console.log([`@score ${results[0].s.toFixed(1)} seed ${seedArg}`, ...opts.filter(Boolean), ...results[0].rows].join('\n'));
