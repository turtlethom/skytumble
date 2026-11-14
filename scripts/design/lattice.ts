// Search for routing puzzles laid out as lanes one tile wide between junctions three tiles apart:
//   npm run -s lattice -- <columns> <rows> <parLo> <parHi> <seed> <seconds> [colors] > out.txt
// The block can only travel junction to junction, so par comes from routing and not parity shuffles.
// It hill-climbs with one idea: a piece (wall, switch, hedge) counts only if taking it away changes the
// answer. Scoring activity instead produces presses everywhere with no reasoning behind them, and long
// strings of hedges. Few hedges, more colors and little road between events score well. A press undone
// straight away scores badly. Prints the three best as design blocks, ready for analyze.ts.
// Env: HEDGES=0 leaves hedges out (any world but First Glade). MAZE=1 fills everything that isn't a lane with walls that never move (`K`, with no switch of its
// color), with no margin, so a 6 by 4 board is 16x10; empty otherwise, with a margin around it for hedges.
// PADS=<share> puts a launch pad on that share of junctions (Windy Peaks; e.g. PADS=0.15). Junctions are three
// apart, so a standing fling from one flies over the next junction and lands lying in the lane beyond it,
// or, if that lane is stone (MAZE=1), stops short standing on the next junction, over whatever lies between.
// A lying block never rests on a junction, so a junction pad always fires: each one is a one-way door.
// SWITCHES=0 leaves out switches, switch walls and bridges, for a maze routed by pads alone (too few states
// to puzzle over, it turned out); SWITCHES=<n> allows at most n switches, against switch soup.
// Then read the solutions, and pass candidates to strip.ts: this finds layouts, not stories.
import { parseLevel } from '../../src/game/ascii';
import { initialState, step } from '../../src/game/rules';
import { solve } from '../../src/game/solver';
import { Level } from '../../src/game/types';
import { explore } from './explore';
import { touched } from './lib';

const [nx, ny, lo, hi, seedArg, secs, colorsArg = 2] = process.argv.slice(2).map(Number);
if (!seedArg || !secs) {
  console.error('usage: lattice.ts <columns> <rows> <parLo> <parHi> <seed> <seconds> [colors]');
  process.exit(2);
}
const colors = colorsArg;
const maze = process.env.MAZE === '1';
// HEDGES=0 for worlds without hedges (every world but First Glade).
const MAX_HEDGES = Number(process.env.HEDGES ?? 6);
const PAD_SHARE = Number(process.env.PADS ?? 0);
const SWITCHES = process.env.SWITCHES !== '0';
const MAX_SWITCHES = Number(process.env.SWITCHES ?? Infinity);
const margin = maze ? 0 : 1;
const W = (nx - 1) * 3 + 1 + margin * 2;
const H = (ny - 1) * 3 + 1 + margin * 2;

let seed = seedArg;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

type Cell = [number, number];
const nodes: Cell[] = [];
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) nodes.push([margin + i * 3, margin + j * 3]);
const lanes: { a: Cell; b: Cell }[] = [];
for (const a of nodes) {
  if (a[0] + 3 <= W - 1 - margin) lanes.push({ a, b: [a[0] + 3, a[1]] });
  if (a[1] + 3 <= H - 1 - margin) lanes.push({ a, b: [a[0], a[1] + 3] });
}

const KINDS = (
  maze
    ? ['none', 'none', 'none', 'plain', 'plain', 'plain', 'plain', 'up', 'down', 'soft', 'hedge', 'hedgegap', 'bridge']
    : ['none', 'none', 'plain', 'plain', 'plain', 'up', 'down', 'soft', 'hedge', 'hedgegap', 'bridge', 'rbridge']
).filter((k) => (MAX_HEDGES > 0 || !k.startsWith('hedge')) && (SWITCHES || ['none', 'plain', 'hedge', 'hedgegap'].includes(k)));

