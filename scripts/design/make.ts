// One command from a skeleton to ranked, finished candidates:
//   npm run -s make -- <template> <palette> <parLo> <parHi> [seeds=1-4] [want] [out]
// Lints the template, runs search.ts over the seeds in parallel, then for each result: strips what the
// solution doesn't need, regrows the decoys that keep the puzzle, turns walls it doesn't need into floor, flips the board north to south if that
// uncovers something a raised wall hides, and reports par, states, dead ends, how much the mechanics add,
// whether each wall color has to move, and what stays hidden. Prints a short summary, best first, and
// writes the finished design blocks to <out> (default: the template's name + .make.txt) for analyze,
// sim and verify, and the raw search results to <out>.raw.txt (finish them again with FROM=<that file>,
// skipping the search). Env: RESTARTS (per seed, default 4); KEEP=<characters> that strip must leave
// alone (KEEP=K keeps a maze's stone); plus search.ts's CLUTTER, PRESSES and WALLS.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Draft, block, dropUnreachable, flipNS, hidden, lint, normalize, plainWalls, regrow, report, strip, tryLevel, wallsText, COLOR } from './checks';
import { parseBlock } from './lib';

const [template, palette, lo, hi, seeds = '1-4', want = '', outArg] = process.argv.slice(2);
if (!template || !palette || !lo || !hi) {
  console.error('usage: make.ts <template> <palette> <parLo> <parHi> [seeds=1-4] [want] [out]');
  process.exit(2);
}
const out = outArg ?? template.replace(/\.txt$/, '') + '.make.txt';

// 1. Lint the template as its most open version, so mistakes show before minutes of searching.
const t = parseBlock(readFileSync(template, 'utf8').trim().split('\n'));
const open: Draft = { rows: t.rows.map((r) => r.replace(/\?/g, '#').replace(/%/g, '~')), switches: t.switches, on: t.on, shape: t.shape };
// A switch with nothing to move is expected when the search is the one placing the walls.
const placesWalls = /[HIJKhijk0-9]/.test(palette);
const warnings = lint(open).filter((l) => !l.startsWith('WARN: unsolvable') && !(placesWalls && l.includes('moves nothing')));
if (warnings.length) console.log(['template:', ...warnings.map((w) => `  ${w}`)].join('\n'));
// These are always mistakes, and minutes of searching won't fix them.
if (warnings.some((w) => w.startsWith('does not parse') || /switches but the switches line/.test(w))) {
  console.log('stopping: fix the template first');
  process.exit(1);
}

// 2. Search, or reuse an earlier search's raw results.
const found = process.env.FROM ? readFileSync(process.env.FROM, 'utf8') : await new Promise<string>((resolve) => {
  const args = ['scripts/design/search.ts', template, palette, lo, hi, seeds, process.env.RESTARTS ?? '4', want];
  const child = spawn('node_modules/.bin/vite-node', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let text = '';
  child.stdout.on('data', (c) => (text += c));
  child.on('close', (code) => (code === 0 ? resolve(text) : process.exit(code ?? 1)));
});
if (!process.env.FROM) writeFileSync(out.replace(/\.txt$/, '') + '.raw.txt', found);

// 3. Finish each result.
interface Candidate {
  name: string;
  draft: Draft;
  flipped: boolean;
  stripped: { par: number; states: number };
  r: NonNullable<ReturnType<typeof report>>;
}
const candidates: Candidate[] = [];
for (const text of found.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.startsWith('@'))) {
  const lines = text.split('\n');
  const seed = /seed (\S+)/.exec(lines[0])?.[1] ?? '?';
  const { rows, switches, on, shape } = parseBlock(lines);
  const full = normalize({ rows, switches, on, shape });
  const stripped = strip(full, process.env.KEEP ?? '');
  const sr = report(stripped);
  if (!sr) continue;
  let draft = dropUnreachable(plainWalls(regrow(stripped, full)));
  let flipped = false;
  const level = tryLevel(draft);
  if (level && hidden(level).length) {
    const f = flipNS(draft);
    const fl = tryLevel(f);
    if (fl && hidden(fl).length < hidden(level).length) {
      draft = f;
      flipped = true;
    }
  }
  const r = report(draft);
  if (r) candidates.push({ name: `seed ${seed}`, draft, flipped, stripped: { par: sr.par, states: sr.states }, r });
}

// 4. Rank: every wall color has to move and no press is undone straight away, then no dead ends, then
// the most states.
const wallsOk = (c: Candidate) => c.r.walls.every((w) => w.moves) && c.r.represses === 0;
candidates.sort(
  (a, b) => Number(wallsOk(b)) - Number(wallsOk(a)) || Number(b.r.deadEnds === 0) - Number(a.r.deadEnds === 0) || b.r.states - a.r.states,
);

const summary = candidates.map((c, i) => {
  const walls = c.r.walls.length
    ? wallsOk(c)
      ? `walls ok (${c.r.walls.map((w) => COLOR[w.group]).join(', ')})`
      : `WALLS: ${wallsText(c.r.walls.filter((w) => !w.moves))}`
    : 'nothing switched';
  return [
    `#${i + 1} ${c.name}  par ${c.r.par}  states ${c.r.states} (stripped ${c.stripped.states})  dead ends ${c.r.deadEnds}/${c.r.reachable}` +
      `  floor par ${c.r.floorPar ?? 'X'}  ${walls}${c.flipped ? '  [flipped N-S]' : ''}`,
    `   uses: ${c.r.uses.join(' ') || 'none'}${c.r.pushes ? `  pushes ${c.r.pushes}` : ''}`,
    ...c.r.hidden.map((h) => `   HIDDEN: ${h}`),
    ...(c.r.represses ? [`   QUICK RE-PRESS ×${c.r.represses}: a press undone within two moves, only to reposition (try ease)`] : []),
    `   moves: ${c.r.moves}`,
  ].join('\n');
});
console.log(summary.join('\n') || 'no solvable candidates');
writeFileSync(out, candidates.map((c, i) => block(`make #${i + 1} ${c.name} par ${c.r.par} states ${c.r.states}`, c.draft)).join('\n\n') + '\n');
console.log(`\ndesign blocks, best first: ${out}`);
