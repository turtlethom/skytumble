# Skytumble — working notes for Claude

An original rolling-block puzzle game (Vite + TypeScript + Three.js). **`DESIGN.md` is the source of
truth** for decisions, rules, the roadmap, and the playtest log. Read it first, and keep it updated
as decisions are made or levels change. Finished history (shipped release plans, build notes, older
playtest notes) moves word for word to `DESIGN-archive.md`; search it when a past decision's reason matters.

## How we work

- **Roles:** the user playtests and gives feedback; Claude writes the code and designs the levels.
  The user delegates detail decisions ("give me your recommendation"), so make the call and explain
  it briefly. Ask only about direction or taste.
- **The loop:** build something playable → verify it yourself → the user playtests → they send
  notes per level id (`frost-03`) or seed → act on the notes → log them in DESIGN.md's *Playtest
  log* → repeat. New mechanics get prototyped in throwaway "lab" levels first; rules freeze after
  the user signs off.
- **Commits:** the user says "commit it" to approve. Conventional Commits, committed directly on
  `main`. End each turn's summary by proposing the next commit message and step.
- **Deploys:** every push to `main` runs the tests, then publishes the game to
  <https://turtlethom.github.io/skytumble/> (`.github/workflows/deploy.yml`). The repo is public.
  A commit stays private until pushed, so "commit it" does not mean "push it": ask before pushing.