interface Design {
  lanes: { kind: string; near: boolean; color: number }[];
  nodes: { heavy: boolean; color: number; pad: number }[];
  start: number;
  goal: number;
}
const randLane = () => ({ kind: pick(KINDS), near: rand() < 0.5, color: Math.floor(rand() * colors) });
const randNode = () => {
  const r = rand();
  return {
    heavy: SWITCHES && r < 0.12,
    color: Math.floor(rand() * colors),
    // A pad's direction (0-3, in UDLR order), or -1 for none; never on a switch.
    pad: r >= 0.12 && r < 0.12 + PAD_SHARE ? Math.floor(rand() * 4) : -1,
  };
};
const fresh = (): Design => ({
  lanes: lanes.map(randLane),
  nodes: nodes.map(randNode),
  start: Math.floor(rand() * nodes.length),
  goal: Math.floor(rand() * nodes.length),
});

function render(d: Design): { rows: string[]; switches: number[] } {
  const grid = Array.from({ length: H }, () => Array(W).fill(maze ? 'K' : '.'));
  const group = new Map<string, number>();
  const set = (c: number[], ch: string) => (grid[c[1]][c[0]] = ch);
  const onEdge = (c: number[]) => c[0] === 0 || c[1] === 0 || c[0] === W - 1 || c[1] === H - 1;
  let hedges = 0;
  d.lanes.forEach((lane, i) => {
    const { a, b } = lanes[i];
    const [dx, dy] = [(b[0] - a[0]) / 3, (b[1] - a[1]) / 3];
    const [p, q] = [[a[0] + dx, a[1] + dy], [a[0] + 2 * dx, a[1] + 2 * dy]];
    const [near, far] = lane.near ? [p, q] : [q, p];
    if (lane.kind === 'none') return;
    set(p, '#');
    set(q, '#');
    if (lane.kind === 'up') set(near, 'HIJ'[lane.color]);
    if (lane.kind === 'down') set(near, 'hij'[lane.color]);
    if (lane.kind === 'soft') {
      set(near, 'o');
      group.set(`${near[0]},${near[1]}`, lane.color);
    }
    if ((lane.kind === 'hedge' || lane.kind === 'hedgegap') && hedges < MAX_HEDGES && !onEdge(near)) {
      set(near, '&');
      hedges++;
      if (lane.kind === 'hedgegap') set(far, '.');
    }
    if (lane.kind === 'bridge') {
      set(p, String(lane.color));
      set(q, String(lane.color));
    }
    if (lane.kind === 'rbridge') {
      set(p, 'abd'[lane.color]);
      set(q, 'abd'[lane.color]);
    }
  });
  nodes.forEach(([x, y], i) => {
    grid[y][x] = '#';
    if (d.nodes[i].heavy) {
      grid[y][x] = 'x';
      group.set(`${x},${y}`, d.nodes[i].color);
    } else if (d.nodes[i].pad >= 0) {
      grid[y][x] = 'UDLR'[d.nodes[i].pad];
    }
  });
  set(nodes[d.start], 'S');
  set(nodes[d.goal], 'G');
  const rows = grid.map((r) => r.join(''));
  const switches: number[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === 'o' || c === 'x') switches.push(group.get(`${x},${y}`) ?? 0);
  }));
  return { rows, switches };
}

/** How many pieces change the answer when taken away, and how many don't. */
function weigh(rows: string[], switches: number[], par: number): { essential: number; idle: number } {
  let [essential, idle] = [0, 0];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (!'HIJhijox&UDLR'.includes(c)) return;
    const without = rows.map((row, yy) => (yy === y ? row.slice(0, x) + '#' + row.slice(x + 1) : row));
    const rest: number[] = [];
    let k = 0;
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
      if (ch !== 'o' && ch !== 'x') return;
      const g = switches[k++];
      if (xx !== x || yy !== y) rest.push(g);
    }));
    const other = solve(parseLevel(without, rest));
    if (!other || other.moves.length < par) essential++;
    else idle++;
  }));
  return { essential, idle };
}

interface Scored {
  score: number;
  note: string;
  rows: string[];
  switches: number[];
}

