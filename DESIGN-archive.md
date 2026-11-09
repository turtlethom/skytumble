# Skytumble — Design archive

Finished history moved word for word out of DESIGN.md on 2026-11-08 to keep it short: shipped release
plans, finished build notes and older playtest notes. DESIGN.md stays the source of truth for current
rules, decisions and plans; search here when the reason behind a past decision matters.

## Roadmap: shipped releases (v1, Frost, Windy Peaks, Starfall, Toybox)

**v1 (done):** rolling, fragile tiles, switches & bridges; Easy and Medium generated; seed
links; stars; stats; snapping camera; undo; reference levels.

**Frost release (done 2026-10-31)**, built in this order:

1. **Polish** (from the v1 playtest) — done
   - Goal marker: replace the cylinder with a geometric indicator that fits the look.
   - End of level: a short fade toward black, then a panel offering Start over / Next level.
   - Loading screen: cover the page until styles, fonts, and the 3D scene are ready.
2. **Ice and conveyor**: rules, solver, visuals, tests. — done
3. **Level tooling**: a text level format with IDs (`frost-03`), solver validation
   (solvable, par, one-trick guard), and a preview page that renders any level by ID.
   A visual editor comes later. — done: chapter `.txt` files, `npm run levels:check`,
   `levels.html`, and `?level=<id>` in the game.
4. **Ice lab**: ~4 throwaway levels exercising the rules, for one playtest week. Rules
   freeze after sign-off. — done: `lab-01`…`lab-05` playtested 2026-10-31; **rules frozen**
   (see Playtest log).
5. **Campaign chapters**: Tutorial (the 5 reference levels, reordered as needed) and
   ~8 Frost levels. — built: `frost-01`…`frost-08` in `src/levels/frost.txt`, all
   passing the one-trick guard; approved in playtest 2026-10-31. Play order is Tutorial → Frost → Ice Lab
   (kept as extras). Chained motions now pause briefly between steps so chains read.
6. **Campaign map** with soft order. — built, awaiting playtest: a DOM overlay (`src/ui/map.ts`),
   no new art. One floating island per chapter, joined by a dashed suggested path; extras (Ice
   Lab) branch off its end on a dotted line. Each island shows its level stones (stars earned,
   a pulsing ring on *up next* = the first unsolved level on the path, the block on the level
   you're playing) and its solved/star totals. Hover or arrow keys preview a level (mini-map,
   id, name, idea, par, best); click or Enter plays it. It replaces the level picker;
   `levels.html` stays as the dev index. (The main menu has since taken over the landing
   and the labs: see *Now: main menu, Tutorial and How To Play*.)

**Next release — Windy Peaks** (launch pads), planned in a grilling session 2026-10-31:

- *Goal:* "surprise reach", the "I can get there?!" moment. Success = the same test as
  Frost: I pick Windy Peaks levels unprompted, weeks later.
- *Why pads:* the fling was the most wanted finale moment, and pads plug into the move
  pipeline like a slide (no core change). Teleporters, lower layers, and the stretch block
  stay in the backlog; deep core changes were acceptable only if clearly best.
- *Scope:* arrow pads only; base layer (fragile, switches, bridges) plus pads, and **belts**
  (changed after the lab playtest: pads alone needed spice). Ice stays in Frost. Handmade only: no generator
  support, no level editor, no sound. The camera gets a patch only if long flings leave frame.
- *Audience:* assumes Tutorial and Frost are done.
- *Depth* (the pre-mortem was "shallow levels: find the pad, use it, done"): pose setup
  (getting upright on the far pad), switch combos (a landing flips the way back), route
  order. Decoy pads are not a focus.
- *If the lab plays flat:* iterate the pad rules (distances, triggers, momentum pads) in
  another lab round before abandoning pads.

1. **Pad rules**: rules, solver, landing marks, fling animation, tests, pad-use report and
   guard. — done: pads are `U D L R` in level text; `signature: pads`, `guard: off`. Flights
   arc and tumble once on the way; the pad flashes and gust streaks drift over it.
2. **Wind lab**: 6 throwaway levels, one playtest round: long fling, short hop, pose setup,
   chain (also the camera stress test), hard landing on a switch or fragile tile, one combo.
   Rules freeze after sign-off. — built: `windlab-01`…`06` in `src/levels/windlab.txt`
   (an extras island on the map). First playtest 2026-10-31 (see log) → rebuilt as 7 levels
   with belts: 01 Long Fling and 02 Short Hop kept; 03 Conveyor Launch (belt intro), 04 Near
   or Far (the far island holds the switch), 05 Heavy Relay (the chain is the payoff after
   setup), 06 Stepping Stones (island hopping, maneuver before each jump), 07 Crosswind
   (finale: belts, soft-switch parity, belt-fed return pad). Par 5 → 26 (8 from 03 on, climbing);
   Second playtest signed off 2026-10-31: **pad and belt rules frozen**.
3. **Windy Peaks chapter** (`wind-01`…`wind-08`): two teaching levels (fling, hop;
   `guard: off`), five guarded levels each pairing two depth sources, a finale combining
   them. Belts join from the middle levels on; difficulty must climb toward the end. Theme: rocky spires, gusts, banners.
   — built 2026-11-01, **approved in playtest 2026-11-01**: `src/levels/wind.txt`, all solved at par in
   headless Chrome. Belts come in from 03 (Frost already taught them).

   | Level | Name | Par | States | The idea |
   |---|---|---|---|---|
   | 01 | Updraft | 7 | 17 | Fling (teaching): get upright on the pad |
   | 02 | Skip Stone | 8 | 21 | Hop (teaching): lie along two pads; standing overshoots |
   | 03 | Tailwind | 10 | 50 | Belt→pad: a pad with no floor around it; belts shove you to the goal |
   | 04 | Sidestep | 12 | 44 | Lying-across hop onto a fragile strip; come in from above |
   | 05 | Out and Down | 16 | 92 | Heavy switch on the landing island, then set up the hop down without re-pressing it |
   | 06 | Relay Rock | 18 | 102 | Chain both ways through a rock of pads; the landing turns the bridge off, belts hand you back onto the switch |
   | 07 | Two Switches | 25 | 164 | Press a switch before leaving (belt puzzle), landing presses another, across-hop down |
   | 08 | Crossroads | 28 | 334 | Hub with two spokes, order matters: soft-switch parity north, relay + belt-fed return east |

   Island floors for 06–08 came from `search.ts` with the pads, switches, and landing cells
   fixed by hand; the routes and endings were then trimmed by hand.
4. **Map island** for Windy Peaks after Frost on the suggested path. — built: Windy Peaks
   takes the rocky `peaks` look; Wind Lab moves to the lab colors beside Ice Lab as extras.

**Next release — Starfall** (gravity flip), planned in a grilling session 2026-11-01:

- *Goal:* "two worlds": holding two maps in your head, where a hole below is floor above.
  Success = it beats Windy Peaks as my favorite chapter, through spectacle; the spectacle
  comes from the look (a starfall night), not from long animations.
- *Why gravity:* the user's own vision for the next biome. Shape-changing blocks (grow/shrink,
  split) wait for the biome after; a later chapter may cross the two.
- *Scope:* same as Windy Peaks: camera prototype, a ~6-level lab, ~8 handmade levels, a map
  island. Mix: base layer, pads, belts. Not in scope: generator, editor, sound, ice, shape
  change. No time pressure; the user is the only player. Deep core changes are fine.
