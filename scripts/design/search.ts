// Solver-backed layout search:
//   npx vite-node scripts/design/search.ts <template> <palette> <parLo> <parHi> [seed] [restarts] [want]
// The template is a design block (see lib.ts) whose '?' cells are filled from <palette> (repeat a
// character to weight it, e.g. "~~~#.f") and whose '%' cells become ice or empty. Hill-climbs to
// reward: par in range, distinct ice and pad uses (and each one listed in <want>, e.g. "slide→switch", "chain", "backstop"),
// switches pressed, belt pushes, explored states; and penalizes tiles the solution never touches.
// Env: CLUTTER (penalty per untouched filled cell, default 0.5), PRESSES (bonus per switch, default 10),
// WALLS (penalty per switch-wall color the level doesn't need to move, default 40; 0 turns the check off).
// Without that penalty, searches with switch walls mostly find walls that never have to move.
// PLANKS (bonus per plank in a '?' cell whose swap to floor lowers par, default 0 = off): without it a
// search with planks in the palette keeps them only where they never matter, since floor adds states.
// HELD (bonus per move that keeping a hand on held switches adds to par, default 0 = off): against the
// level with its held switches and their bridges as floor. Without it a search with switches in the
// palette lays them as plain floor, since floor adds states.
// BACKSTOP (bonus per move that forbidding the idle cube to hold a belt's push adds to par, default 0 =
// off; unsolvable counts as 10): without it, a backstop in the solution may save only a move.
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
import { backstops, heldFloor, noBackstopPar, wallColors } from './checks';
import { diagnose } from './explore';
import { build, paintOpts, parseBlock, touched } from './lib';

const [file, palette, lo, hi, seedArg = '1', restartsArg = '4', wantArg = ''] = process.argv.slice(2);
const seeds = seedArg.includes('-')
  ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(seedArg.split('-').map(Number))
  : seedArg.split(',').map(Number);
const want = wantArg.split(',').filter(Boolean);
const { rows: template, switches, on, shape, paint, gates, lamps } = parseBlock(readFileSync(file, 'utf8').trim().split('\n'));
const clutter = Number(process.env.CLUTTER ?? 0.5);
const pressBonus = Number(process.env.PRESSES ?? 10);
const wallPenalty = Number(process.env.WALLS ?? 40);
const plankBonus = Number(process.env.PLANKS ?? 0);
const heldBonus = Number(process.env.HELD ?? 0);
const backstopBonus = Number(process.env.BACKSTOP ?? 0);
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

/** `floor`: a score this one must reach to matter; below it, the costly wall check is skipped. */
function score(rows: string[], floor = -Infinity): number {
  let level;
  try {
    level = build(rows, switches, on, shape, paint, gates, lamps);
  } catch {
    return -1e9;
  }
  const sol = solve(level);
  if (!sol) return -1e9;
  const par = sol.moves.length;
  const ice = iceUses(level, sol.moves);
  const uses: string[] = [...ice.uses, ...padUses(level, sol.moves), ...flipUses(level, sol.moves), ...shapeUses(level, sol.moves)];
  // Split cubes: the idle cube holding a belt's push counts once per move it does.
  const stops = backstops(level, sol.steps);
  if (stops) uses.push('backstop');
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
  s += uses.length * 8 + Math.min(pushes, 5) * 1.5 + pressed.size * pressBonus + Math.min(stops, 4) * 6;
  s += Math.min(sol.explored, 600) * 0.05;
  s -= untouched * clutter;
  // The wall check re-solves twice per color, so only pay for it when the score could still count.
  if (wallPenalty && s >= floor) s -= wallColors(level, par).filter((c) => !c.moves).length * wallPenalty;
  // One solve per plank, so skip it when even every plank counting couldn't reach the best so far.
  const planks = slots.filter(([x, y]) => rows[y][x] === 'f').length;
  if (plankBonus && s + planks * plankBonus >= floor) s += plankBonus * neededPlanks(rows, par);
  if (backstopBonus && stops) {
    const without = noBackstopPar(level);
    s += backstopBonus * Math.min(without === null ? 10 : without - par, 10);
  }
  if (heldBonus) {
    const flat = heldFloor(level);
    const plain = flat && solve(flat);
    if (flat) s += heldBonus * Math.min(par - (plain ? plain.moves.length : par - 10), 10);
  }
  return s;
}

/** Planks in '?' cells that hold the solution back: as floor, par drops (the block could stand there). */
function neededPlanks(rows: string[], par: number): number {
  let n = 0;
  for (const [x, y] of slots) {
    if (rows[y][x] !== 'f') continue;
    const swapped = rows.map((r, j) => (j === y ? r.slice(0, x) + '#' + r.slice(x + 1) : r));
    const sol = solve(build(swapped, switches, on, shape, paint, gates, lamps));
    if (sol && sol.moves.length < par) n++;
  }
  return n;
}

const skeleton = render(slots.map((_, i) => (slotPalette[i] === palette ? '#' : '~')));
if (!solve(build(skeleton, switches, on, shape, paint, gates, lamps))) {
  // On stderr, so a redirected results file stays empty rather than holding a non-design.
  console.error('The template is unsolvable even with every ? as floor, so no fill can work. Diagnosis:');
  console.error(diagnose(skeleton, build(skeleton, switches, on, shape, paint, gates, lamps)).join('\n'));
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
  for (let i = 0; i < Number(process.env.ITERS ?? 3000); i++) {
    const next = [...cur];
    for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) {
      const j = Math.floor(rand() * slots.length);
      next[j] = pick(slotPalette[j]);
    }
    const sc = score(render(next), best);
    if (sc >= best) {
      best = sc;
      cur = next;
    }
  }
  results.push({ s: best, rows: render(cur) });
}
results.sort((a, b) => b.s - a.s);
const opts = [
  switches.length ? `!switches ${switches.join(' ')}` : '',
  on.length ? `!on ${on.join(' ')}` : '',
  shape !== 2 ? `!shape ${shape === 1 ? 'cube' : 'tall'}` : '',
  ...paintOpts(paint, gates),
  // The Chasm's light switches, so analyze reads them back as they were searched (held, not the default timer).
  lamps?.length ? `!lamps ${lamps.map((l) => `${l.timer || 'held'}${l.color ? `/${l.color}` : ''}`).join(' ')}` : '',
];
console.log([`@score ${results[0].s.toFixed(1)} seed ${seedArg}`, ...opts.filter(Boolean), ...results[0].rows].join('\n'));