- **Tools grow with the game:** when a new mechanic or feature lands, extend the design tools to
  cover it (its checks in `lint`, its role in `make`'s report, a test in `tests/design-tools.test.ts`),
  so level-making stays cheap as the game grows. The puzzle ideas still come from the user and Claude.
- **Feature decisions:** for anything big, grill the user first (they asked for `/grill-me` style
  sessions), then record the outcome in DESIGN.md before building.

## Commands

```
npm run dev            # play at the printed URL; a bare URL opens the main menu, ?level=<id> a level
npm test               # rules, solver, generator, chapter format, every handmade level valid
npm run levels:check   # validation report; `-- --fill-par` records par for new levels
npm run build          # static site in dist/ (game + levels.html)
npx tsc --noEmit       # typecheck (scripts/ is excluded: no @types/node)
```

Design tools (`scripts/design/`). Each takes a draft file of design blocks, or a level id (`wind-06`), or an id
prefix (`wind-`) for a whole chapter, so playtest notes can be acted on directly:

```
npm run -s analyze -- <file|id>...        # templates read as all-open; par, states, dead ends, pad/ice uses, untouched tiles (*);
                                          #   unsolvable → diagnosis. TRACE=1 moves · DIAG=1 diagnosis
                                          #   always · BLOCK=1 print as a design block (copy to a draft)
npm run -s sim -- <file|id> RRDL [name]   # replay moves; board at the end (SHOW=1: after every move)
npm run -s search -- <template> <palette> <parLo> <parHi> 1-4 2 "chain,belt→pad" > out.txt
                                          # seeds 1-4 in parallel, best first; stops at once with a
                                          #   diagnosis if the template can't be solved even all-floor
npm run -s lattice -- 5 3 26 36 1 150 2 > out.txt
                                          # routing puzzles: columns rows parLo parHi seed seconds colors;
                                          #   MAZE=1 fills the rest with low stone, HEDGES=0 leaves hedges
                                          #   out (every world but First Glade). Run a few seeds at once
npm run -s strip -- out.txt [name]        # remove what the solution doesn't need, keeping par
npm run -s make -- <template> <palette> <parLo> <parHi> [1-4] [want] [out]
                                          # the whole loop in one command: lint, search, strip, wall
                                          #   and bridge check, regrow, unneeded walls to floor, drop
                                          #   unreachable tiles, flip if a wall hides something; prints a
                                          #   short ranked summary, writes finished blocks to <out> and
                                          #   the raw search to <out>.raw. KEEP=K keeps a maze's stone;
                                          #   FROM=<raw> re-finishes without searching again
npm run -s lint -- <file|id>...           # before solving: switches in reading order with colors,
                                          #   skippable belts, goal only reachable lying, what raised
                                          #   walls hide (and whether a north-south flip fixes it), a board
                                          #   too big for the camera
npm run -s walls -- <file|id>...          # each switch color's walls and bridges fixed one way, then the
                                          #   other: must both change par. PLAIN=1 turns unneeded walls to floor
npm run -s regrow -- stripped.txt full.txt # add back decoys that keep par and every moving wall
FILL=K npm run -s ease -- <file|id>      # make a level easier, same idea: fill tiles the solution never
                                          #   uses (stone with FILL=K) while it lowers states, keeps par ±2
                                          #   (PAR=lo-hi), keeps every moving color, and drops presses
                                          #   undone within two moves. TARGET=<states> stops early
npm run verify -- wind-                   # build, serve, play every solution in headless Chrome
```

**When a draft is unsolvable, read the diagnosis before changing anything.** It lists every pad
launch (where it lands, on what, `✗ FALLS`, whether play ever fires it), the closest approach to
the goal with the moves to get there, and a reach map (`S` the block rests standing, `l` only
lying, `-` never). Nearly every dead draft in Windy Peaks was one of three things it shows at a
glance: a pad landing one column off onto nothing, a start island that boxes the block in, or a
goal reachable only lying. **Dead ends** counts states you can reach but never win from
(without undo): 0 is forgiving; a finale with many (wind-08: 85 of 341) punishes wandering.

`/levels.html` is the level index (mini-maps, validation status, play links); `/?level=<id>` opens
one level. `/?sheet=<theme>` shows every tile in a theme (`&bridges=0` retracts the bridges), for
approving readability before scenery; `/?sheet=toybox&toys` stands Toybox's sample toys on its floor; `/?sheet=peaks&aerie` shows Windy Peaks' rock structures and birds up close; `/?sheet=frost&summit` shows Frost Isle's reindeer up close; `/?sheet=<theme>&walls` shows a world's walls (raised, sunk, low stone) beside the tiles they mustn't be mistaken for; `&theme=<theme>` previews a theme on any level; `&gray` shows
the page in black and white, to check a tile reads without color. In the game,
F (or `?fps`) toggles a hidden frame-rate readout, which also shows triangles and draw calls.

## Designing handmade levels

Levels live in `src/levels/<chapter>.txt` (format documented in `src/levels/format.ts`; grid
characters in `src/game/ascii.ts`). A two-layer (gravity) level writes the ground, a `---` line,
then the ceiling grid in the same coordinates; `+` is a flip tile. The layers line up row for
row, so keep leading empty rows (trimming the ground's first row shifts it under the wrong
ceiling row). The rules run on one layer at a
time through `layerView`; the renderer mirrors the ceiling group (scale y −1), so tiles and
animations are shared. Shapes: a block's length (`n`: 1 cube, absent = 2, 3 tall) drives
rolling, support (a lying tall block rests on its ends), and weight; `c`/`t`/`n` are shape
switches, `X` an extra-heavy switch, `C`/`T` goals marked for a shape, and `shape: cube|tall`
(or `!shape` in a design block) sets the start shape. Traces print `cube`/`tall` before a pose.
Walls and hedges: `H I J K` a wall starting up in group 0-3, `h i j k` starting down, `a b d e` a
reversed bridge, `&` a toppling hedge (at most 9; pad the grid around them, or validation fails).
A wall whose color has no switch in the level never moves: it's drawn low, with no colored line, and all
of them merge into one mesh. Use `K` for these, so a maze can have dozens.
They only mix with the basics for now (validation fails otherwise). A diagnosis lists where each hedge
lands each way; traces print `TOPPLE` with what it bridged, or `wasted`. In `analyze`, a raised wall the solution never bumps still shows `*`: it can be doing its
job, so don't strip it the way you would an unused tile. `sim` prints bumps and knocks, and doesn't
stop at them. Chapters are registered in play order in
`src/levels/index.ts` (which also splits them into the Tutorial, the campaign and the labs), and a new chapter needs an island position and
theme in `LAYOUT` in `src/ui/map.ts`. A chapter with `signature: ice` enforces the one-trick guard: the optimal
solution must use ice in at least two distinct ways (`src/levels/validate.ts`).

The process that produced the Frost chapter:

1. **Start from an idea, not a search.** Each level needs one clear "aha", ideally two mechanics
   working together (e.g. a switch that also raises posts in the rink, so the way back differs from
   the way out). Single-gimmick levels on small maps playtested as "meh".
2. **Sketch a template by hand** with the fixed pieces (start island, switches, belts, bridges,
   goal island) and leave `?` cells for the search (`%` = ice or empty). Use `!switches 0 1` lines
   when switches target different bridge groups. **Run `lint` on every hand draft** before solving it:
   it shows each switch's color in reading order (a heavy switch earlier in reading order silently
   takes the first group), a belt with floor behind it, and a goal the block only reaches lying.
   With fixed pieces in place, `make` runs steps 3–5 in one go and prints a few lines per candidate;
   read its summary first and analyze only the candidates worth it.