function evaluate(d: Design): Scored | null {
  if (d.start === d.goal) return null;
  const { rows, switches } = render(d);
  if (switches.length > MAX_SWITCHES) return null;
  let level: Level;
  try {
    level = parseLevel(rows, switches);
  } catch {
    return null;
  }
  const solution = solve(level);
  if (!solution) return null;
  const par = solution.moves.length;

  let state = initialState(level);
  let [presses, knocks, bridged, wasted, undone, sinceLast, flights] = [0, 0, 0, 0, 0, 9, 0];
  let lastPress = '';
  const cells = new Set<string>();
  const usedColors = new Set<number>();
  const firedPads = new Set<string>();
  for (const dir of solution.moves) {
    const r = step(level, state, dir);
    sinceLast++;
    for (const c of r.pressed) {
      const k = `${c.x},${c.y}`;
      presses++;
      cells.add(k);
      usedColors.add(level.groups[c.y * level.width + c.x]);
      if (k === lastPress && sinceLast <= 2) undone++;
      lastPress = k;
      sinceLast = 0;
    }
    for (const m of r.motions.filter((mo) => mo.kind === 'fly')) {
      flights++;
      firedPads.add(`${m.from.x},${m.from.y}`);
    }
    if (r.knocked) {
      knocks++;
      if (r.bridged) bridged++;
      else wasted++;
    }
    state = r.state;
  }

  const { essential, idle } = weigh(rows, switches, par);
  const seen = touched(level, solution.moves);
  let unused = 0;
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if ('#&o0123abd'.includes(c) && !seen.has(`${x},${y}`)) unused++;
  }));
  const ex = explore(level, 6000);
  const dead = ex.nodes.size - ex.canWin.size;
  const deadShare = dead / Math.max(1, ex.nodes.size);
  const walking = par / Math.max(1, presses + knocks + flights);
  const offBand = par < lo ? (par - lo) * 8 : par > hi ? (hi - par) * 8 : 0;
  const hedgeLimit = maze ? 3 : 2;
  const score =
    offBand +
    essential * 22 -
    idle * 30 +
    bridged * 8 +
    usedColors.size * 22 +
    cells.size * 10 +
    firedPads.size * 12 +
    Math.min(solution.explored, 1200) * 0.06 -
    unused * 2.5 -
    Math.max(0, deadShare - 0.45) * 90 -
    Math.max(0, walking - 5) * 14 -
    wasted * 20 -
    Math.max(0, knocks - hedgeLimit) * 35 -
    undone * 40;
  const note = `par${par} states${solution.explored} flights${flights} pads${firedPads.size} dead${dead}/${ex.nodes.size} essential${essential} idle${idle} switches${cells.size} colors${usedColors.size} knocks${knocks} bridged${bridged} wasted${wasted} undone${undone} unused${unused}`;
  return { score, note, rows, switches };
}

const STALE_LIMIT = 900;
const end = Date.now() + secs * 1000;
const best: Scored[] = [];
while (Date.now() < end) {
  let design = fresh();
  let current = evaluate(design);
  for (let t = 0; t < 400 && !current && Date.now() < end; t++) {
    design = fresh();
    current = evaluate(design);
  }
  if (!current) continue;
  let stale = 0;
  while (stale < STALE_LIMIT && Date.now() < end) {
    const next: Design = JSON.parse(JSON.stringify(design));
    for (let k = 1 + Math.floor(rand() * 3); k > 0; k--) {
      const r = rand();
      if (r < 0.75) next.lanes[Math.floor(rand() * next.lanes.length)] = randLane();
      else if (r < 0.9) next.nodes[Math.floor(rand() * next.nodes.length)] = randNode();
      else if (r < 0.95) next.start = Math.floor(rand() * nodes.length);
      else next.goal = Math.floor(rand() * nodes.length);
    }
    const scored = evaluate(next);
    if (scored && scored.score >= current.score) {
      if (scored.score > current.score) stale = 0;
      design = next;
      current = scored;
    } else {
      stale++;
    }
  }
  best.push(current);
  best.sort((a, b) => b.score - a.score);
  best.length = Math.min(best.length, 3);
}
console.log(best.map((b, i) => `@s${seedArg}-${i + 1} ${b.note}\n!switches ${b.switches.join(' ')}\n${b.rows.join('\n')}`).join('\n\n'));
