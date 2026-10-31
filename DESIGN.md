# Skytumble — Design

An original rolling-block puzzle game: tip a 1×1×2 block across floating sky islands
and drop it upright into the goal hole. Levels are procedurally generated and verified
by a solver. Inspired by the rolling-block genre; its own name, look, and levels.

## Goals

- Built for fun: a game I play myself and introduce to friends.
- Improve on the classic genre: generated levels, scoring against the optimal solution,
  a better camera.

**Success (six months out):** I still play it; friends come back to it unprompted; side
by side it feels better than the old games; the project keeps growing.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Identity | Original game, **Skytumble**, sky-islands theme | Own look and name; not a clone |
| Visuals | 3D (Three.js). Free CC0 asset packs for terrain; special tiles as code-made effects | No hand-drawn art |
| Platform | Desktop only, keyboard | — |
| Camera | Rotates in 90° snaps; controls are screen-relative (Up = away from you) | No ambiguous diagonals; matters with full restart |
| Content order | Generator first → level editor → changing levels | Fresh levels from day one |
| Quality guard | ~5 handmade reference levels to judge generator output against | Pre-mortem: "generated levels feel bland" |
| First mode | Pick a difficulty, get a generated level | Simplest base for the other modes |
| Teaching | Difficulty tiers control which mechanics appear | Gradual introduction, simple to build |
| Gating | All tiers open from the start | Friends can jump straight in |
| Failure | Hard: full restart. Easy/Medium: undo allowed | Harsh where chosen, fair elsewhere |
| Progress | Stars vs. solver's optimal, stats & streaks, cosmetic rank | — |
| Sharing | Seed links (`?tier=…&seed=…`); old links may change as the generator evolves | Links mean "play this now" |
| Hosting | Static site (GitHub Pages / itch.io), no accounts | Free, nothing to run |
| Tech | Vite + TypeScript + Three.js; generator/solver in a Web Worker | Type safety for logic; UI never freezes |

**"Hard" means:** precise orientation, switch logic, deceptive layouts (routes that
detour away from the goal). Solution length alone is not the target.

## Mechanics

| Mechanic | Rule |
|---|---|
| Rolling | Block is standing (1×1) or lying (1×2); rolling tips it over an edge |
| Goal | Win by standing upright on the goal; lying across it is safe |
| Falling | Any part of the block over empty space → fall |
| Fragile tile | Breaks if the block stands upright on it |
| Soft switch | Toggles its bridge group when any part of the block lands on it |
| Heavy switch | Toggles its bridge group only when the block stands on it |
| Bridge | Solid only while its group is on |
| *Later:* ice/conveyors, teleporters, timed/crumbling tiles, splitting into two cubes |

## Tiers

| Tier | Mechanics | Status |
|---|---|---|
| Easy | Floor, fragile | v1 |
| Medium | + soft/heavy switches, bridges | v1 |
| Hard | + teleporters, ice, timed tiles, splitting; full restart | later |

## Scope

**v1:** rolling, fragile tiles, switches & bridges; Easy and Medium generated; seed links;
stars; stats; snapping camera; undo; reference levels.

**Later:** ice/conveyors, teleporters, timed/crumbling tiles, Hard tier, splitting,
endless climb, daily puzzle, fixed campaign, cosmetic rank & skins, level editor,
swapping code-made terrain for a CC0 sky-islands asset pack.

**Non-goals:** mobile/touch, servers, accounts, global leaderboards.

## Architecture

```
src/game/      pure logic (no Three.js): types, rules, solver, generator, RNG
src/levels/    handmade reference levels (ASCII)
src/render/    Three.js scene: tiles, block roll animation, camera
src/ui/        HUD, panels, persistence (localStorage)
src/worker.ts  runs the generator off the main thread
tests/         rules, solver, generator determinism, reference levels solvable
```

- **State:** block `(x, y, orientation)` + bridge bitmask. Orientation: standing,
  lying along x, lying along y.
- **Solver:** BFS over states; returns the optimal move list. Used for par/stars,
  generator scoring, and future hints.
- **Generator:** seeded RNG → random overlapping island rectangles → hill-climb
  mutations (add/remove tiles, fragile, move start/goal, place switches & bridges),
  scored by solution length within a tier band, detours, switch presses, and
  narrow steps. Fixed iteration counts (never time-based), so a seed always gives
  the same level for a given generator version.

## Controls

Arrows/WASD move · Q/E rotate camera · Z undo · R restart · N new level

## Open risks

- Generated levels feel bland → compare against the reference levels; tune scoring.
- Splitting may be very hard to generate well.
- "Beats the original" has no concrete test yet; judged by feel.
- Seed links break when the generator changes. When the editor lands, switch to
  links that encode the full level (needed for handmade levels anyway).

## Running

```
npm install
npm run dev      # play at the printed localhost URL
npm test         # rules, solver, generator, reference levels
npm run levels   # print sample generated levels as text
npm run build    # static site in dist/ for GitHub Pages / itch.io
```