3. **Search:** `npm run -s search -- <template> "~~~#.f" <parLo> <parHi> 1-3 4
   "slide→switch,belt→slide"`. It hill-climbs layouts with the solver and penalizes tiles the
   solution never touches; the seed range runs in parallel.
4. **Analyze:** `TRACE=1 npm run -s analyze -- <file>` prints par, explored states, dead ends,
   ice and pad uses, switch presses, the move trace, and the grid with `*` on untouched tiles.
   To check a route you have in mind, replay it with `sim` instead of tracing it by hand.
5. **Strip and judge.** For switch walls, run `walls`: fix each color down for good and up for good,
   and a color earns its place only if both change par (the search penalizes colors that don't, via
   `WALLS`). Free-form searches with walls in the palette mostly find walls that never have to move;
   fix the idea's walls by hand instead. After stripping, `regrow` adds back the decoys that keep par
   and every moving wall: that took frost-13 from 174 to 464 states.
   Remove the `*` tiles and re-analyze: a high state count that collapses when
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
   For gravity levels the same applies, with two more lessons from Starfall: open `?` areas
   let the search pad par with parity shuffles (eight moves just to get upright on a ring),
   so fix the idea's skeleton and leave only small `?` patches; and check that every switch in
   the solution matters (an untouched bridge `*` means its switch press was incidental). In the
   reach map, flip-tile cells never show `S` on their own floor: a block standing there flips.
   For hard switch and hedge puzzles, lay the level out as lanes one tile wide between junctions three
   tiles apart: the block can only go junction to junction, so par is routing. `lattice` searches for
   these, counting a piece only if removing it changes the solution, and built `glade-12`...`20`. Read each
   solution before keeping it, write the story from the trace, and check the opening view: if the block or
   a wall hides what matters, flip the board north to south, since nothing behind a tall piece shows.
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
cached Chromium, driven over the DevTools protocol by `scripts/design/play.mjs`. One command does
the build, serve, play, and cleanup:

```
SHOTS=<scratch dir> npm run verify -- frost-
```

It plays every optimal solution with real key events, reports WON/NOT WON at par, and saves start
and end screenshots to read. Controls follow the screen, so the driver asks the game which arrow
rolls which way (`window.skytumbleKeyFor`). Options for `verify`/`play.mjs`: `STEPS=1` (a shot
after every move), `PEEK_AT=n` (hold Space after move n), `ROTATE=n` (quarter turns before playing), `TITLE_CHECK=1` (check when the chapter title shows, instead of playing). For the main menu, a plain headless screenshot of `/`
with `--virtual-time-budget=20000` is enough; the sky map and other screens need the driver, to click through to them. Gotchas:

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
src/levels/    chapter .txt files, format.ts (parser), validate.ts (checks + one-trick guard), index.ts,
               lessons.ts (the Tutorial's prompts, from the block's position and the last move),
               mechanics.ts (How To Play's entries, scenes and unlocks)
src/render/    Three.js world (tiles, animations, push cue), palette.ts (belt colors by direction),
               themes.ts (each chapter's look; rules in DESIGN.md's *Chapter themes*),
               scenery.ts (what a world's surroundings provide), forest.ts, frost.ts and peaks.ts (each world's
               scenery; the big clouds behind the game are `#sky` in the page), toybox.ts (Toybox's scenery), toys.ts
               (its toys and plastic reflections), starfall.ts (Starfall's scenery), stardust.ts (flip sparkles), aerie.ts (Windy Peaks' arches, nests and birds), ridge.ts (Frost Isle's ridge, reindeer and cable towers), grove.ts (First Glade's hills, trees and butterflies), studio.ts (the Tutorial's dark studio)
src/ui/        progress (localStorage), map (the sky map and Labs screen; island layout per chapter),
               menu (a keyboard-driven button list: main menu, Esc menu, Settings)
src/main.ts    game controller: modes, the stack of open screens, HUD, splash, key focus sink (for Vimium)
scripts/       check-levels.ts; design/ (lib, explore, checks, analyze, sim, search, strip, lattice, make, lint, walls, regrow, solutions, play, verify)
```

Rules are frozen for ice and conveyors, and for walls with them (see DESIGN.md *Mechanics*); changing them breaks
handmade levels, which `npm test` will flag through par drift.