- *Rules* (**frozen** 2026-11-01 after the gravity lab playtest: "it does feel predictable now"):
  - Every level may have a **ceiling layer** directly above the ground, same coordinates.
  - **Flip tiles** fire like pads: resting standing on one, or lying fully on two; lying half
    on one is safe. A flip moves the block to the other layer **directly above (or below), in
    the same pose**. Each layer has its own flip tiles. A flip never re-fires in the same move.
  - Nothing on the other side → the block **falls into the sky**. Rolling off a ceiling edge
    or breaking a ceiling fragile tile does the same.
  - Flips join the belt/pad chain: a push or a flight that rests the block on flip tiles flips it.
  - Pads fling within the current layer. Switch groups are shared: a switch on one layer can
    drive bridges on the other.
  - The goal can be on either layer.
  - *One-trick guard* (`signature: gravity`): two distinct flip uses among flip up, flip down,
    lying flip, belt→flip, flight→flip, cross-layer press.
- *Depth:* round trips (go up, change something, come back down), hole alignment, cross-layer
  switches, pose setup for the flip.
- *Feel:* flips of about 0.8s (changed from ~0.5s in the Starfall theme grilling, 2026-11-02). Controls stay screen-relative (as with Q/E rotation). A
  **hold-to-peek** key swings the camera over to look at the other layer.
- *Pre-mortem:* "disorienting and unreadable". The turning camera mirrors the ceiling relative
  to the ground, which works against two-worlds mapping. Hence the prototype first.
- *Theme:* starfall night: dark blue sky, stars, glowing flip tiles. Name: **Starfall**.

1. **Camera prototype**: one throwaway two-layer level with live toggles for camera mode
   (turning camera vs fixed camera with the block seen hanging under a see-through ceiling)
   and for how much of the other layer shows (hidden + peek, landing markers, always ghost).
   The user plays it and picks; the choice is locked in before the lab. — first build
   2026-11-01 (toggles: turning vs fixed camera; hidden / markers / ghost). Playtest: both views
   showed the other floor in a way the user liked, but the floating ghost blocks were clutter, hid
   the floor plan, and looked like missing tiles and switched-off bridges; the landing spot was
   hard to see. Rebuilt as the blueprint view (an outline of the other floor on yours, green/red
   beams over flip tiles), then, after the next playtest, as the **shadow view** (awaiting
   playtest): one camera, which turns over with you; the other floor is hidden and casts a **soft
   shadow onto your own tiles** wherever it's directly over (or under) them, none over open sky,
   plus a **very faint outline** of the whole other floor (open sky included);
   **violet landing marks** (like the pads' blue ones) sit on each tile a flip lands on, so you see
   them on your own floor and, holding **Space** to swing over, on the other floor. (Changed 2026-11-02 in the
   Starfall theme work: the shadow is softer and the outline is gone; see the Playtest log.) Flip tiles show
   nothing about safety. Night lightened. `gravlab-01` has a trap flip tile with nothing above it.
2. **Gravity lab** (~6 levels, one per rule question): flip up/down, falling into the sky,
   lying flip, cross-layer switch, belt or pad onto a flip tile, a round-trip combo. One
   playtest round, then the rules freeze. — built 2026-11-01 on the shadow view (locked in after the
   camera prototype), awaiting playtest: `gravlab-01` Up and Over (the prototype level: flip up,
   ceiling switch raises a ground bridge, flip down, flip up onto a ceiling goal; par 11),
   `02` Open Sky (one of three rings drops you into the sky; par 10), `03` Lie Down to Rise
   (lying flip onto fragile planks; par 11), `04` Upstairs, Downstairs (a switch on each floor
   drives the other's bridge; par 10), `05` Conveyor Lift (belt→flip, then a pad flight onto a
   ring pair flips you down mid-move; par 8), `06` Round Trip (all of it, plus a trap; par 13).
   The `gravity` signature and its guard (two distinct flip uses) are implemented.
3. **Starfall chapter** (`star-01`…`star-08`) and its map island. — built 2026-11-01, **approved
   in playtest 2026-11-01** after one rework round: `src/levels/star.txt`, all solved at par in headless Chrome, every guarded level
   using flips in at least two ways. Starfall sits after Windy Peaks on the map path; the three
   labs are a column of smaller extras islands.

   | Level | Name | Par | States | The idea |
   |---|---|---|---|---|
   | 01 | First Light | 6 | 49 | Teaching: two rings two rolls away, one under open sky (hold Space to see which) |
   | 02 | Over the Gap | 11 | 16 | Teaching: the first round trip, up over a gap and down on the far side |
   | 03 | Lie Low | 18 | 98 | Two lying flips, both onto fragile planks: up across a column of rings, down across a row |
   | 04 | Slingshot | 18 | 61 | Pad flights land on ring pairs: up lying, later down beside the goal |
   | 05 | Night Conveyor | 21 | 79 | Three islands, two ceiling spans; a belt hands you to a ring |
   | 06 | Ring Road | 22 | 177 | A switch on each floor for the other's bridge; lying drop onto planks; flip onto the goal |
   | 07 | Two-Floor Maze | 28 | 176 | Neither floor reaches alone; the bridge below starts raised and the switch above is on your path; belts lift you to the last ring; two trap rings |
   | 08 | Starfall | 34 | 372 | Finale: three switches in a chain across the floors; belt feed, pad onto rings, a second round trip at the far end |

   Designed by fixing each idea's skeleton by hand (rings, switches, landing cells) and letting
   the search shape only small areas around it; open templates produced parity shuffles that
   padded par without adding ideas. A third switch-backbone level was dropped for variety.

**Next release — Toybox** (shape-changing blocks), planned in a grilling session 2026-11-01:

- *Goal:* "right shape here": a gap only a long block spans, a spot only a cube can use.
  Success = a fresh rhythm: long stretches where you move differently, not one-step detours.
- *Scope:* the **cube (1×1×1)** and the **tall block (1×1×3)**. Split and paint were cut to the
  following biome (scope challenge: four shapes in eight levels would each be taught and dropped).
  Mix: base layer and belts only (pads, flips, ice stay in their chapters). Same process as
  Starfall minus the camera prototype: rules, solver, and animations with tests → a ~6-level
  lab → playtest → rules freeze → 8 levels and a map island. No rush; the user is the only player.
- *Rules* (**frozen** 2026-11-01: the user went on to the chapter after the shape lab with no rule notes):
  - **Shape switches** set the block's shape when it **stands** on them (lying across is safe):
    cube, tall, and a **normal** switch to turn back. A shape change happens where you stand, so
    it always fits.
  - Levels may **start** you in any shape.
  - **Cube:** rolls one tile at a time, always standing; **light**: never breaks fragile tiles,
    never presses heavy switches (soft switches yes).
  - **Tall:** tips three tiles at a time; lying, it rests on its **two ends**, so it **spans a
    one-tile gap** (and, lying across two parallel rails, can roll along the gap between them); breaks fragile tiles only standing (like normal); **extra-heavy switches**
    respond only to a standing tall block.
  - **Goal:** normal standing by default; a goal can be **marked** for a cube or a tall block.
  - Belts follow the whole-block rule (a lying tall block moves only if all three tiles are belts).
  - *One-trick guard* (`signature: shapes`): two distinct shape uses among become cube, become tall,
    back to normal, cube crosses fragile, tall spans a gap, tall presses an extra-heavy switch,
    shaped goal.
- *Readability from day one:* each shape switch shows a small model of its shape; a shaped goal's
  marker takes that shape.
- *Pre-mortem:* too many rules, same rhythm, unreadable (and fiddly split, now deferred).
- *Theme:* toy blocks in a sky playroom. Name: **Toybox**.
- *Kept for the split/paint biome:* a swap key steers one cube at a time; cubes merge on touch and
  must merge before the goal; wrong-color gates are walls (pushing into one does nothing, no move
  counted); each split cube can carry its own color.

1. **Shape rules**: rules, solver, animations, design tools, tests. — built 2026-11-01: blocks
   carry a length (1 cube, 2 normal, 3 tall) that rolling, support, weight, the solver state,
   the design tools, and every animation follow; every existing level keeps its par. Level text:
   `c` `t` `n` shape switches, `X` extra-heavy switch, `C` `T` goals marked for a cube or a tall
   block, and a `shape: cube|tall` field to start in a shape. Shape switches show a toy model of
   their shape; marked goals float that shape; shape changes squash and stretch. A demo level,
   `shapelab-01` (Shape Demo, par 11), on a Shape Lab extras island uses every shape idea once.
2. **Shape lab** (~6 levels, one per rule question), one playtest, rules freeze. — built 2026-11-01,
   awaiting playtest: `shapelab-01` Shape Demo (every idea once; par 11), `02` Born Small (start
   as a cube, cross planks, go tall to span the gap, tall goal; 7), `03` Featherweight (cube
   crosses planks, but only the normal block presses the heavy switch; 17), `04` Rails (a lying tall
   block rolls along two rails over a gap; 16), `05` Shape Belts (a cube is pushed back every move;
   a tall block straddles the belt; 10), `06` Heavyweight (tall lands on the extra-heavy switch
   across a gap, then back to normal for the bridge; 18).
3. **Toybox chapter** (`toy-01`…`toy-08`) and its map island. — built 2026-11-01, **approved
   in playtest 2026-11-01** after two rework rounds: `src/levels/toy.txt`, all solved at par in headless Chrome, guarded levels using
   shapes in at least two ways. The map path now zigzags Tutorial → Frost → Windy Peaks →
   Starfall → Toybox, with the four labs as a column of smaller extras islands.

   | Level | Name | Par | States | The idea |
   |---|---|---|---|---|
   | 01 | Building Blocks | 6 | 25 | Teaching: become tall, tip across gaps onto a tall goal |
   | 02 | Tiny Steps | 17 | 84 | Teaching: become a cube and thread a plank maze to a cube goal |
   | 03 | Long Reach | 21 | 165 | Start tall and stay tall: land on the extra-heavy switch, tip across its bridge |
   | 04 | Light and Heavy | 26 | 320 | Cube down a plank corridor; normal lies across planks to stand on a heavy switch among them |
   | 05 | Conveyor Toys | 20 | 114 | Start as a cube riding belt pushes, then tall to the tall goal |
   | 06 | Shape Shifter | 26 | 336 | Cube over the plank, then a long tall run over gappy ground; a decoy switch at the start |
   | 07 | Heavy Lifting | 32 | 528 | Tall reaches the extra-heavy switch past the gaps, back to normal for the bridge |
   | 08 | Toybox | 39 | 585 | Finale: tall, extra-heavy, cube over planks, normal, bridge to the goal |

## Roadmap: the better peek (built with Starfall's theme)

**Planned with Starfall's theme: a better peek** (asked for by the user 2026-11-02; they love flip
gravity, and this would help a lot). While holding Space to look at the other floor:

