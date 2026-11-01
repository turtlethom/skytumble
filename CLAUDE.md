# Skytumble — working notes for Claude

An original rolling-block puzzle game (Vite + TypeScript + Three.js). **`DESIGN.md` is the source of
truth** for decisions, rules, the roadmap, and the playtest log. Read it first, and keep it updated
as decisions are made or levels change.

## How we work

- **Roles:** the user playtests and gives feedback; Claude writes the code and designs the levels.
  The user delegates detail decisions ("give me your recommendation"), so make the call and explain
  it briefly. Ask only about direction or taste.
- **The loop:** build something playable → verify it yourself → the user playtests → they send
  notes per level id (`frost-03`) or seed → act on the notes → log them in DESIGN.md's *Playtest
  log* → repeat. New mechanics get prototyped in throwaway "lab" levels first; rules freeze after
  the user signs off.
- **Commits:** the user says "commit it" to approve. Conventional Commits, committed directly on
  `main` (no remote yet). End each turn's summary by proposing the next commit message and step.
- **Feature decisions:** for anything big, grill the user first (they asked for `/grill-me` style
  sessions), then record the outcome in DESIGN.md before building.

## Commands

```
npm run dev            # play at the printed URL; press L in-game for the sky map
npm test               # rules, solver, generator, chapter format, every handmade level valid
npm run levels:check   # validation report; `-- --fill-par` records par for new levels
npm run build          # static site in dist/ (game + levels.html)
npx tsc --noEmit       # typecheck (scripts/ is excluded: no @types/node)
```

`/levels.html` is the level index (mini-maps, validation status, play links); `/?level=<id>` opens
one level.

## Designing handmade levels

Levels live in `src/levels/<chapter>.txt` (format documented in `src/levels/format.ts`; grid
characters in `src/game/ascii.ts`). Chapters are registered in play order in
`src/levels/index.ts` (which also marks extras), and a new chapter needs an island position and
theme in `LAYOUT` in `src/ui/map.ts`. A chapter with `signature: ice` enforces the one-trick guard: the optimal
solution must use ice in at least two distinct ways (`src/levels/validate.ts`).

The process that produced the Frost chapter:

1. **Start from an idea, not a search.** Each level needs one clear "aha", ideally two mechanics
   working together (e.g. a switch that also raises posts in the rink, so the way back differs from
   the way out). Single-gimmick levels on small maps playtested as "meh".
2. **Sketch a template by hand** with the fixed pieces (start island, switches, belts, bridges,
   goal island) and leave `?` cells for the search (`%` = ice or empty). Use `!switches 0 1` lines
   when switches target different bridge groups.
3. **Search:** `npx vite-node scripts/design/search.ts <template> "~~~#.f" <parLo> <parHi> <seed> 4
   "slide→switch,belt→slide"`. It hill-climbs layouts with the solver and penalizes tiles the
   solution never touches. Try 2–3 seeds.
4. **Analyze:** `TRACE=1 npx vite-node scripts/design/analyze.ts <file>` prints par, explored states,
   ice uses, switch presses, the move trace, and the grid with `*` on untouched tiles.
5. **Strip and judge.** Remove the `*` tiles and re-analyze: a high state count that collapses when
   stripped was maze clutter, not a puzzle. Then reframe by hand, keeping decoys only if they add
   real choices (states go up, par stays).
   For pad levels, place the pads by hand from the flight geometry: a
   standing block on pad `p` lands lying on `p+4, p+5`; lying along pads `p, p+1` lands
   standing on `p+3`; lying across lands lying 2 past. Give the goal room for a two-tile
   lying approach in line, or parity can make it unreachable standing. Get the skeleton
   solvable first (a fully random template never is), then let the search shape only the
   floor of one island around fixed pads, switches and landing cells, with a floor-heavy
   palette (`"#####...<v^"`). That produced the maneuvering puzzles of wind-06…08. A belt
   pushes once per move, even after a landing, so to be fed onto a pad you must roll onto
   the last belt tile.
6. **Fix the ending.** Searches often leave 3–6 moves of shuffling around a cramped goal island.
   Put the goal in line with how the block arrives (and remove start-island busywork the same way).
7. **Check the story against the trace.** Write the `name`/`idea` text from the actual solution and
   re-read it whenever the level changes (a stale "double back" description cost a playtest round).
8. **Validate and record par:** add the level to its chapter file, then
   `npm run levels:check -- --fill-par`, then `npm test`.
9. **Play it for real** (below), then hand it to the user with specific questions.

Difficulty within a chapter should climb in both par and explored states; the finale should clearly
exceed the levels before it (frost-08: 22 moves / 387 states vs frost-07's 18 / 66).

## Verifying visually (headless Chrome)

The user playtests on Firefox (needs `webgl.force-enabled=true`); Claude verifies with Playwright's
cached Chromium, driven over the DevTools protocol by `scripts/design/play.mjs`:

```
npm run build && (npx vite preview --port 4179 --strictPort &)
npx vite-node scripts/design/solutions.ts frost- > /tmp/solutions.json
node scripts/design/play.mjs http://localhost:4179 /tmp/solutions.json /tmp/shots
```

It plays every optimal solution with real key events, reports WON/NOT WON at par, and saves start
and end screenshots to read. Gotchas:

- `--virtual-time-budget` screenshots freeze CSS transitions mid-way; use the driver instead.
- To inspect a fast animation, build a throwaway copy with its constants slowed ~10× and capture
  frames mid-move; timing real-speed screenshots is unreliable.
- Things the camera can't see don't count as feedback: a belt flare hidden under the block went
  unnoticed until the block itself reacted.
- Stopping servers: `pkill -f "vite preview"` inside a command that also contains that text kills
  its own shell. Use a bracket pattern (`pkill -f "[v]ite preview --port 4179"`) in a separate
  command.

## Code map

```
src/game/      pure rules: types, rules (step: roll → slide → push → slide), solver (BFS), generator
src/levels/    chapter .txt files, format.ts (parser), validate.ts (checks + one-trick guard), index.ts
src/render/    Three.js world (tiles, animations, push cue), palette.ts (belt colors by direction)
src/ui/        progress (localStorage), map (campaign sky map; island layout per chapter)
src/main.ts    game controller: modes, HUD, splash, key focus sink (for Vimium)
scripts/       check-levels.ts; design/ (search, analyze, solutions, play)
```

Rules are frozen for ice and conveyors (see DESIGN.md *Mechanics*); changing them breaks
handmade levels, which `npm test` will flag through par drift.