- **Blinking block outline:** an outline blinks on the floor you're looking at, showing where the
  block would be if it were on that floor: directly across from the block, same cells and pose. It's
  separate from the violet preview of where a flip would land, and both can show in one peek.
- **Ghost of your floor:** the floor you're on stays visible as a very faint, transparent ghost.
  Today it disappears completely during a peek.
- **The real block hides** during a peek, and the outline stands in for it.

This changes only the view, not the rules, so pars and solutions stay the same. It also applies to
Gravity Lab. Built: your floor is pressed flat onto the floor you're viewing, cell for cell, at 24%, since in its real place it
showed up elsewhere on screen and said nothing about what lines up. The outline is flat, the block's footprint flush with the
tile rather than its full shape (the user's call: it only has to answer "which cells am I over?"), and it's white on
Starfall, dark blue on Gravity Lab's pale sky. The flip landing preview is flattened the same way, in violet, so white
means where you are and violet where a flip lands. Still open: how faint the ghost can be while the floor you're viewing stays easy to read.

## Roadmap: the older-worlds pass (Windy Peaks, Frost Isle, First Glade)

**After Starfall's theme: a pass on the older worlds** (decided by the user 2026-11-02, who felt Toybox's
look is well ahead of the others). Toybox has things they lack: objects you can name, something moving
with a purpose, things close to the board that frame it, and a sense of place. So each world gets **one
landmark, one thing that moves with a purpose, and something framing the board**, rather than more
decoration. Starfall is built to this standard from the start, then the pass runs Windy Peaks → Frost
Isle → First Glade, a quick grilling for each so the user picks the landmarks. Ideas to start from, none
decided: Windy Peaks, windmills on the spires and a circling airship; Frost Isle, a lighthouse or cabin with
a lit window and a cable car around the board; First Glade, a giant tree with a treehouse and circling birds.
Each addition passes the usual checks (gaps stay readable, runs well on the user's laptop), and First Glade,
which the user already loves, must not lose what works. The *Scenery* rule above widens to allow these framing pieces.

**Windy Peaks pass**, settled in a grilling session 2026-11-02: wild, untouched peaks with no sign of people, where
the wind has carved great stone arches and giant birds nest on top of them. The gale funnels through vents in the rock,
which is why pads fling you. What the world lacked most: a sense of place. The biggest fear: losing its clean, airy feel.

| Area | Decision |
|---|---|
| Landmark and framing | Four different wind-carved rock structures, one per side of the board at middle distance in light haze: three arches of different proportions (lopsided with a nest on its shoulder, low and wide, tall and narrow) and a family of pillars. They stop below board level, so nothing covers a tile |
| Nests | At most two, on opposite sides (the lopsided arch and the pillars), small and sunk into rock ledges, in weathered sticks, with two or three large eggs and heather only outside the rim, so they belong to the stone (changed after the samples: a nest on each side looked strange and too dominant) |
| Moving piece | A flock of medium storybook birds, mostly soft grey and white with a small warm accent, crossing the whole backdrop in a V every 20 to 30 seconds, off screen at both ends (changed after playtest: flying into a nest and vanishing killed the mood) |
| Color | Pink-violet mountain heather on the arches and nest ledges |
| Banners | Removed, since they imply people; long white streamers of cloud pour off the peak tops instead |
| Unchanged | Tiles, grey stone, sky, gusts, pads, interface. Wind Lab keeps its neutral look |
| If it runs slowly | Cut grit first, then cloud streamers, then deep clouds, with gusts and birds last |

- **Sign-off:** switching between the two, Windy Peaks no longer feels behind Toybox, and a replay of `wind-06` and
  `wind-08` has no misread gaps.
- **Build order:** one arch with its nest and one bird up close for approval → the ring, streamers and flights →
  sign-off → ask before it goes live.
- **Risks to watch:** nests reading as odd clumps (if so, try bare arches and birds simply crossing); fake-looking birds
  (if they fail twice, smaller silhouettes); the arches crowding the airy feel (push back or add haze first); rock arches
  suggesting a desert; streamers echoing Frost's spindrift; white birds blurring with the gust streaks.

Status: live 2026-11-02; the user sent it live without notes on the sign-off questions (still behind Toybox? misread gaps? the fade on rotate, streamer strength, frame rate), so those stay open if they come up in play. Each view shows only
the structure behind the board, and the others fade out as the view turns, since at the screen's edges they were cut-off
pieces, nearer and so larger.

**Frost Isle pass**, settled in a grilling session 2026-11-02 and changed after the samples: the live dawn backdrop stays, with reindeer
walking one long snowy ridge behind the board. Long ago someone mined here, which explains the belts, and now only reindeer walk these
ridges. What the world lacked most: a sense of life. The biggest fear: ice getting harder to read (179 ice tiles).

| Area | Decision |
|---|---|
| Backdrop | The live ridges, sky and haze are unchanged. A great summit in a turquoise bowl was tried and dropped: the user preferred the old backdrop, and the turquoise read as a color rather than a mountain |
| The ridge | One long snowy ridge around the board, painted like the ridges around it. Only the far part shows; the rest fades out, so it follows the camera |
| Moving piece | Four small groups of reindeer (three each) always walking the crest, evenly spaced, as dark silhouettes with a warm dawn rim. The camera only sees the far part, so four keep one in view |
| The old mine | Rusted cable towers with slack cable just behind the path, along the whole ridge |
| Dropped | The far ice spires: the live ridges already frame the board |
| Unchanged | Tiles, snow, sky, flakes, sparkles, interface. Ice Lab keeps its neutral look |
| If it runs slowly | Cut spindrift first, then drifting cloud, then flakes, with reindeer and sparkles last |

- **Sign-off:** does it feel alive? And a replay of `frost-04` and `frost-08` has no misread ice or gaps.
- **Risks to watch:** reindeer pulling the eye (slow them or push them out); the ridge crowding the top of the screen.

Status: reindeer approved in the samples ("they look fantastic"; "very convincing"); the ridge and towers went live 2026-11-02. The user sent them live without notes on the sign-off
questions (does it feel alive? ridge contrast behind the top of big boards, the towers, frame rate), so those stay open if they come up in play.
On the largest levels the reindeer walk close to the top buttons, which the user is fine with for now.

**First Glade pass**, settled in a grilling session 2026-11-02: the glade stays as it is, with one giant old tree rising behind the
board and a few butterflies in the air. The biggest fear: spoiling the calm of a world the user loves, which also teaches new players.

| Area | Decision |
|---|---|
| Landmark | Eight soft grassy hills rising from the canopy around the board, crowned with old trees and a few bushes, each different: four near ones so a hill stands behind the board in every camera view, four smaller further out at the sides. A great old tree crowns the one behind a level's starting view. Near the top of the screen, never covering a tile (changed after the samples: one tree alone stood out, "but not in the best way"; on a mound the user liked the style, and asked for several around the map) |
| Moving piece | Three orange-and-black butterflies, a redder orange than the amber bridges, each wandering its own patch of air beyond the board's bounds and never crossing a tile |
| Unchanged | Treetops, sky, leaves, pollen, tiles, interface. Labs and generated levels keep their neutral look |
| If it runs slowly | Cut canopy sway first, then leaves, then cloud shadows, then pollen, with butterflies last |

- **Sign-off:** replay `tutorial-03` and `tutorial-05`: is it still as calm as before, and does the tree make you want to look at it?
- **Build order:** one tree and one butterfly on a real level for approval → the rest of the butterflies → sign-off → ask before it goes live.
- **If the tree misses after two tries:** drop it and keep the butterflies, since the user loves the backdrop without it.
- **Risks to watch:** the tree looking fake or pasted on; a busier first screen; butterflies seeming to avoid the board; orange near the amber
  bridges; staying our own design rather than a copy of a famous film's tree.

Status: live 2026-11-02, sent live without notes on the sign-off questions (still calm? eight groves too many? bushes under retracted bridges, butterflies
near the top and bottom of the screen). Only the great tree is built finely, and groves out of view aren't drawn. At about 830k triangles this is the
heaviest world, and it runs at 59 to 61 fps on the user's laptop with no stutter (read 2026-11-03), so the other worlds should be fine too. If it ever suffers, reduce the crowns' detail first, then drop the far four groves.

That finishes the older worlds' pass. Next: see *Start menu, tutorial section and a new First Glade* below.

## Roadmap: main menu, Tutorial and How To Play (built and approved 2026-11-03)

**Now: main menu, Tutorial and How To Play** (settled in a grilling session 2026-11-03). Order of work: these three → First Glade as a real biome (its mechanic gets
its own grilling, lab and rules freeze) → the 20-level batches → split + paint (assumed; not raised by the user). **Success:** a friend given only the link can solve
early levels unaided within about ten minutes. **Test:** before the push, watch one first-time player on the user's laptop for ten minutes without helping.

Build order, with a playtest after each: (1) main menu, Esc menu, Labs and Settings; (2) Tutorial; (3) How To Play.

- **Main menu:** a bare URL always opens it; `?level=` links skip it. On one fixed sky island behind the title, a live 3D block drops onto a small switch-and-bridge puzzle and solves it on the real rules, over and over. Entries: Campaign (opens the sky
  map), Tutorial, How To Play, Labs, Settings. Tutorial stands out until a lesson has been solved, with no other nudge; the user accepts that some players will skip it.
- **Removed for now:** Easy and Medium, and the Stats panel. The generator, its tests, `?tier=` links and saved numbers stay, so this is easy to reverse.
- **Labs:** leave the sky map for their own screen, reached from the main menu.
- **In a level:** Menu and Map buttons. L is no longer a shortcut. Esc opens a menu that keeps the level as it is: Resume, Map, Restart, Settings, Exit. Exit returns to the
  main menu with no warning, and the level starts fresh next time. The user expects these menus to grow later.
- **Esc elsewhere:** goes back one screen; it does nothing on the main menu.
- **Settings:** a read-only controls list, on both menus, and a button to reset all progress, which asks "Are you sure?" first.
- **Tutorial:** a biome outside the story and off the map, on its own tileset in a plain studio (soft shadow, no horizon; dark slate since the first playtest, planned as white). Five rebuilt levels, one rule each, par about
  12 or less: rolling and the goal, standing versus lying, fragile tiles, soft switches and bridges, heavy switches. It keeps `tutorial-01`…`05`. Prompts react during play, in the
  Tutorial only. The main menu's Tutorial button opens its own level list (changed 2026-11-03; it used to jump straight to the next unfinished lesson). The last lesson leads to "Start the Campaign", which opens the sky map. Scored done or not done, with no stars or par.
- **How To Play:** a main-menu page only, deliberately not in the Esc menu. One entry per mechanic, each with a description and a watch-only looping preview running on the real
  rules. Basics are always shown; other entries unlock when a level using that mechanic is reached (labs count, and so do levels already solved), and locked ones show as `???` rows.
- **Release:** commit to `main` with no pushes, even for a live bug, until the user has approved these three and First Glade's first five levels. Done: all of it went live 2026-11-05, without the first-timer test, at the user's request. A new player's first ten minutes are still unobserved.

Claude recommended otherwise on three of these, and they stand as the user's calls: How To Play in the Esc menu (as it is, a stuck player gives up their moves to read it), asking once on
the first Campaign click (the biggest risk to the success goal; the first-timer test should show whether it's needed), and keeping a way to ship live fixes.

Risks to watch: a stray loss of keyboard focus now opens the Esc menu, since focus loss stands in for Esc under Vimium; the preview's cost is unknown, since `World` owns the only
renderer; silent unlocks may go unnoticed; and the release is large and long-held.

**The Tutorial as built** (2026-11-03, awaiting playtest). It replaces the stand-ins: the old five levels (still in git history), First Glade's forest look on them, and stars. First Glade's world stays in the code, waiting for its new chapter, and can be previewed with `?level=tutorial-01&theme=forest`.

| Level | Name | Par | The rule | The mistake it invites |
|---|---|---|---|---|
| 01 | First Steps | 7 | Rolling and the goal | Lying across the goal doesn't count |
| 02 | Line It Up | 8 | Standing and lying: a sideways roll shifts a lying block one tile | Rolling straight never lines up with the one-wide ledge |
| 03 | Old Planks | 10 | Planks break under a standing block | Rolling straight ahead from the start snaps them |
| 04 | Drawbridge | 8 | A soft switch answers any touch, and each touch flips the bridge | Touching it twice lowers the bridge |
| 05 | Full Weight | 8 | A heavy switch answers only a standing block | Rolling straight ahead lies across it, and nothing happens |
| 06 | Stone Walls | 8 | A raised wall stops a roll, and isn't a move. A press flips every wall and bridge of its color | Rolling right from the start bumps the wall two tiles away; touching the switch twice brings the wall back up |

- **Prompts** (`src/levels/lessons.ts`): one line at the top of the screen, worked out from the block's position and the last move, so undo and restart need no bookkeeping. A fall shows its line in the fall panel instead; a win shows the rule to take away.
- **Scoring:** no moves, par or stars on screen. A solved lesson saves as one star, which only says it's done; par stays in the file for validation.
- **The studio:** a dark slate page in the block's own color family, blue-grey tiles, the slate block and the usual mechanic colors, with the board's soft shadow on an unseen floor below it. Retracted bridges have a much fainter fill here. It started white (the plan's "plain white studio"), which the user found painfully bright; see the Playtest log.
- **Self-contained** (asked for by the user after the first playtest, 2026-11-03): the main menu's Tutorial button opens a list of the five lessons, showing Done, Locked or Playing. In a lesson, the Map button and the Esc menu's Map entry become Levels, which opens the same list. Each lesson unlocks when the one before it is done, and the first is always open. A lesson that isn't done yet has no Next lesson button, and N does nothing. `?level=` links still open any lesson, so playtest notes and shared links keep working. The one exit is the last lesson's "Start the Campaign".
- **Still to judge:** the first-timer test before the push is the real check on the prompts.

**How To Play as built** (2026-11-03, approved in playtest). The page has two groups: Basics (rolling and the goal, standing and lying, old planks, soft switches and bridges, heavy switches, stone walls), always shown, and Mechanics (ice, belts, launch pads, flip rings, the cube, the tall block, extra-heavy switches, toppling hedges), each `???` until opened. The walls and hedges entries were added 2026-11-05, with the list's rows tightened so all fourteen fit an 800-pixel window without scrolling; shorter windows get a thin scrollbar.

- **Previews:** the risk was the cost, since `World` owns the only renderer. Instead of a second renderer, the page is laid over the one world, which plays the selected entry's scene, as the main menu plays its own. So there's one preview at a time, it follows the selection, and it costs no more than a small level. Scenes are written-out moves on the real rules (`src/levels/mechanics.ts`), checked by tests to end in a win and to show what they describe. One scene shows every way its mechanic behaves, in one loop (the user's note after the first playtest, when pads and belts each showed one case): pads fling standing and hop lying; belts push a standing block, push a lying one, and leave one lying half on; ice grips and slides; rings flip up standing and down lying; a soft switch goes up, down and up; a lying block does nothing to a heavy switch.
- **Look:** the Tutorial's dark studio for every entry, not each mechanic's own world: it loads instantly when switching entries, and keeps attention on the rule.
- **Unlocks:** reaching a level opens the entries for what's in it, saved as `seen` in the progress; labs count, and so do levels solved in older saves. A reset clears them. Unlocks are silent, as planned.

## Roadmap: the Glade Lab and First Glade's 20 levels as built (2026-11-05)

**The Glade Lab as built** (2026-11-05; approved in playtest). Rules are in *Mechanics* under *Walls and hedges*. Both assumptions above hold as built: undo and restart bring fallen hedges back, and only a roll can topple a hedge. Unlike the other labs, it plays in First Glade's forest, since a green hedge has to read on that grass.

| Level | Name | Par | States | The rule question |
|---|---|---|---|---|
| 01 | Bump | 8 | 35 | Is a bump clear, including from two tiles away and across a gap? |
| 02 | One Press, Every Piece | 14 | 22 | Does one press flipping walls and bridges together read? |
| 03 | Wait For Me | 7 | 16 | Does a wall waiting under the block, then rising behind it, make sense? |
| 04 | Timber | 11 | 22 | Does a hedge turning a gap into floor read, with the standing and lying rules? |
| 05 | Which Way | 19 | 105 | Does choosing which side to knock from make hedges a real decision? 31 of 138 reachable states are dead ends, all from wasting a hedge, and it should be obvious from the board |

- **Calls Claude made beyond the grilling, confirmed by the user in the first playtest:** the far tile of a roll counts as rolling into something; a wall beyond a gap holds the block instead of letting it fall; a hedge falls from two tiles away. A hedge can't fall onto a hedge still up or a raised wall: Claude's call, and the user approved the lab without changing it.
- **Look:** a raised wall is dirt-grey stone brick with notched corners and a darker deck between them, all without color. It sinks until that top is flush with the ground. A thin line of its switch's color in the ground around it is the only thing naming its switch: Claude kept it after the user asked for the color off the wall, since several colors in one level would otherwise be unreadable, and it's easy to remove. The hedge is dark leaf clumps, leaving a dark mat of leaves on its own tile and, over a gap, a thick slab of leaves level with the floor. First Glade's block is now pale, smooth stone (`0xc4bfb2`, was amber `0xe2a94f`), lighter than the brick so the two don't blur. The brick is shared across worlds for now; each world can restyle it when it first uses walls.
- **Format:** `H I J K` walls starting up in groups 0 to 3, `h i j k` starting down, `a b d e` reversed bridges, `&` a hedge, at most 9 per level, and never on the edge of the grid (validation asks for padding, so a hedge never falls off the grid looking just like one falling into a gap).
- **Also fixed:** an animation started by another animation was silently dropped, which froze the game after a knock. The fix is in the frame loop, so it applies everywhere.
- **Risks to watch:** a wall can hide what's behind it from the default camera (accepted, but `gladelab-02` was re-laid east to west after its north lane vanished behind the block and a wall).

**First Glade's first five levels** (built 2026-11-05, approved in playtest), in `src/levels/glade.txt`. First on the sky map, in the forest world, with a "Hedges" badge and no one-trick guard.

| Level | Name | Par | States | Dead ends | The idea |
|---|---|---|---|---|---|
| 01 | Garden Gate | 10 | 47 | 0 of 52 | Walls recap: stand on the X to lower the wall, then lie across the planks beyond |
| 02 | Fair Trade | 10 | 18 | 0 of 17 | One press lowers the wall and pulls the bridge in, so fetch the far switch first |
| 03 | Timber | 11 | 22 | 0 of 25 | Hedges into gaps: the first falls at the first roll, the second needs you upright first |
| 04 | Which Way | 12 | 78 | 31 of 95 | The roll straight down from the start wastes the hedge; it has to go east, from the west |
| 05 | Behind the Wall | 14 | 124 | 69 of 213 | A hedge to reach the switch, which lowers the wall on the only side that sends the far hedge east. The open way up to the far hedge is the trap |

- **Dead ends:** all of them come from wasting a hedge, which the board shows. The plan allows that only if it's obvious, so it's a playtest question, especially with 05 at about a third.
- **Board layout:** what matters sits to the side of or in front of the block, since a standing block or raised wall hides what's directly north of it. One exception: 05's floor north of the far hedge, which only catches a hedge sent the wrong way.
- **The maze level** the user wants belongs later: these five stay beginner friendly.

**First Glade's second five levels** (built 2026-11-05, approved in playtest: "I like the levels"). The user asked for a clear step up after the first five. Their hints give the idea, not the route.

| Level | Name | Par | States | Dead ends | The idea |
|---|---|---|---|---|---|
| 06 | Half On | 14 | 32 | 0 of 31 | Press while lying half on the near wall, or it shuts you out. It rises behind you, so a hedge has to build the way back |
| 07 | Front of the Line | 19 | 62 | 0 of 62 | Two hedges in line won't fall from the west. Topple the front one sideways from the north, which also opens the way to the switch |
| 08 | Both Banks | 18 | 86 | 16 of 88 | A two-wide gap needs a hedge from each bank. The switch lowers the wall to the goal but pulls in the only bridge over, so the gap is the way back |
| 09 | Round the Back | 17 | 41 | 12 of 40 | One X switch trades two walls that are never both down. Through the first, topple the hedge to build a way round to the second. Toppled from the far side, it's wasted |
| 10 | Three Hedges | 25 | 156 | 35 of 210 | Each hedge has one job: south to connect the two halves, east and west to close the two-wide gap. Combines 07 and 08 |

- **Method:** lanes one tile wide between junctions three tiles apart. A lying block can't shift sideways in a lane, so par comes from routing, not parity shuffles. `scripts/design/search.ts` on open rooms did pad par that way (26 moves for two presses), and a random lane search found one good seed, 09, and nothing for the finale, so 10 is by hand.
- **Par doesn't climb evenly:** 06 and 09 are short, because each turns on one idea rather than on length. The playtest should say whether they feel harder than 05 regardless.
- **Sky map** (fixed and approved 2026-11-05): stones are smaller, an island sets two rows up to 12 stones and three after that, growing wider rather than taller (7 across at 20), and the two rows of islands sit further apart. Checked with a throwaway build of five 20-stone islands at 1024×640, 1280×800, 1366×650, 1600×800 and 1920×950: no island overlaps another or the caption. The tails of the bottom row do slip behind the caption.
- **Board size past level 10** (Claude's recommendation 2026-11-05; the user went ahead without changing it): the user wondered whether a lack of tiles will limit the puzzles, without wanting the board to look far away. First Glade has been well under what the other worlds use (`glade-10`: 13×9, 28 tiles; `frost-08`: 21×9, 79 tiles; `wind-08`: 20×13, 63 tiles). Calculated tile width at 1280×800, facing and after a quarter turn: 13×9 62/49 px, 15×11 55/42, 17×11 50/37, 21×9 44/30, 20×13 43/32, 25×13 36/25. Proposed caps: 15×11 for levels 11 to 15 and 17×11 for 16 to 20, with the maze at the larger size. In a lane layout that takes junctions from 15 to 24. Keep the camera as it is.
- **The maze level** isn't in this batch. First attempts on open floor looked scattered rather than like a maze. It needs stone corridors, which tall walls can hide, so it's better planned as its own level in the second half.

**First Glade's third five levels** (built 2026-11-05, approved in playtest: "well made", and "levels 12 through 15 are great").

| Level | Name | Par | States | Dead ends | Size | The idea |
|---|---|---|---|---|---|---|
| 11 | Two Gaps | 21 | 166 | 74 of 224 | 11×6 | One hedge sits beside two gaps. Rolling down from the start bridges the wrong one. Sent east, a second hedge reaches the switch side |
| 12 | Soft Steps | 28 | 110 | 30 of 151 | 12×9 | Two soft switches in the first lane, each flipping the walls as you pass, so when you touch them decides which lanes are open |
| 13 | Not All at Once | 22 | 447 | 178 of 551 | 15×9 | A full lattice of lanes and three switches, one of them not needed. A soft switch has to be crossed an extra time to set the walls right |
| 14 | Three Colors | 28 | 222 | 72 of 268 | 12×9 | The first level with three colors, with bridges that swap places. Two hedges go first, then a run of presses |
| 15 | Last Clearing | 29 | 562 | 212 of 561 | 15×9 | Three hedges and six switches, where the last two walls depend on what's been pressed |

- **Method:** 11 is by hand. 12 to 15 came from a throwaway hill-climb over lane lattices, then a greedy pass removing whatever didn't change par (13 keeps its unused lanes as choices). The first scoring rewarded activity, and produced "switch soup": presses everywhere with no reasoning behind them. What worked was counting a piece only if removing it changes the solution, capping hedges, and not rewarding a press undone straight away. The script isn't in the repo; `scripts/design/search.ts` is still the tool for open floors.
- **Watched for, and fine:** these four are less hand-shaped than 06 to 10, which could have made them easier to just try, but they're the ones the user liked best. 13 and 14 each need a soft switch touched an extra time, which could feel fiddly. Dead ends reach about a third in 11, 13 and 15. Every dead end comes after a hedge has fallen, since switches can always be pressed again, but in these levels a hedge can also fall at the wrong time, not only the wrong way, so "obvious from the board" needs checking.
- **Layout:** 12 was flipped north to south after the first screenshots, when the block hid a switch, a wall hid the X and a hedge hid the goal.

**First Glade's last five levels** (built 2026-11-05, awaiting playtest).

| Level | Name | Par | States | Dead ends | Size | The idea |
|---|---|---|---|---|---|---|
| 16 | Upstream | 30 | 180 | 58 of 179 | 14×8 | Two colors, with switches passed more than once on the way to two hedges |
| 17 | Combination | 30 | 322 | 0 of 466 | 13×8 | Three colors and three switches in one short lane: set the combination, then leave, because the walls at the end only take one setting |
| 18 | Crossed Lines | 38 | 359 | 107 of 409 | 13×11 | From one spot, two hedges fall opposite ways, and round switches open the long way round |
| 19 | The Long Road | 40 | 1715 | 518 of 2089 | 14×11 | Some hedges just stand in the way, so spending them is right. Knowing which ones is the puzzle |
| 20 | The Hedge Maze | 39 | 2213 | 0 of 3467 | 16×10 | The finale: lanes between low stone, with tall walls and hedges changing the route. No dead ends at all, so the player can wander |

- **Par:** 19 is one move longer than the finale. The finale is bigger by states, and it's a different kind of level: exploring, with nothing to fear.
- **Low stone** (new, for the maze): a wall whose color has no switch in the level never moves, so it's drawn low (0.42 high, under half a lying block; at 0.8 it still hid the east-west lanes) with no colored line, and joined into one mass. Tall walls hide what's behind them, and a maze of them can't be read. The rules don't change: it's still a wall, and a bump is still free. `gladelab-01`'s walls now look like this too.
- **Draw calls:** the finale took 1,127 draws at first, about three times `glade-15`. Merging the low stone and its soil brought it to 677 (`glade-15` 355, `glade-19` 602, `frost-08` 493). The frame rate on the user's laptop is still to be read.
- **Tools:** `scripts/design/lattice.ts` and `strip.ts` are now in the repo, since the method that built 12 to 15 and these will serve the other biomes' new levels.

## Playtest log: 2026-10-31 to 2026-11-03

**2026-10-31 — tutorial + ice lab.** Tutorial 01–05: all good as teaching levels; keep as
is. Ice rules raised no complaints → frozen. Notes:
- lab-01, lab-02: tricky but fair; using ice to line the block up for the goal was the
  highlight. lab-04: solid, simple combination.
- lab-03: belt direction was hard to read → belts now color-coded by direction with bigger
  chevrons.
- lab-05 played "like lab-04": the one-move slide→push→slide chain didn't stand out. Frost
  levels that rely on chains should make the moment visible (setup, framing, or pacing).
- Browser extensions (Vimium) swallowed N, D, R → the game keeps a hidden read-only field
  focused so vim-style extensions and find-as-you-type pass keys through.

**2026-10-31 — Frost Isle.** 01–04 and 08 solid: bigger maps (02), combos (04's belt
ratchet), and 08's complexity landed. Vimium fix confirmed. Notes:
- 05–07 felt "meh" and blurred together: each showcased one gimmick on a small, nearly
  linear map. Redesigned around a two-mechanic idea each: 05 Switchback (the switch also
  raises posts in the rink, so the return trip slides differently), 06 Heavy Footing (a
  belt delivers you upright onto the heavy switch), 07 Relay (two boosters, down and back
  out).
- frost-05's description promised a double-back its solution never made → descriptions
  are now re-read against the solver trace whenever a level changes.
- The one-move chain still didn't register → belts now flare when they push the block.
- Lesson: a high explored-state count from the search often means maze clutter, not a
  puzzle; judge levels after stripping to the cells the solution touches.

**2026-10-31 — Frost redesigns.** 05 (switch also raises the posts), 06 (belt delivers you
onto the heavy switch) and 07 (two boosters) all landed, each with its own spin; the
chapter climbs steadily. Notes:
- frost-08 now felt too simple next to them → rebuilt as a finale that combines the
  chapter's ideas: fragile stepping stones, a soft switch raising rink posts, a belt
  delivering you onto a heavy switch that opens the gate (two bridge groups), and a decoy
  booster chute. 22 moves and 387 states, against 07's 18 and 66.
- The belt flare wasn't clearly noticed; it's explained now, and size is open for the
  next playtest.

**2026-10-31 — frost-08 finale.** Felt like a finale: very tricky, fair once you read the
route. The belt flare was invisible because the block hides the belt it's on → a push now
makes the block tip back on its trailing edge and swing upright (always visible), and the
whole connected belt lights up, rippling away from the block.

**2026-10-31 — wind lab.** Launch pads are fun ("I enjoy them a lot"). Pads alone need
spice and a difficulty climb → belts join pads, in the lab and the chapter (from the middle
levels on). Notes:
- windlab-01: great introduction. windlab-02: awesome; shows both jump kinds with a simple,
  solid puzzle. Keep both.
- windlab-03: underwhelming; the far island never felt like a place you'd launch to.
- windlab-04: too simple; the chain felt like an automatic completion. A chain must be a
  tool you set up, not the solution.
- windlab-05: the heavy switch landing was cool but too simple (same issue as 04).
- windlab-06: does the right things at a simple level; a little boring.
- Wanted: a level that jumps island to island where each crossing needs maneuvering on the
  current island first.

**2026-10-31 — wind lab, second round.** Mechanic and level design are good; a few problems
remain before it's done. Notes:
- windlab-01, 02: solid beginner levels. 03: belts with pads are cool. 06: solid, not amazing.
- windlab-04 (Near or Far): a favorite; the tricky maneuvering to set up the right launch.
- windlab-07 (Crosswind): solid and tricky; belts synergize with getting into different
  positions for different launches.
- windlab-05: decent level, but the camera was very far and everything looked tiny. Cause:
  the camera sized itself to the grid's longest side, as if every level were square, and
  this one is 21×8 → the camera now fits the tiles' actual footprint to the screen at each
  90° rotation (with a minimum distance so small islands keep some sky around them).
- Esc didn't close the sky map: Vimium swallows Esc while a text field has focus and only
  blurs it (the game keeps a hidden field focused so Vimium passes other keys) → a blur that
  no click or Tab explains now counts as Esc. Also fixed: hovering a stone resized the
  preview panel, which reflowed the map so clicks missed the stones.
- Sign-off: "no other problems" → rules frozen.

**2026-11-01 — Windy Peaks.** "Every level ramped up appropriately in difficulty and made good
use of existing features." No level-specific notes; chapter approved as built. Next: grill the
gravity-flip biome (two layers, ceiling above) as the next signature mechanic; shape-changing
blocks follow as the biome after.

**2026-11-01 — gravity camera prototype (gravlab-01).** Hard to see exactly where a flip lands
on the other layer; hard to follow overall. The ghost layer's see-through tiles clash with missing
tiles (and look like switched-off bridges, which are also drawn see-through). The night is a little
too dark. Tried both cameras and the ghost: liked seeing the other floor in both (the
stay-above camera shows the ceiling up there; the ghost shows it while the camera turns over), but
the ghost blocks are clutter and hide the floor plan. Asked whether the mechanic is worth keeping.
Decision: keep it; the rule is simple, the presentation was the problem → blueprint view (one
camera, the other floor as an outline on yours, green/red beams over flip tiles, brighter night).
If the blueprint still reads as clutter, put gravity on hold and do shape-changing first.

**2026-11-01 — blueprint view.** Likes the idea. The outline should be more like a shadow that
doesn't conflict with fragile tiles or bridges. Holding Space to check the other floor "feels
great". Wants marks for where a flip lands, and no safe/unsafe beams on flip tiles in play.
→ The other floor now casts a soft shadow onto your own tiles only (none over open sky); flip tiles
get violet landing marks (like the pads' blue ones) on the other floor, seen when you peek; beams
removed.

**2026-11-01 — shadow view.** "Almost perfect": wants an outline too, very faint, keeping the
shadow → added a thin, faint outline of the whole other floor over the shadow.

**2026-11-01 — gravity lab, first round.** The flip rules feel predictable now. Still somewhat
hard to know exactly where you land: the marks help, but the player should be able to picture the
solution in their head without clutter. A switch that changes the other floor is too subtle: the
only giveaways are peeking or noticing the shadow change. → Proposed swapping the floors in place
(camera stays above, no mirroring) and colored bridge squares; the user keeps the turning camera
and wants only the bridge squares: the other floor's bridges show on your floor as thin squares in
their switch's color (bright when extended, faint when retracted) that pulse when a press changes
them. Then, at the user's request, a **landing preview**: while you're idle, every roll that would
flip you shows a violet wireframe of the block where that whole move leaves you on the other
floor (after any belts or pads there), drawn on your floor like the shadow and on the other floor
for when you peek. Nothing shows until a flip is one roll away.

**2026-11-01 — Starfall, first round.** star-01: a good introduction to the mechanic. star-02:
similar but a bit harder, which is fine. star-03: kind of simple, could be harder. star-04: solid.
star-05: very cool, a keeper. star-06: cool, maybe needs a few more features. star-07: very, very
good, a solid level. star-08: good, but can definitely be harder.
→ Rework 03 (harder), 06 (more going on), 08 (harder finale); keep 01, 02, 04, 05, 07.
Done: 03 became two lying flips onto fragile planks (column up, row down; 14 → 18 moves). The maze
gained a starts-raised bridge whose soft switch sits on your route and a belt lift to its last ring
(23 → 28), so it moved to 07 and Ring Road (the old 07) to 06. The finale chains three switches
across the floors with a second round trip at the far end (28 → 34). Searches that just raised par
added start-island shuffles, so the extra difficulty is built from steps instead.

**2026-11-01 — Starfall, second round.** Satisfied with how the reworked levels came out →
Starfall approved. Next: grill the shape-changing biome.

**2026-11-01 — shape rules demo (shapelab-01).** Likes how the mechanic works. The shape
switch and extra-heavy switch look stands out too much next to the other switches and tiles →
restyled in the existing switch language: shape switches are grass tiles with a low stone disc and
a small raised bar whose length shows the shape (nub = cube, two = normal, three = tall), in muted
colors; the extra-heavy switch is the heavy switch's cross, chunkier, with a third bar.

**2026-11-01 — shape lab.** No rule notes; went straight on to the chapter → shape rules frozen.

**2026-11-01 — Toybox, first round.** toy-01: simple and solid. toy-02: simple, could be a bit
more complex. toy-03: solid, could have a bit more going on. toy-04: solid, enjoyed it a lot.
toy-05: fantastic, belts with the new mechanic. toy-06: cool, but should be harder, traversing more
terrain with gaps. toy-07: should be a bit harder. toy-08: a perfect demonstration of every part
of the mechanic. Also: shaped goals look strange (the floating shape marker) and need a better
mark; and a block entering the goal shouldn't vanish: the goal should end up filled with the
block, its top showing.
→ Rework 02, 03, 06, 07; keep 01, 04, 05, 08. Goals: every goal keeps the usual pyramid; a shaped
goal is marked with the shape switches' bars on its rim. Winning: the block sinks until the hole
is filled with it, top flush with the floor, and stays there.
Done: 02 became a plank maze (12 → 17), 03 gained the extra-heavy switch and its bridge (14 → 21),
06 a long tall run over gappy ground after the cube (20 → 26, 69 → 336 states), 07 a longer route
(28 → 32). Goals and the win animation as described, for every shape.

**2026-11-01 — Toybox, second round.** toy-02 good, definitely improved. toy-03 very, very good.
toy-04 now feels too simple. toy-06 the right amount of complexity. toy-07 greatly improved, loves
the complexity. toy-08 solid. Likes all the levels now; toy-04 could be improved.
→ Rework toy-04 around a heavy switch inside a plank field: the cube reaches it but can't press
it; the normal block presses it but must lie across the planks to get there and back. Done:
a plank corridor only the cube can walk, then the heavy switch among planks (19 → 26 moves).

**2026-11-01 — Toybox, third round.** Likes the reworked toy-04 → Toybox approved. Paused here;
the next release (split + paint) will be discussed another time.

**2026-11-01 — First Glade.** "I love every detail of the forest level" → the world is locked in
and goes live, with no changes after its first build. The chapter title and frame-rate readout
still come next.

**2026-11-02 — Frost tile sheet, first round.** Snow read as snow but "somewhat plain" → soft drifts,
faint wind ripples and sparkles. The ice edge "does in fact look like panes" → a thinner, paler edge,
and glints that vary per tile. Sliding on ice and the goal marker read fine in black and white;
switches and the retracted bridge drew no complaints.

**2026-11-02 — Frost Isle.** Reworked tiles approved, then the finished world was sent live with no
notes. Windy Peaks is next.

**2026-11-02 — Windy Peaks, first round.** Spires never made gaps hard to read, and everything was
easy to read. But "the sand-colored blocks scream more desert" → stone, haze and block go grey, and
the sand look is saved for a future desert biome. "I can barely see the wind" → white gusts, more of
them and faster.

**2026-11-02 — Windy Peaks, second round.** The grey version went live with no further notes. Paused
here at the user's request; the Toybox grilling comes at another time.

**2026-11-02 — Toybox.** "I really love with what you did with the toy theme, just wow!" The one nit: the
light grey plates looked too light. Tried slate, teal, sage and tan on `toy-02`; the user chose tan. They
feel Toybox's look is now well ahead of the other worlds in content.

**2026-11-02 — Starfall tiles.** On the ceiling, "it should be more flush", and on `star-07` and `star-08`, "I
don't understand why there is no grass": a bug in the new grass. Its material was reused between levels while
still faded out, so after the first Starfall level in a session, ceilings showed only their dark undersides. Fixed.
Checks that load each level fresh can't catch this, so also go from one level to the next. Separately, "with the
outlines and the shadows, there is just too much going on", and it would confuse new users even more → softer
shadow and no outline, chosen after trying four views.

**2026-11-02 — Starfall home world and moon.** Built off to the side, in a realistic style: "i do not like the
planets on the side, and it looks wildly out of place with the themes we have had so far." → Earth directly under
the bottom floor, the moon behind the flipped floor, repainted like a picture book. The better peek moves up, next
after this, ahead of the comet and orbit path.

**2026-11-02 — Windy Peaks samples.** Likes the birds. A nest on all four sides "does look strange" → at most two, and a
different rock structure on each side. Nest "a little too dominant" and birds "a tad smaller"; "nests should fit in
naturally". Still airy; "really like the pink", so more of it. No desert feel.

**2026-11-02 — Windy Peaks samples, second round.** Arches a bit thicker; at most three eggs, larger, filling the nest; "just a
little too much pink, especially within the nest". Loves the lopsided arch with its nest and wants the other arches to be
variations on it; the horn "looks really funky" → replaced, and the buttress became a low, wide arch.

**2026-11-02 — Windy Peaks flock.** "It looks weird for them to converge on the nest and disappear"; "them disappearing just
kills the vibe" → every flight crosses the whole backdrop instead. The user's other option, if nests ever come back into it:
birds gather at a nest, stay a while, then leave.

**2026-11-02 — Frost Isle samples.** Reindeer "look fantastic", "very convincing". The summit "looks strange"; "the older backdrop
looked nice"; the turquoise is "a bit too strong, i had to know ahead of time that it was a summit to see it" → summit and bowl removed,
reindeer moved to a soft ridge in the old style.

**2026-11-02 — First Glade sample.** The tree "kind of stands out a bit, but not in the best way" → set it on a mound, with a few more
trees. Still peaceful. Its size is fine. The butterfly's wings were "kind of still": a bug, both wings tilted the same way instead of
flapping.

**2026-11-02 — First Glade groves.** On the second sample: "let's actually make a few of these mounds with trees around the entire map, i do
like the style a lot" → eight varied groves around the board, in the chapter.

**2026-11-02 — The better peek.** The full 3D outline was more than needed: "the outline of the face of the block
is fine... it should be flush with the tile" → flat footprints for both the block outline and the flip landing preview.
