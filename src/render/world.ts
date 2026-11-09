import * as THREE from 'three';
import { Motion, blockCells, blockLength, bridgeOut, flightLandings, hedgeFell, isBridge, isWall, layerView, tileAt as levelTileAt, wallUp } from '../game/rules';
import { Block, DIR_DELTA, DIRS, Dir, Level, State, Tile } from '../game/types';
import { ForestScenery } from './forest';
import { FrostScenery } from './frost';
import { CONVEYOR_COLORS, cssColor } from './palette';
import { PeaksScenery } from './peaks';
import { Scenery, softDot } from './scenery';
import { makeAerieCloseUp } from './aerie';
import { Stardust } from './stardust';
import { ReindeerCloseUp } from './ridge';
import { StarfallScenery } from './starfall';
import { StudioScenery } from './studio';
import { NEUTRAL, Theme, WallStone } from './themes';
import { ToyboxScenery } from './toybox';
import { makeToySamples, plasticEnvironment } from './toys';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COLORS = {
  hole: 0x1d1a2b,
  goal: 0xffd36b,
  cloud: 0xffffff,
  ice: 0xbfe6ff,
  iceEdge: 0x8fc1e6,
  glint: 0xffffff,
  belt: 0x4a5266,
  rail: 0x8a93a8,
  padStone: 0xdfe5ec,
  padRim: 0xa9b4c2,
  padVent: 0x7c8797,
  /** Pad arrows, gusts and landing marks share one colour so a mark reads as "a pad sends you here". */
  wind: 0x5cc8ff,
  /** Landing marks: a deeper blue of the same hue, so they hold up on grass. */
  mark: 0x1f8fe0,
  /** Gravity: flip tiles glow violet; markers say whether the other side holds you. */
  flipStone: 0x3a3160,
  flip: 0xb48cff,
  /** Flip landing marks: the flip tiles' violet, deep enough to hold up on grass. */
  flipMark: 0x8a5cf0,
  /** The landing preview: the block's footprint where a flip would leave it. */
  preview: 0xcbb2ff,
  /** Shape switches: a stone disc like the other switches, with a bar in the block's own color. */
  shapeStone: 0xc9c2b4,
  shapeBar: 0xd9a95f,
  /** Toybox's tread belts: the molded body, and the links. */
  treadBody: 0x35323c,
};


/** Height of the ceiling layer's walking surface above the ground's. */
const CEIL_H = 4;
/** How quickly the camera swings for a peek, roughly. */
const TURN_RATE = 9;
/** A flip: long enough to see the planet and moon trade places. */
const FLIP_MS = 800;
/** How close to a floor's own view the turn must be for that floor's soil and roots to show. */
const FLIP_SOIL_BACK = 0.1;
/** Stardust released per step along the flip's path (one step per 60th of its length), and sparks per ring. */
const TRAIL_STEPS = 60;
const TRAIL_MOTES = 2;
const BURST_SPARKS = 16;
const BURST_MS = 560;
const LANDING_PULSE_MS = 650;
/** The other floor's shadow: how far above your floor it lies, its darkness, and its softness. */
const SHADOW_LIFT = 0.02;
const SHADOW_OPACITY = 0.16;
/**
 * While peeking: how much of your own floor stays visible, how thin it's pressed as it lies on the floor
 * you're viewing, how far in front of that floor it sits, and how fast the block's outline blinks.
 */
const PEEK_GHOST = 0.24;
const PEEK_GHOST_THICKNESS = 0.02;
const PEEK_GHOST_LIFT = 0.03;
const PEEK_BLINK_MS = 340;
/** Flat footprints (the peek's block outline, the flip landing preview): just clear of belt rails, border thickness, and inset from the tile's edge. */
const FOOTPRINT_LIFT = 0.05;
const FOOTPRINT_BORDER = 0.07;
const FOOTPRINT_INSET = 0.02;
const PEEK_AXIS = new THREE.Vector3();
const SHADOW_PX = 32;
const SHADOW_BLUR = 5;
/** The other floor's bridges, as squares in their switch's color: extended, retracted, and the pulse on a change. */
const BRIDGE_ON_OPACITY = 0.9;
const BRIDGE_OFF_OPACITY = 0.35;
const BRIDGE_PULSE_MS = 1400;

/** Each bridge group gets its own colour so you can see which switch drives which bridge. */
const GROUP_COLORS = [0xf4a940, 0xb57edc, 0x4fc3f7, 0xef6f6c];

const ROLL_MS = 170;
/** A wall rising or sinking: as quick as a roll, so it never holds up the next one for long. */
const WALL_MS = 170;
/** A raised wall's height: the normal block standing. */
const WALL_HEIGHT = 1.92;
const WALL_WIDTH = 0.84;
const WALL_NOTCH = 0.26;
const WALL_MERLON = 0.27;
/** How far a sunk wall's top stands above the ground: barely, so it reads as flush. */
const WALL_FLUSH = 0.02;
const WALL_DECK_TINT = 0xa39b8e;
/** A wall that never moves: under half a lying block, or a maze of them hides the lane behind each one. */
const LOW_WALL_HEIGHT = 0.42;
/** A bump: the whole tip and settle, and the part of it where the block arrives. */
const BUMP_MS = 260;
const BUMP_TOUCH = 0.3;
/** How far the top of the block travels before it touches a wall, and how far it pushes into a hedge. */
const BUMP_ROOM = 0.09;
const BUMP_INTO_LEAVES = 0.3;
/** The sine of the steepest tip, for something two tiles away. */
const BUMP_MAX_SIN = 0.6;
const BUMP_SHAKE = 0.04;
const BUMP_SHAKE_MS = 170;
const HEDGE_HEIGHT = 1.12;
const HEDGE_HALF = 0.42;
const HEDGE_FALL_MS = 300;
const HEDGE_CRUMPLE_ANGLE = 1.35;
/** Falling into a gap: the whole fall, the part spent tipping over, and how far it then drops to sit level with the floor. */
const HEDGE_BRIDGE_MS = 420;
const HEDGE_TIP_SHARE = 0.7;
const HEDGE_DROP = 0.9;
const PUSH_MS = 230;
/** How far (radians) the block's top lags behind during a belt push. */
const PUSH_LEAN = 0.32;
/** Belt flare: each chevron's glow, and the delay per tile as it ripples along the belt. */
const FLARE_MS = 380;
const FLARE_STEP_MS = 70;
/** Ice slides start fast and glide to a stop: a base time plus a little per tile. */
const SLIDE_MS_BASE = 90;
const SLIDE_MS_PER_TILE = 75;
/** Conveyor chevrons travel one tile length per this many ms. */
const BELT_MS = 1100;
/** Launch-pad flights: a base time plus a little per tile, and how high the arc rises. */
const FLY_MS_BASE = 260;
const FLY_MS_PER_TILE = 55;
const FLY_ARC_BASE = 1.1;
const FLY_ARC_PER_TILE = 0.3;
/**
 * A flight that hits a wall: how far through its tip it gets when it meets the wall (a fling, a
 * crash, a hop along the pads), its pace against a free flight, the settle, and for a crash the bounce
 * (with how far it drops meanwhile) and the speed the fall carries on at.
 */
const FLY_WALL_TIP_FLING = 0.55;
const FLY_WALL_TIP_CRASH = 0.45;
const FLY_WALL_TIP_HOP = 0.75;
/** How far past the stop tile's center a fling gets as it hits the wall (tiles). */
const FLY_WALL_FLING_REACH = 0.3;
const FLY_WALL_PACE = 0.75;
const FLY_WALL_KNOCK_MS = 280;
const FLY_WALL_CRASH_MS = 150;
const FLY_WALL_CRASH_DROP = 0.4;
const FLY_WALL_FALL_SPEED = 5;
/** The block's half width and half height (its box is 0.98 by 1.96). */
const BLOCK_HALF_W = 0.49;
const BLOCK_HALF_H = 0.98;
/** Gust streaks drift across a pad once per this many ms. */
const GUST_MS = 900;
/** Camera framing: elevation (rise per unit of ground distance), the closest it comes, and how much
 * of the screen the island may fill (vertically less, to keep clear of the HUD bars). */
const CAM_RISE = 1.12;
const CAM_MIN_DIST = 18;
const FIT_X = 0.86;
const FIT_Y = 0.72;
/** Hover height of the goal marker: its tip stays above a standing block's top (y = 2). */
const MARKER_Y = 2.45;
/** A won block fills the goal's hole: its top rests this far above the floor, its bottom at the hole's depth. */
const GOAL_FILL_TOP = 0.03;
const GOAL_DEPTH = 0.55;

interface Tween {
  start: number;
  duration: number;
  update: (t: number) => void;
  resolve: () => void;
}

interface TileView {
  obj: THREE.Object3D;
  baseY: number;
}

interface BridgeView {
  tile: Tile;
  group: number;
  slab: THREE.Object3D;
}

interface WallView {
  layer: number;
  x: number;
  y: number;
  tile: Tile;
  group: number;
  pillar: THREE.Object3D;
  /** Whether the wall is showing raised, which waits for the block to move off its tile. */
  up: boolean;
}

interface HedgeView {
  x: number;
  y: number;
  layer: number;
  group: number;
  bush: THREE.Object3D;
}

/** The worlds with surroundings of their own, built the first time one opens. */
const SCENERY: Partial<Record<Theme['sky'], () => Scenery>> = {
  forest: () => new ForestScenery(),
  frost: () => new FrostScenery(),
  peaks: () => new PeaksScenery(),
  toybox: () => new ToyboxScenery(),
  stars: () => new StarfallScenery(),
  studio: () => new StudioScenery(),
};

/** Three.js view of a level. Holds no game rules: the controller tells it what happened. */
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  /** A scratch camera for working out where the real one is heading. */
  private probe = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  private viewShift = 0;
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private levelGroup = new THREE.Group();
  private theme: Theme = NEUTRAL;
  /** The current world's surroundings, and every world's built so far. */
  private scenery: Scenery | null = null;
  private sceneries = new Map<Theme['sky'], Scenery>();
  /** What shiny plastic reflects, drawn the first time a plastic world opens. */
  private plasticEnv: THREE.Texture | null = null;
  /** A light kept opposite the camera, so flat plastic shows a soft highlight from every view. */
  private sheen = new THREE.DirectionalLight(0xfff0e2, 0.34);
  private blockMat = new THREE.MeshStandardMaterial({ color: NEUTRAL.block.color, roughness: 0.55 });
  private blockEdgeMat = new THREE.LineBasicMaterial({ color: NEUTRAL.block.edge });
  /**
   * One group per layer. The ceiling's is mirrored (scale y −1) at CEIL_H, so every tile, mark and
   * animation is built and played exactly as on the ground and comes out upside down.
   */
  private layerGroups = [new THREE.Group(), new THREE.Group()];
  /** The block's parent per layer, with the same transform as the layer, so rolls work up there too. */
  private frames = [new THREE.Group(), new THREE.Group()];
  /** Materials per layer with their own opacity, so a layer can fade to a ghost or vanish. */
  private layerMats: { mat: THREE.Material; opacity: number; transparent: boolean }[][] = [[], []];
  private layerAlpha = [1, 1];
  /**
   * Per layer, the shadow the *other* floor casts on this one: a soft dark patch on this floor's
   * tiles wherever the other floor has a tile directly over (or under) them. Same transform as the layer.
   */
  private blueprints = [new THREE.Group(), new THREE.Group()];
  private bpAlpha = 0;
  private bpMats: THREE.MeshBasicMaterial[] = [];
  private level: Level | null = null;
  /** Bridge groups as last drawn, so a change can pulse the bridges it moved on the other floor. */
  private bridgeMask = 0;
  /** Landing previews currently shown (each drawn twice: on your floor and on the other floor). */
  private previews: THREE.Object3D[] = [];
  /** Dirt and hanging rock per layer: hidden when you see a layer from behind, where it's only clutter. */
  private earths: THREE.Object3D[][] = [[], []];
  private flipGlows: THREE.MeshStandardMaterial[] = [];
  private hasCeiling = false;
  /** The layer the block is on, and the one being looked at (differs while peeking). */
  private layer = 0;
  private peeking = false;
  /** Stands in for the block while peeking: where it would be on the floor you're looking at. */
  private peekOutline: THREE.Group;
  /** Per layer, how far its ghost has moved onto the other floor: 0 in its own place, 1 lying flat on the other. */
  private ghostShift = [0, 0];
  /** A flip turning the camera over: it sets the view itself, in step with the block. Cleared if a new level or state arrives. */
  private flipTurn: symbol | null = null;
  private stardust = new Stardust();
  private sampleBirds: THREE.Group[] = [];
  private sampleUpdate: ((seconds: number) => void) | null = null;
  /** 0 = camera above looking down, 1 = below looking up; eased toward its target. */
  private side = 0;
  private moonlight = new THREE.DirectionalLight(0xbcc8ff, 0);
  private stars: THREE.Points;
  private hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a66, 1.4);
  private clouds: THREE.Group[] = [];
  private block: THREE.Mesh;
  private tiles = new Map<number, TileView>();
  private switches = new Map<number, THREE.Object3D>();
  private bridges: BridgeView[] = [];
  private walls: WallView[] = [];
  /** Pad landing marks by cell, and the level and color they are drawn for (see showLandings). */
  private landingMarks = new Map<number, THREE.Object3D>();
  private marksFor: { level: Level; color?: number } | null = null;
  /** Set by a crash into a wall: how fast the block is already falling when fall() takes over. */
  private fallSpeed = 0;
  /** Walls that never move, per layer, gathered while building the tiles. */
  private lowWalls: { x: number; y: number; edge: boolean }[][] = [[], []];
  /** Hedges by cell, in the same key as switches. */
  private hedges = new Map<number, HedgeView>();
  /** The hedge lying across each gap one has been knocked into, built when first needed. */
  private fallen = new Map<number, THREE.Object3D>();
  private goalMarker: THREE.Object3D | null = null;
  /** Conveyor chevrons, each with a phase offset so they stream along the belt; cell keys as for switches. */
  private chevrons: {
    obj: THREE.Object3D;
    phase: number;
    cell: number;
    mat: THREE.MeshStandardMaterial;
    dir: Dir;
    /** 0–1 flare while the belt is shoving the block. */
    boost: number;
  }[] = [];
  /** Launch-pad arrows by cell key (y * 10000 + x), so a launch can flash them. */
  private padArrows = new Map<number, { mat: THREE.MeshStandardMaterial; boost: number }>();
  /** Wind streaks drifting over each pad along its arrow. */
  private gusts: { obj: THREE.Mesh; phase: number }[] = [];
  private tweens: Tween[] = [];
  private last = performance.now();

  private center = new THREE.Vector3();
  private viewSize = 10;
  private camIndex = 0;
  private camAngle = 0;
  /** Corners of the island's bounding box, which the camera keeps on screen. */
  private bounds: THREE.Vector3[] = [];
  /** Camera distance that fits the island, per 90° camera position; and the eased current one. */
  private fitDist = [20, 20, 20, 20];
  private camDist = 20;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.add(this.hemi);
    // A light from below for the ceiling's walking side, which faces down; on only with a ceiling.
    this.moonlight.position.set(0, -30, 10);
    this.scene.add(this.moonlight, this.moonlight.target);
    this.stars = makeStars();
    this.stars.visible = false;
    this.scene.add(this.stars);
    this.layerGroups[1].position.y = CEIL_H;
    this.layerGroups[1].scale.y = -1;
    this.frames[1].position.y = CEIL_H;
    this.frames[1].scale.y = -1;
    this.blueprints[1].position.y = CEIL_H;
    this.blueprints[1].scale.y = -1;
    this.scene.add(...this.blueprints);
    this.levelGroup.add(...this.layerGroups);
    this.scene.add(...this.frames);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.levelGroup);
    this.sheen.visible = false;
    this.scene.add(this.sheen, this.sheen.target);

    const geom = new THREE.BoxGeometry(0.98, 1.96, 0.98);
    this.block = new THREE.Mesh(geom, this.blockMat);
    this.block.castShadow = true;
    this.block.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), this.blockEdgeMat));
    this.frames[0].add(this.block);

    this.peekOutline = makeFootprint(
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
    );
    this.peekOutline.visible = false;
    this.scene.add(this.stardust.points);

    this.makeClouds();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Camera position in 90° steps; 0 looks north. */
  get cameraIndex(): number {
    return this.camIndex;
  }

  rotateCamera(delta: number): void {
    this.camIndex = (((this.camIndex + delta) % 4) + 4) % 4;
  }

  /** Hold to look at the layer you're not on. */
  setPeek(on: boolean): void {
    this.peeking = on && this.hasCeiling;
  }

  get twoLayers(): boolean {
    return this.hasCeiling;
  }

  /**
   * Show where flips would leave the block: one flat footprint per move that flips, at the spot
   * it ends on the other floor. Each is drawn twice: flat on your floor, cell for cell under (or
   * over) the landing like the shadow, and on the other floor itself, for when you peek.
   */
  showFlipPreviews(blocks: Block[]): void {
    for (const p of this.previews) p.removeFromParent();
    this.previews = [];
    if (!this.hasCeiling) return;
    for (const b of blocks) {
      for (const parent of [this.blueprints[this.layer], this.layerGroups[1 - this.layer]]) {
        const n = blockLength(b);
        // Your own floor's copy lies on the dark flip tiles, which need the pale violet.
        const color = parent === this.blueprints[this.layer] ? COLORS.preview : this.theme.flipMark ?? COLORS.preview;
        const footprint = makeFootprint(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
        setFootprint(footprint, b.o === 'X' ? n : 1, b.o === 'Y' ? n : 1);
        const center = blockPosition(b);
        footprint.position.set(center.x, FOOTPRINT_LIFT, center.z);
        parent.add(footprint);
        this.previews.push(footprint);
      }
    }
  }

  /**
   * The grid direction that moves the block toward a screen direction (0 up, 1 right, 2 down,
   * 3 left), worked out from where the camera is heading, so controls stay screen-relative
   * however the view is rotated or turned over.
   */
  gridDirForScreen(screen: number): Dir {
    const probe = this.probe;
    probe.aspect = this.camera.aspect;
    probe.updateProjectionMatrix();
    this.placeCamera(this.camIndex * (Math.PI / 2), this.fitDist[this.camIndex], this.sideTarget(), probe);
    const planeY = this.layer ? CEIL_H : 0;
    const origin = new THREE.Vector3(this.center.x, planeY, this.center.z).project(probe);
    const [wx, wy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][screen];
    let best: Dir = 'up';
    let bestDot = -Infinity;
    for (const d of DIRS) {
      const { dx, dy } = DIR_DELTA[d];
      const p = new THREE.Vector3(this.center.x + dx, planeY, this.center.z + dy).project(probe);
      const vx = (p.x - origin.x) * probe.aspect;
      const vy = p.y - origin.y;
      const dot = (vx * wx + vy * wy) / Math.hypot(vx, vy);
      if (dot > bestDot) [best, bestDot] = [d, dot];
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Level construction.

  /** Build a level. The island rises into place once `ready` resolves, so a title covering it can lift first. */
  setLevel(level: Level, state: State, theme: Theme, ready: Promise<void> = Promise.resolve()): Promise<void> {
    this.flipTurn = null;
    this.layerGroups.forEach((g) => g.clear());
    this.tiles.clear();
    this.layerMats = [[], []];
    this.earths = [[], []];
    this.level = level;
    this.flipGlows = [];
    this.hasCeiling = !!level.ceiling;
    this.applyTheme(theme);
    this.switches.clear();
    this.bridges = [];
    this.walls = [];
    this.lowWalls = [[], []];
    this.hedges.clear();
    this.fallen.clear();
    this.goalMarker = null;
    this.chevrons = [];
    this.padArrows.clear();
    this.gusts = [];

    const layers = this.hasCeiling ? [0, 1] : [0];
    for (const layer of layers) {
      const view = layerView(level, layer);
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          const i = y * level.width + x;
          const obj = this.buildTile(view.tiles[i], view.groups[i], x, y, layer);
          if (!obj) continue;
          obj.position.set(x, 0, y);
          this.layerGroups[layer].add(obj);
          this.tiles.set(this.cellKey(layer, x, y, level.width, level.height), { obj, baseY: 0 });
        }
      }
    }
    for (const layer of layers) {
      if (!this.lowWalls[layer].length) continue;
      const mass = makeLowWalls(this.lowWalls[layer], theme);
      this.layerGroups[layer].add(mass);
      // Below every cell's key, so it joins the island's rise as one piece.
      this.tiles.set(-1 - layer, { obj: mass, baseY: 0 });
    }
    // Landing marks ride on their tiles, so they rise in with the island and fall with a broken tile:
    // blue where a pad flight can land, violet where a flip lands (on the other floor, over the flip tile).
    const tileAt = (layer: number, x: number, y: number) => this.tiles.get(this.cellKey(layer, x, y, level.width, level.height));
    for (const layer of layers) {
      const view = layerView(level, layer);
      view.tiles.forEach((t, i) => {
        if (t === Tile.Flip) tileAt(1 - layer, i % level.width, Math.floor(i / level.width))?.obj.add(makeLandingMark(theme.flipMark ?? COLORS.flipMark));
      });
    }
    this.landingMarks.clear();
    this.marksFor = { level, color: theme.landingMark };
    this.showLandings(state);
    for (const layer of layers) {
      this.layerGroups[layer].traverse((o) => {
        if (o.userData.earth) this.earths[layer].push(o);
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && !Array.isArray(mat)) {
          // A material kept between levels may still be faded out from the last one: read its true values.
          const kept = mat.userData.keptBetweenLevels;
          this.layerMats[layer].push({ mat, opacity: kept ? 1 : mat.opacity, transparent: kept ? false : mat.transparent });
        }
      });
    }
    this.layer = state.layer ?? 0;
    this.buildBlueprints(state.bridges);
    this.bpAlpha = this.bpTarget();
    this.side = this.sideTarget();
    this.layerAlpha = [0, 1].map((l) => this.alphaTarget(l));
    this.applyLayerAlpha();

    // Frame the tiles themselves, not the grid: a wide, shallow level shouldn't be framed as a square.
    const xs: number[] = [];
    const zs: number[] = [];
    for (const layer of layers) {
      layerView(level, layer).tiles.forEach((t, i) => {
        if (t === Tile.Empty) return;
        xs.push(i % level.width);
        zs.push(Math.floor(i / level.width));
      });
    }
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 0.5, Math.max(...zs) + 0.5];
    this.center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.viewSize = Math.max(maxX - minX, maxZ - minZ, 6);
    this.bounds = [];
    // Leave headroom for the tallest block the level can make (a tall block stands three high).
    const canBeTall = level.startShape === 3 || level.tiles.some((t, i) => t === Tile.ShapeSwitch && level.groups[i] === 3);
    const ys = this.hasCeiling ? [-0.6, CEIL_H + 0.6] : [-0.6, canBeTall ? 3 : 2];
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of ys) this.bounds.push(new THREE.Vector3(x, y, z));
    this.fitCamera();
    this.camDist = this.fitDist[this.camIndex];
    // Spread clouds below and around the islands, scaled to the level.
    for (const c of this.clouds) {
      const r = c.userData.radius + this.viewSize * 0.4;
      c.position.set(
        this.center.x + Math.cos(c.userData.angle) * r,
        -c.userData.depth,
        this.center.z + Math.sin(c.userData.angle) * r,
      );
    }
    const cells = (tile: Tile) =>
      level.tiles.flatMap((t, i) => (t === tile ? [{ x: i % level.width, z: Math.floor(i / level.width) }] : []));
    const solid = level.tiles.flatMap((t, i) => (t !== Tile.Empty && !isBridge(t) ? [{ x: i % level.width, z: Math.floor(i / level.width) }] : []));
    this.scenery?.place(this.center, this.viewSize, { ice: cells(Tile.Ice), pads: cells(Tile.Pad), solid });
    this.stars.position.copy(this.center);
    this.moonlight.target.position.copy(this.center);
    this.moonlight.position.copy(this.center).add(new THREE.Vector3(-8, -30, 12));
    this.fitShadows(level);
    this.syncState(state);
    return ready.then(() => this.intro());
  }

  /** Stand the three sample toys on the current floor, for `?sheet=toybox&toys`. */
  showToySamples(): void {
    this.layerGroups[0].add(makeToySamples(this.center));
  }

  /** Windy Peaks' structures and birds close up on a strip of floor, for `?sheet=peaks&aerie`, without the ones around the board. */
  showAerie(): void {
    const { group, birds } = makeAerieCloseUp(this.center);
    this.layerGroups[0].add(group);
    this.sampleBirds = birds;
    if (this.scenery instanceof PeaksScenery) this.scenery.aerie.group.visible = false;
  }

  /** Frost Isle's reindeer up close on a strip of floor, for `?sheet=frost&summit`, without the ridge. */
  showReindeer(): void {
    const sample = new ReindeerCloseUp(this.center);
    this.layerGroups[0].add(sample.group);
    this.sampleUpdate = (s) => sample.update(s);
    if (this.scenery instanceof FrostScenery) this.scenery.ridge.group.visible = false;
  }

  /** What the last frame cost, for the frame-rate readout. */
  get renderStats(): { calls: number; triangles: number } {
    return this.renderer.info.render;
  }

  /** Tile map key: one per layer cell. Switch, pad and belt maps use `layer * 1e8 + y * 10000 + x`. */
  private cellKey(layer: number, x: number, y: number, width: number, height: number): number {
    return (layer * height + y) * width + x;
  }

  private buildTile(tile: Tile, group: number, x: number, y: number, layer = 0): THREE.Object3D | null {
    if (tile === Tile.Empty) return null;
    const cell = layer * 1e8 + y * 10000 + x;
    const g = new THREE.Group();
    // Deterministic per-cell variation so islands look natural.
    const jitter = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

    if (isWall(tile)) {
      // No switch in this level means it never moves: low enough to see over, with no color to name.
      // They're all drawn as one mass, since a maze has dozens, with soil only at the island's edge.
      if (!this.hasSwitch(group)) {
        this.lowWalls[layer].push({ x, y, edge: this.onIslandEdge(layer, x, y) });
        return null;
      }
      const view = makeWall(GROUP_COLORS[group % GROUP_COLORS.length], wallStone(this.theme));
      g.add(floorTile(jitter, this.theme, layer), earth(jitter, this.theme), view.frame, view.pillar);
      this.walls.push({ layer, x, y, tile, group, pillar: view.pillar, up: true });
      return g;
    }

    if (tile === Tile.Hedge) {
      const { bush, flat } = makeHedge(jitter);
      g.add(floorTile(jitter, this.theme, layer), earth(jitter, this.theme), flat, bush);
      this.hedges.set(cell, { x, y, layer, group, bush });
      return g;
    }

    if (isBridge(tile)) {
      const color = GROUP_COLORS[group % GROUP_COLORS.length];
      const ghost = box(0.94, 0.04, 0.94, color, { transparent: true, opacity: this.theme.finish.bridgeGhost ?? 0.4 });
      ghost.position.y = -0.1;
      // A retracted bridge keeps its group's color at the edges, so it still names its switch on a pale sky.
      for (const [dx, dz, w, d] of [[0, -0.44, 0.94, 0.06], [0, 0.44, 0.94, 0.06], [-0.44, 0, 0.06, 0.82], [0.44, 0, 0.06, 0.82]]) {
        const edge = box(w, 0.045, d, rimColor(color, 0.8), { transparent: true, opacity: 0.85 });
        edge.position.set(dx, -0.1, dz);
        g.add(edge);
      }
      // The slab's body is the rim: a darker shade of the group's color around a bright plate.
      const { plastic, switchBase } = this.theme.finish;
      const slab = box(0.96, 0.16, 0.96, rimColor(color), { roughness: plastic ? 0.3 : 0.7 });
      slab.position.y = -0.08;
      const plate = box(0.84, 0.01, 0.84, color, { roughness: plastic ? 0.5 : 0.7 });
      plate.position.y = 0.085;
      slab.add(plate);
      if (this.theme.finish.wood) {
        // Plank seams across the plate, in the same hue so the group's color still reads first.
        for (const z of [-0.14, 0.14]) {
          const seam = box(0.84, 0.004, 0.025, rimColor(color, 0.75), { roughness: 0.9 });
          seam.position.set(0, 0.092, z);
          slab.add(seam);
        }
      }
      const brass = this.theme.finish.brass ?? this.theme.finish.rail;
      if (brass !== undefined) {
        // Small brass or stone corners on the slab, clear of the group's color in the middle.
        for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
          const corner = box(0.11, 0.008, 0.11, brass, { metalness: 0.15, roughness: 0.5 });
          corner.position.set(dx, 0.085, dz);
          slab.add(corner);
        }
      }
      if (plastic && switchBase !== undefined) {
        // Ivory pegs at the corners, snapping the slab to its neighbors.
        const peg = new THREE.MeshStandardMaterial({ color: switchBase, roughness: 0.3 });
        for (const [dx, dz] of [[-0.39, -0.39], [0.39, -0.39], [-0.39, 0.39], [0.39, 0.39]]) {
          const stud = new THREE.Mesh(pegGeometry, peg);
          stud.position.set(dx, 0.095, dz);
          slab.add(stud);
        }
      }
      g.add(ghost, slab);
      this.bridges.push({ tile, group, slab });
      return g;
    }

    if (tile === Tile.Fragile) {
      const { light, dark, weathered } = this.theme.fragile;
      if (this.theme.finish.plastic) {
        // Three thin slats on a flimsy frame: still planks, but molded and snapped together.
        for (let p = -1; p <= 1; p++) {
          const slat = rounded(0.31, 0.055, 0.96, p === 0 ? dark : light, 0.02, { roughness: 0.3 });
          slat.position.set(p * 0.32, -0.03, 0);
          g.add(slat);
        }
        const frame = rimColor(dark, 0.62);
        for (const z of [-0.36, 0.36]) {
          const bar = box(0.9, 0.03, 0.05, frame, { roughness: 0.35 });
          bar.position.set(0, -0.07, z);
          g.add(bar);
        }
        return g;
      }
      for (let p = -1; p <= 1; p++) {
        const plank = box(0.3, 0.12, 0.96, p === 0 ? dark : light);
        plank.position.set(p * 0.32, -0.06, 0);
        g.add(plank);
        if (weathered) {
          // Worn grain along each plank: this wood has seen better days.
          for (const [dz, len] of [[-0.22, 0.34], [0.2, 0.42]]) {
            const grain = box(0.03, 0.004, len, rimColor(p === 0 ? dark : light, 0.68), { roughness: 1 });
            grain.position.set(p * 0.32 + (dz > 0 ? 0.05 : -0.05), 0.002, dz);
            g.add(grain);
          }
        }
      }
      const { snow } = this.theme.finish;
      if (snow !== undefined) {
        // A little snow caught in the seams between the planks.
        for (const x of [-0.16, 0.16]) {
          const seam = box(0.05, 0.006, 0.9, snow, { roughness: 1 });
          seam.position.set(x, 0.002, 0);
          g.add(seam);
        }
      }
      return g;
    }

    if (tile === Tile.Goal) {
      const pit = box(0.9, 0.5, 0.9, COLORS.hole);
      pit.position.y = -0.35;
      g.add(pit);
      const { wood, plastic } = this.theme.finish;
      const rim = new THREE.MeshStandardMaterial({
        color: COLORS.goal,
        emissive: COLORS.goal,
        emissiveIntensity: wood ? 0.3 : plastic ? 0.2 : 0.6,
        roughness: wood ? 0.8 : plastic ? 0.22 : 1,
      });
      for (const [dx, dz, w, d] of [[0, -0.44, 0.96, 0.08], [0, 0.44, 0.96, 0.08], [-0.44, 0, 0.08, 0.96], [0.44, 0, 0.08, 0.96]]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), rim);
        edge.position.set(dx, -0.1, dz);
        edge.receiveShadow = true;
        g.add(edge);
      }
      if (wood || this.theme.finish.brass !== undefined) {
        // Darker joints at the corners: a framed wooden edge, or brass fittings.
        for (const dx of [-0.44, 0.44]) {
          for (const dz of [-0.44, 0.44]) {
            const joint = box(0.09, 0.006, 0.09, this.theme.finish.brass ?? rimColor(COLORS.goal, 0.62), { roughness: 0.9 });
            joint.position.set(dx, 0.002, dz);
            g.add(joint);
          }
        }
      }
      // A goal marked for a cube or a tall block carries the shape switches' sign on its rim: the
      // same bar (a nub for the cube, three long for tall) inlaid on two opposite edges.
      if (group === 1 || group === 3) {
        const len = group === 1 ? 0.16 : 0.5;
        for (const side of [-1, 1]) {
          const bar = box(len, 0.06, 0.12, plastic ? rimColor(COLORS.goal, 0.5) : COLORS.shapeBar, { roughness: plastic ? 0.25 : 0.5 });
          bar.position.set(0, 0.03, side * 0.44);
          g.add(bar);
        }
      }
      // A square pyramid hovering point-down over the hole: "drop in here", in the tiles' own shape.
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 0.56, 4),
        new THREE.MeshStandardMaterial({
          color: COLORS.goal,
          emissive: COLORS.goal,
          emissiveIntensity: 0.45,
          roughness: 0.35,
          metalness: 0.2,
          flatShading: true,
        }),
      );
      marker.rotation.x = Math.PI;
      const spinner = new THREE.Group();
      spinner.add(marker);
      spinner.position.y = MARKER_Y;
      this.goalMarker = spinner;
      g.add(spinner);
      return g;
    }

    if (tile === Tile.Ice) {
      // A touch of its own light in a world with a sheen, so warm sun doesn't gray it.
      const ice = box(0.98, 0.18, 0.98, COLORS.ice, {
        roughness: 0.08,
        metalness: 0.1,
        ...(this.theme.finish.iceSheen ? { emissive: COLORS.ice, emissiveIntensity: 0.16 } : {}),
      });
      ice.position.y = -0.09;
      g.add(ice, earth(jitter, this.theme));
      const sheen = this.theme.finish.iceSheen;
      if (sheen) {
        // A faint deeper edge, enough to set ice off from a pale floor without framing it like a window.
        for (const [dx, dz, w, d] of [[0, -0.475, 0.98, 0.03], [0, 0.475, 0.98, 0.03], [-0.475, 0, 0.03, 0.92], [0.475, 0, 0.03, 0.92]]) {
          const edge = box(w, 0.006, d, COLORS.iceEdge, { roughness: 0.2 });
          edge.position.set(dx, 0.002, dz);
          g.add(edge);
        }
      }
      // Diagonal glints so ice reads as slick even without reflections.
      // With a sheen, each tile gets its own glints, so a sheet of ice doesn't look like rows of windows.
      const shift = sheen ? (jitter - 0.5) * 0.14 : 0;
      const slant = sheen && Math.floor(jitter * 64) % 2 === 1 ? -1 : 1;
      const glints = sheen
        ? [[-0.2 + shift, 0.3 + jitter * 0.22], [0.03 + shift, 0.62 - jitter * 0.2], [0.23 + shift, 0.2 + jitter * 0.18]]
        : [[-0.18, 0.5], [0.16, 0.3]];
      for (const [off, len] of glints) {
        const glint = box(len, 0.01, sheen ? 0.075 : 0.05, COLORS.glint, { transparent: true, opacity: sheen ? 0.95 : 0.7, roughness: 0.1 });
        glint.rotation.y = (slant * Math.PI) / 4;
        glint.position.set(off, 0.005, slant * off * (sheen ? 0.9 : 0.6));
        g.add(glint);
      }
      return g;
    }

    if (tile === Tile.Conveyor) {
      const { plastic, switchBase } = this.theme.finish;
      const belt = box(0.98, 0.18, 0.98, plastic ? COLORS.treadBody : COLORS.belt, { roughness: plastic ? 0.4 : 0.9 });
      belt.position.y = -0.09;
      g.add(belt, earth(jitter, this.theme));
      // Chevrons are built pointing +x (right), then the whole belt top turns to face its arrow.
      const dir = DIRS[group];
      const top = new THREE.Group();
      top.rotation.y = BELT_ROTATION[dir];
      if (plastic) {
        // Tank-tread links that scroll with the arrows, between ivory rails.
        const tread = new THREE.Mesh(treadGeometry, treadMaterial());
        tread.rotation.x = -Math.PI / 2;
        tread.position.y = 0.006;
        tread.receiveShadow = true;
        top.add(tread);
      }
      for (const side of [-1, 1]) {
        const { brass } = this.theme.finish;
        const rail = plastic && switchBase !== undefined
          ? box(0.98, 0.05, 0.08, switchBase, { roughness: 0.3 })
          : box(0.98, 0.05, 0.08, brass ?? this.theme.finish.rail ?? COLORS.rail, brass === undefined ? {} : { metalness: 0.15, roughness: 0.5 });
        rail.position.set(0, 0.02, side * 0.44);
        top.add(rail);
        if (this.theme.finish.snow !== undefined) {
          const dust = box(0.98, 0.012, 0.055, this.theme.finish.snow, { roughness: 1 });
          dust.position.set(0, 0.05, side * 0.44);
          top.add(dust);
        }
      }
      for (const phase of [0, 0.5]) {
        const chevron = makeChevron(CONVEYOR_COLORS[dir]);
        top.add(chevron);
        this.chevrons.push({ obj: chevron, phase, cell, mat: chevron.userData.mat, dir, boost: 0 });
      }
      g.add(top);
      return g;
    }

    if (tile === Tile.Pad) {
      const stone = box(0.98, 0.18, 0.98, COLORS.padRim, { roughness: 0.9 });
      stone.position.y = -0.09;
      const plate = box(0.82, 0.04, 0.82, COLORS.padStone, { roughness: 0.6 });
      plate.position.y = 0.01;
      g.add(stone, plate, earth(jitter, this.theme));
      const dir = DIRS[group];
      const top = new THREE.Group();
      top.rotation.y = BELT_ROTATION[dir];
      const mat = new THREE.MeshStandardMaterial({ color: COLORS.wind, emissive: COLORS.wind, emissiveIntensity: 0.35 });
      const arrow = new THREE.Mesh(arrowGeometry(), mat);
      arrow.position.y = 0.03;
      arrow.receiveShadow = true;
      top.add(arrow);
      if (this.theme.finish.padVents) {
        // Carved slots along the plate's edges, as if air rushes up through the stone.
        for (const z of [-0.33, 0.33]) {
          for (const x of [-0.25, 0, 0.25]) {
            const vent = box(0.17, 0.006, 0.05, COLORS.padVent, { roughness: 1 });
            vent.position.set(x, 0.03, z);
            top.add(vent);
          }
        }
      }
      // Two thin streaks drift over the pad along its arrow: wind you can see.
      for (const [phase, z] of [[0, -0.22], [0.5, 0.2]]) {
        const streak = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.02, 0.035),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
        );
        streak.position.set(0, 0.3, z);
        top.add(streak);
        this.gusts.push({ obj: streak, phase });
      }
      g.add(top);
      this.padArrows.set(cell, { mat, boost: 0 });
      return g;
    }

    if (tile === Tile.Flip) {
      const stone = box(0.98, 0.18, 0.98, COLORS.flipStone, { roughness: 0.7 });
      stone.position.y = -0.09;
      g.add(stone, earth(jitter, this.theme));
      // A glowing ring with a bright core: "gravity turns here".
      const glow = new THREE.MeshStandardMaterial({ color: COLORS.flip, emissive: COLORS.flip, emissiveIntensity: 0.8 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 32), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 20), glow);
      core.position.y = 0.02;
      g.add(ring, core);
      this.flipGlows.push(glow);
      return g;
    }

    if (tile === Tile.ShapeSwitch) {
      // Same language as the other switches: a grass tile with a low stone disc. On it, a raised bar
      // in the block's own color whose length says the shape: a nub for the cube, two for normal,
      // three for tall.
      const grass = floorTile(jitter, this.theme, layer);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.4, 0.06, 28),
        new THREE.MeshStandardMaterial({ color: COLORS.shapeStone, roughness: 0.7 }),
      );
      disc.position.y = 0.03;
      disc.receiveShadow = true;
      const { plastic, switchBase } = this.theme.finish;
      if (plastic && switchBase !== undefined) {
        // The same length-says-the-shape sign, as a small model of the block clipped onto a peg.
        (disc.material as THREE.MeshStandardMaterial).color.set(switchBase);
        (disc.material as THREE.MeshStandardMaterial).roughness = 0.3;
        const peg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.12, 14),
          new THREE.MeshStandardMaterial({ color: rimColor(switchBase, 0.78), roughness: 0.3 }),
        );
        peg.position.y = 0.11;
        const modelLen = [0, 0.22, 0.44, 0.66][group];
        const model = rounded(modelLen, 0.15, 0.22, this.theme.block.color, 0.03, { roughness: 0.2 });
        model.position.y = 0.235;
        model.castShadow = true;
        // A groove between each cube-sized part, so the model counts out its length.
        for (let k = 1; k < group; k++) {
          const groove = box(0.016, 0.154, 0.224, this.theme.block.edge, { roughness: 0.4 });
          groove.position.x = -modelLen / 2 + (k * modelLen) / group;
          model.add(groove);
        }
        g.add(floorTile(jitter, this.theme, layer), earth(jitter, this.theme), disc, peg, model);
        return g;
      }
      const len = [0, 0.14, 0.3, 0.46][group];
      const bar = box(len, 0.07, 0.14, COLORS.shapeBar, { roughness: 0.5 });
      bar.position.y = 0.095;
      bar.castShadow = true;
      g.add(grass, earth(jitter, this.theme), disc, bar);
      return g;
    }

    g.add(floorTile(jitter, this.theme, layer), earth(jitter, this.theme));

    const isSwitch = tile === Tile.ExtraHeavy || tile === Tile.SoftSwitch || tile === Tile.HeavySwitch;
    if (isSwitch && this.theme.finish.switchBase !== undefined) {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.46, 0.04, 28),
        new THREE.MeshStandardMaterial({ color: this.theme.finish.switchBase, roughness: this.theme.finish.plastic ? 0.3 : 1 }),
      );
      base.position.y = 0.02;
      base.receiveShadow = true;
      g.add(base);
      if (this.theme.finish.brass !== undefined) {
        const ring = new THREE.Mesh(brassRingGeometry, new THREE.MeshStandardMaterial({ color: this.theme.finish.brass, metalness: 0.15, roughness: 0.5 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.04;
        g.add(ring);
      }
      if (this.theme.finish.snow !== undefined) {
        // Small drifts on the stone's rim, clear of the switch's own color.
        const mat = new THREE.MeshStandardMaterial({ color: this.theme.finish.snow, roughness: 1 });
        for (const a of [0.9, 3.4]) {
          const drift = new THREE.Mesh(driftGeometry, mat);
          drift.position.set(Math.cos(a + jitter * 6) * 0.385, 0.035, Math.sin(a + jitter * 6) * 0.385);
          drift.rotation.y = -(a + jitter * 6);
          // Long along the rim, so it reads as a drift and not a stud.
          drift.scale.set(0.055, 0.03, 0.17);
          g.add(drift);
        }
      }
    }

    if (tile === Tile.ExtraHeavy) {
      // The heavy switch's cross, chunkier and with a third bar: it takes more weight.
      const color = GROUP_COLORS[group % GROUP_COLORS.length];
      const sw = new THREE.Group();
      for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
        const edge = box(0.84, 0.08, 0.24, rimColor(color), { roughness: 0.6 });
        edge.rotation.y = angle;
        edge.position.y = -0.03;
        const bar = box(0.78, 0.14, 0.18, color, { roughness: 0.4 });
        bar.rotation.y = angle;
        sw.add(edge, bar);
      }
      sw.position.y = 0.07;
      sw.traverse((o) => (o.castShadow = true));
      g.add(sw);
      this.switches.set(cell, sw);
      return g;
    }

    if (tile === Tile.SoftSwitch || tile === Tile.HeavySwitch) {
      const color = GROUP_COLORS[group % GROUP_COLORS.length];
      const sw = new THREE.Group();
      if (tile === Tile.SoftSwitch) {
        const edge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.345, 0.385, 0.07, 24),
          new THREE.MeshStandardMaterial({ color: rimColor(color), roughness: 0.6 }),
        );
        edge.position.y = -0.01;
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.34, 0.1, 24),
          new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
        );
        sw.add(edge, disc);
      } else {
        for (const angle of [Math.PI / 4, -Math.PI / 4]) {
          const edge = box(0.84, 0.06, 0.24, rimColor(color), { roughness: 0.6 });
          edge.rotation.y = angle;
          edge.position.y = -0.015;
          const bar = box(0.78, 0.1, 0.18, color, { roughness: 0.4 });
          bar.rotation.y = angle;
          sw.add(edge, bar);
        }
      }
      sw.position.y = 0.05;
      sw.traverse((o) => (o.castShadow = true));
      g.add(sw);
      this.switches.set(cell, sw);
    }
    return g;
  }

  private fitShadows(level: Level): void {
    const s = Math.max(level.width, level.height) * 0.75 + 3;
    const cam = this.sun.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 1;
    cam.far = s * 6;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(this.center);
    this.sun.position.copy(this.center).add(new THREE.Vector3(-s * 0.8, s * 2, s * 1.1));
  }

  private makeClouds(): void {
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.cloud, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.6, 1), mat);
        puff.position.set(p * 0.75 - puffs * 0.35, Math.random() * 0.35, Math.random() * 0.6);
        cloud.add(puff);
      }
      cloud.userData.angle = (i / 16) * Math.PI * 2;
      cloud.userData.radius = 8 + Math.random() * 16;
      cloud.userData.depth = 5 + Math.random() * 7;
      cloud.userData.speed = 0.15 + Math.random() * 0.25;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  // -------------------------------------------------------------------------
  // State display.

  /** Snap everything to a state with no animation (load, undo, restart). */
  syncState(state: State): void {
    this.flipTurn = null;
    this.showLandings(state);
    this.fallSpeed = 0;
    this.layer = state.layer ?? 0;
    this.buildBlueprints(state.bridges);
    this.frames[this.layer].add(this.block);
    this.placeBlock(state.block);
    this.block.visible = true;
    this.goalMarker?.scale.setScalar(1);
    for (const view of this.tiles.values()) {
      view.obj.position.y = view.baseY;
      view.obj.rotation.set(0, 0, 0);
    }
    for (const b of this.bridges) {
      const on = bridgeOut(b.tile, b.group, state.bridges);
      b.slab.visible = on;
      b.slab.scale.set(1, 1, 1);
    }
    for (const w of this.walls) {
      w.up = this.wallShows(w, state);
      w.pillar.visible = w.up;
      w.pillar.scale.y = 1;
      w.pillar.position.set(0, 0, 0);
    }
    for (const h of this.hedges.values()) {
      h.bush.visible = !hedgeFell(h.group, state.hedges ?? 0);
      h.bush.position.set(0, 0, 0);
      h.bush.quaternion.identity();
      h.bush.scale.set(1, 1, 1);
    }
    for (const key of this.fallen.keys()) this.showFallen(key, false);
    for (const h of this.hedges.values()) {
      const fell = hedgeFell(h.group, state.hedges ?? 0);
      if (!fell || !this.level) continue;
      const [x, y] = [h.x + DIR_DELTA[fell].dx, h.y + DIR_DELTA[fell].dy];
      if (levelTileAt(layerView(this.level, h.layer), x, y) === Tile.Empty) this.layFallen(h.layer, x, y);
    }
  }

  /** A fallen hedge across this empty tile. It joins the tile map, since it's as good as floor now. */
  private layFallen(layer: number, x: number, y: number): void {
    if (!this.level) return;
    const key = this.cellKey(layer, x, y, this.level.width, this.level.height);
    if (!this.fallen.has(key)) {
      const obj = makeFallenHedge(Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1);
      obj.position.set(x, 0, y);
      this.layerGroups[layer].add(obj);
      this.fallen.set(key, obj);
    }
    this.showFallen(key, true);
  }

  private showFallen(key: number, on: boolean): void {
    const obj = this.fallen.get(key);
    if (!obj) return;
    obj.visible = on;
    if (on) this.tiles.set(key, { obj, baseY: 0 });
    else this.tiles.delete(key);
  }

  /** Whether this tile has empty sky beside it, or the edge of the grid. */
  private onIslandEdge(layer: number, x: number, y: number): boolean {
    const level = this.level;
    if (!level) return true;
    const view = layerView(level, layer);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => levelTileAt(view, x + dx, y + dy) === Tile.Empty);
  }

  private hasSwitch(group: number): boolean {
    const level = this.level;
    if (!level) return false;
    const presses = (t: Tile) => t === Tile.SoftSwitch || t === Tile.HeavySwitch || t === Tile.ExtraHeavy;
    return [level, ...(level.ceiling ? [level.ceiling] : [])].some((l) => l.tiles.some((t, i) => presses(t) && l.groups[i] === group));
  }

  /** A wall due up stays down while the block is on its tile, and comes up when the block moves off. */
  private wallShows(w: WallView, state: State): boolean {
    if (!this.level || !wallUp(w.tile, w.group, state.bridges, this.level.bridgesOn)) return false;
    const on = (state.layer ?? 0) === w.layer && blockCells(state.block).some(([x, y]) => x === w.x && y === w.y);
    return !on;
  }

  /** Raise and lower walls to match this state. Call it after every move: one may have been waiting for the block to leave. */
  /**
   * Blue marks where pad flights land, as the walls stand in `state`: a raised wall on a landing moves
   * the mark to where the flight stops short, or takes it away if the flight would crash. Marks ride on
   * their tiles, made the first time a cell needs one and hidden when it doesn't.
   */
  private showLandings(state: State): void {
    const level = this.marksFor?.level;
    if (!level) return;
    const want = new Set<number>();
    for (const layer of level.ceiling ? [0, 1] : [0]) {
      for (const { x, y } of flightLandings(layerView(level, layer), state)) {
        const key = this.cellKey(layer, x, y, level.width, level.height);
        const tile = this.tiles.get(key);
        if (!tile) continue;
        want.add(key);
        if (!this.landingMarks.has(key)) {
          const mark = makeLandingMark(this.marksFor!.color);
          tile.obj.add(mark);
          this.landingMarks.set(key, mark);
        }
      }
    }
    for (const [key, mark] of this.landingMarks) mark.visible = want.has(key);
  }

  setWalls(state: State): Promise<void> {
    this.showLandings(state);
    const changes = this.walls.filter((w) => w.up !== this.wallShows(w, state));
    if (changes.length === 0) return Promise.resolve();
    for (const w of changes) {
      w.up = !w.up;
      w.pillar.visible = true;
    }
    return this.tween(WALL_MS, (t) => {
      for (const w of changes) {
        w.pillar.scale.y = Math.max(w.up ? easeOutBack(t) : 1 - easeOut(t), 0.001);
        if (t === 1) {
          w.pillar.visible = w.up;
          w.pillar.scale.y = 1;
        }
      }
    });
  }

  /**
   * Rolling into a wall or a hedge: the block tips until it touches, then settles back where it was.
   * A knocked hedge goes over as the block reaches it.
   */
  async bump(from: Block, hit: { x: number; y: number }, dir: Dir, knocked: boolean, bridged?: { x: number; y: number }): Promise<void> {
    const { pivot, axis, angle } = this.tipPivot(from, dir);
    const { dx, dy } = DIR_DELTA[dir];
    const cells = blockCells(from);
    const lead = Math.max(...cells.map(([x, y]) => x * dx + y * dy));
    const tiles = hit.x * dx + hit.y * dy - lead - 1;
    const height = from.o === 'S' ? blockLength(from) : 1;
    const room = tiles + (knocked ? BUMP_INTO_LEAVES : BUMP_ROOM);
    const lean = Math.sign(angle) * Math.asin(Math.min(room / height, BUMP_MAX_SIN));

    const frame = this.frames[this.layer];
    const key = this.layer * 1e8 + hit.y * 10000 + hit.x;
    const hedge = this.hedges.get(key);
    const wall = this.walls.find((w) => w.layer === this.layer && w.x === hit.x && w.y === hit.y);
    let fell: Promise<void> = Promise.resolve();
    let touched = false;
    frame.add(pivot);
    pivot.attach(this.block);
    await this.tween(BUMP_MS, (t) => {
      // Quick to reach it, slower to settle back.
      pivot.rotation[axis] = lean * Math.sin(Math.PI * t ** 0.6);
      if (touched || t < BUMP_TOUCH) return;
      touched = true;
      if (knocked && hedge) fell = this.fellHedge(hedge, dx, dy, bridged);
      else if (hedge) void this.shake(hedge.bush, dx, dy);
      else if (wall) void this.shake(wall.pillar, dx, dy);
    });
    frame.attach(this.block);
    frame.remove(pivot);
    this.placeBlock(from);
    await fell;
  }

  /**
   * A raised wall kept a belt from pushing: the belt flares under the block, which doesn't move. A slide
   * a wall stopped shows nothing more, since any reaction there delays the next move (playtest 2026-11-07).
   */
  hold(b: Block, h: { dir: Dir; belt: boolean }): void {
    if (h.belt) this.flareBelts(b, h.dir);
  }

  /**
   * The hedge goes over on its far edge and leaves the mat that was under it. Over a gap it falls all
   * the way and drops into the gap, level with the floor. Onto anything else it crumples where it falls.
   */
  private fellHedge(h: HedgeView, dx: number, dy: number, bridged?: { x: number; y: number }): Promise<void> {
    const axis = new THREE.Vector3(dy, 0, -dx);
    const edge = new THREE.Vector3(dx * HEDGE_HALF, 0, dy * HEDGE_HALF);
    const lean = (a: number) => {
      h.bush.quaternion.setFromAxisAngle(axis, a);
      h.bush.position.copy(edge).add(edge.clone().negate().applyAxisAngle(axis, a));
    };
    if (!bridged) {
      return this.tween(HEDGE_FALL_MS, (t) => {
        const e = easeIn(t);
        lean(HEDGE_CRUMPLE_ANGLE * e);
        h.bush.scale.y = 1 - 0.85 * e;
        if (t === 1) h.bush.visible = false;
      });
    }
    return this.tween(HEDGE_BRIDGE_MS, (t) => {
      lean((Math.PI / 2) * easeIn(Math.min(t / HEDGE_TIP_SHARE, 1)));
      const drop = Math.max((t - HEDGE_TIP_SHARE) / (1 - HEDGE_TIP_SHARE), 0);
      h.bush.position.y -= HEDGE_DROP * easeOut(drop);
      if (t === 1) {
        h.bush.visible = false;
        this.layFallen(h.layer, bridged.x, bridged.y);
      }
    });
  }

  /** A small shove away from the block, so what stopped it visibly took the hit. */
  private shake(obj: THREE.Object3D, dx: number, dy: number): Promise<void> {
    return this.tween(BUMP_SHAKE_MS, (t) => {
      const s = BUMP_SHAKE * Math.sin(t * Math.PI);
      obj.position.set(dx * s, 0, dy * s);
    });
  }

  private placeBlock(b: Block): void {
    this.block.rotation.set(0, 0, 0);
    // The mesh is a normal block (two tiles long); stretch it along its length for other shapes.
    this.block.scale.set(1, blockLength(b) / 2, 1);
    this.block.position.copy(blockPosition(b));
    if (b.o === 'X') this.block.rotation.z = Math.PI / 2;
    else if (b.o === 'Y') this.block.rotation.x = Math.PI / 2;
  }

  /** Tip the block over its leading bottom edge. */
  async roll(from: Block, to: Block, dir: Dir): Promise<void> {
    const { pivot, axis, angle } = this.tipPivot(from, dir);

    // Pivot inside the block's layer frame, so a roll on the ceiling plays mirrored.
    const frame = this.frames[this.layer];
    frame.add(pivot);
    pivot.attach(this.block);
    await this.tween(ROLL_MS, (t) => (pivot.rotation[axis] = angle * easeInOut(t)));
    frame.attach(this.block);
    frame.remove(pivot);
    this.placeBlock(to);
  }

  /** The block's leading bottom edge for a tip in this direction, and the quarter turn that would lay it over. */
  private tipPivot(from: Block, dir: Dir): { pivot: THREE.Object3D; axis: 'x' | 'z'; angle: number } {
    const cells = blockCells(from);
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const minX = Math.min(...xs) - 0.5;
    const maxX = Math.max(...xs) + 0.5;
    const minZ = Math.min(...ys) - 0.5;
    const maxZ = Math.max(...ys) + 0.5;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const pivot = new THREE.Object3D();
    let axis: 'x' | 'z';
    let angle: number;
    if (dir === 'right') [pivot.position.x, pivot.position.z, axis, angle] = [maxX, cz, 'z', -Math.PI / 2];
    else if (dir === 'left') [pivot.position.x, pivot.position.z, axis, angle] = [minX, cz, 'z', Math.PI / 2];
    else if (dir === 'down') [pivot.position.x, pivot.position.z, axis, angle] = [cx, maxZ, 'x', Math.PI / 2];
    else [pivot.position.x, pivot.position.z, axis, angle] = [cx, minZ, 'x', -Math.PI / 2];
    return { pivot, axis, angle };
  }

  /** Carry the block without turning it: a glide that eases to a stop on ice, a steady shove on a belt. */
  async move(m: Motion): Promise<void> {
    if (m.kind === 'fly') return this.fly(m);
    if (m.kind === 'flip') return this.flip(m);
    if (m.kind === 'push') this.flareBelts(m.from, m.dir);
    const start = blockPosition(m.from);
    const end = blockPosition(m.to);
    const tiles = Math.abs(m.to.x - m.from.x) + Math.abs(m.to.y - m.from.y);
    if (m.kind === 'slide') {
      await this.tween(SLIDE_MS_BASE + SLIDE_MS_PER_TILE * tiles, (t) =>
        this.block.position.lerpVectors(start, end, easeOut(t)),
      );
    } else {
      // Dragged from below, the block's top lags behind and then swings upright: a push you can see
      // even though the block hides the belt it's on.
      // It tips on its trailing bottom edge, so the leading edge lifts instead of sinking into the belt.
      const { dx, dy } = DIR_DELTA[m.dir];
      const axis = new THREE.Vector3(-dy, 0, dx).normalize();
      const lying = m.from.o !== 'S';
      const alongLength = (m.from.o === 'X' && dx !== 0) || (m.from.o === 'Y' && dy !== 0);
      const n = blockLength(m.from);
      const halfAlong = alongLength ? 0.49 * n : 0.49;
      const toPivot = new THREE.Vector3(-dx * halfAlong, lying ? -0.49 : -0.49 * n, -dy * halfAlong);
      const base = this.block.quaternion.clone();
      const lean = new THREE.Quaternion();
      await this.tween(PUSH_MS, (t) => {
        lean.setFromAxisAngle(axis, PUSH_LEAN * Math.sin(t * Math.PI));
        this.block.quaternion.copy(base).premultiply(lean);
        this.block.position
          .lerpVectors(start, end, easeInOut(t))
          .add(toPivot)
          .sub(toPivot.clone().applyQuaternion(lean));
      });
    }
    this.placeBlock(m.to);
  }

  /**
   * A launch-pad flight: the pad flashes, the block arcs through the air and makes its one
   * roll's worth of tumble on the way, landing exactly as a roll would leave it.
   */
  private async fly(m: Motion): Promise<void> {
    const pads = blockCells(m.from)
      .map(([x, y]) => this.padArrows.get(this.layer * 1e8 + y * 10000 + x))
      .filter((p) => p !== undefined);
    void this.tween(500, (t) => pads.forEach((p) => (p.boost = Math.sin(t * Math.PI))));

    const start = blockPosition(m.from);
    const end = blockPosition(m.to);
    const tiles = Math.hypot(end.x - start.x, end.z - start.z);
    const arc = FLY_ARC_BASE + FLY_ARC_PER_TILE * tiles;
    const { dx, dy } = DIR_DELTA[m.dir];
    // The same tip as roll(): +y leans toward the flight direction.
    const tumble = new THREE.Quaternion();
    const axis = new THREE.Vector3(dy, 0, -dx);
    const base = this.block.quaternion.clone();
    const turn = (a: number) => this.block.quaternion.copy(base).premultiply(tumble.setFromAxisAngle(axis, a));
    if (m.wall) return this.flyIntoWall(m, start, end, turn);
    await this.tween(FLY_MS_BASE + FLY_MS_PER_TILE * tiles, (t) => {
      this.block.position.lerpVectors(start, end, t);
      this.block.position.y += arc * 4 * t * (1 - t);
      turn((Math.PI / 2) * easeInOut(t));
    });
    this.placeBlock(m.to);
  }

  /**
   * A flight a raised wall got in the way of: it tumbles as usual until its leading edge meets the
   * wall's face, the wall shakes, and the block is knocked to `to`. A fling stopped short rocks back
   * upright; a hop along the pads finishes tipping up against the wall; a crash bounces back and is
   * already dropping when the fall takes over. The contact comes from the block's real size at its
   * tilt for a hop or a crash, so no part of it passes into the wall or the floor; a fling keeps the
   * harder hit the user preferred (peakslab-06), mid-tumble against the wall.
   */
  private async flyIntoWall(m: Motion, start: THREE.Vector3, end: THREE.Vector3, turn: (a: number) => void): Promise<void> {
    const { dx, dy } = DIR_DELTA[m.dir];
    const ahead = new THREE.Vector3(dx, 0, dy);
    const crash = m.to.o !== 'S';
    const upright = m.from.o === 'S' && !crash;
    const final = upright ? 0 : Math.PI / 2;
    // The block's half sizes along the flight and upright, before it turns.
    const lyingAlong = m.from.o !== 'S' && (m.from.o === 'X') === (dy === 0);
    const [a, b] = m.from.o === 'S' ? [BLOCK_HALF_W, BLOCK_HALF_H] : lyingAlong ? [BLOCK_HALF_H, BLOCK_HALF_W] : [BLOCK_HALF_W, BLOCK_HALF_W];
    const reach = (θ: number) => a * Math.abs(Math.cos(θ)) + b * Math.abs(Math.sin(θ));
    const rise = (θ: number) => a * Math.abs(Math.sin(θ)) + b * Math.abs(Math.cos(θ));
    const face = (m.wall!.x * dx + m.wall!.y * dy) - 0.5;
    // Keep the leading edge at or before the wall's face, and (unless it's falling) the block above the floor.
    const fit = (pos: THREE.Vector3, θ: number, floor: boolean) => {
      const over = pos.dot(ahead) + reach(θ) - face;
      if (over > 0) pos.addScaledVector(ahead, -over);
      if (floor) pos.y = Math.max(pos.y, rise(θ));
    };
    // A fling comes down hard against the wall: mid-tumble, on the floor, its body meeting the wall
    // (the look the user chose). A hop or a crash meets the wall's face exactly with its leading edge,
    // since a lying block tipping up would otherwise pass right into it.
    const θc = (Math.PI / 2) * (upright ? FLY_WALL_TIP_FLING : crash ? FLY_WALL_TIP_CRASH : FLY_WALL_TIP_HOP);
    const contact = end.clone();
    if (upright) contact.addScaledVector(ahead, FLY_WALL_FLING_REACH);
    else {
      contact.addScaledVector(ahead, face - reach(θc) - contact.dot(ahead));
      contact.y = Math.max(end.y, rise(θc));
    }
    const tiles = Math.hypot(contact.x - start.x, contact.z - start.z);
    const arc = FLY_ARC_BASE + FLY_ARC_PER_TILE * tiles;
    // Quicker than a free flight, and picking up speed into the wall, so the hit reads as an impact.
    await this.tween((FLY_MS_BASE + FLY_MS_PER_TILE * tiles) * FLY_WALL_PACE, (t) => {
      const θ = θc * t;
      this.block.position.lerpVectors(start, contact, t * (0.6 + 0.4 * t));
      this.block.position.y += arc * 4 * t * (1 - t) * (1 - 0.35 * t);
      if (!upright) fit(this.block.position, θ, false);
      turn(θ);
    });
    const wall = this.walls.find((w) => w.layer === this.layer && w.x === m.wall!.x && w.y === m.wall!.y);
    if (wall) void this.shake(wall.pillar, dx, dy);
    if (crash) {
      await this.tween(FLY_WALL_CRASH_MS, (t) => {
        const θ = θc + (final - θc) * t;
        this.block.position.lerpVectors(contact, end, easeOut(t));
        this.block.position.y -= FLY_WALL_CRASH_DROP * t * t;
        fit(this.block.position, θ, false);
        turn(θ);
      });
      this.fallSpeed = FLY_WALL_FALL_SPEED;
      return;
    }
    // Settles: a fling rocks back upright with the slightest overshoot away from the wall; a hop
    // tips the rest of the way up against it, without overshooting into it.
    await this.tween(FLY_WALL_KNOCK_MS, (t) => {
      const θ = upright ? θc * (1 - easeOutBack(t)) : θc + (final - θc) * easeInOut(t);
      this.block.position.lerpVectors(contact, end, easeInOut(t));
      if (!upright) fit(this.block.position, θ, true);
      turn(θ);
    });
    this.placeBlock(m.to);
  }

  /**
   * Gravity flips: the block falls "up" to the other layer, turning over on the way, while the camera
   * turns with it and the planet and moon trade places. The ring bursts, stardust marks the way, and
   * a pulse on the tiles says where you landed.
   */
  private async flip(m: Motion): Promise<void> {
    const from = this.layer;
    this.layer = 1 - from;
    void this.tween(500, (t) => this.flipGlows.forEach((g) => (g.emissiveIntensity = 0.8 + 2 * Math.sin(t * Math.PI))));
    this.flipBurst(m.from, from);
    // The landing spot in the old frame's coordinates: the frames mirror each other about CEIL_H / 2.
    const target = blockPosition(m.to);
    const start = this.block.position.clone();
    const end = new THREE.Vector3(target.x, CEIL_H - target.y, target.z);
    const base = this.block.quaternion.clone();
    const turn = new THREE.Quaternion();
    const axis = new THREE.Vector3(1, 0, 0);
    const token = Symbol('flip');
    this.flipTurn = token;
    const sideFrom = this.side;
    const sideTo = this.peeking ? from : this.layer;
    const worldY = (y: number) => (from ? CEIL_H - y : y);
    const [spanX, spanZ] = [m.from.o === 'X' ? blockLength(m.from) : 1, m.from.o === 'Y' ? blockLength(m.from) : 1];
    let emitted = 0;
    await this.tween(FLIP_MS, (t) => {
      const e = easeInOut(t);
      this.block.position.lerpVectors(start, end, e);
      turn.setFromAxisAngle(axis, Math.PI * e);
      this.block.quaternion.copy(base).premultiply(turn);
      // A trail along the path walked so far, however few frames there have been to draw it.
      for (; emitted / TRAIL_STEPS <= t; emitted++) {
        const s = easeInOut(emitted / TRAIL_STEPS);
        const born = performance.now() / 1000 - (t - emitted / TRAIL_STEPS) * (FLIP_MS / 1000);
        for (let i = 0; i < TRAIL_MOTES; i++) {
          this.stardust.emit(
            THREE.MathUtils.lerp(start.x, end.x, s) + (Math.random() - 0.5) * spanX,
            worldY(THREE.MathUtils.lerp(start.y, end.y, s)) + (Math.random() - 0.5) * 0.9,
            THREE.MathUtils.lerp(start.z, end.z, s) + (Math.random() - 0.5) * spanZ,
            (Math.random() - 0.5) * 0.7,
            (Math.random() - 0.5) * 0.7,
            (Math.random() - 0.5) * 0.7,
            born,
          );
        }
      }
      if (this.flipTurn !== token) return;
      this.side = THREE.MathUtils.lerp(sideFrom, sideTo, e);
      // The floors trade places as the view passes edge-on, when neither faces you.
      const incoming = THREE.MathUtils.smoothstep(e, 0.38, 0.62);
      this.layerAlpha[this.layer] = incoming;
      this.layerAlpha[from] = 1 - incoming;
    });
    if (this.flipTurn === token) this.flipTurn = null;
    this.frames[this.layer].add(this.block);
    this.placeBlock(m.to);
    this.landingPulse(m.to);
  }

  /** A ring of light thrown out from each flip tile under the block, with a scatter of sparks. */
  private flipBurst(block: Block, layer: number): void {
    const now = performance.now() / 1000;
    for (const [x, y] of blockCells(block)) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.5, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: COLORS.flip, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      ring.position.set(x, 0.09, y);
      this.frames[layer].add(ring);
      void this.tween(BURST_MS, (t) => {
        ring.scale.setScalar(1 + easeOut(t) * 2.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t) * (1 - t);
      }).then(() => {
        ring.removeFromParent();
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });
      const planeY = layer ? CEIL_H - 0.1 : 0.1;
      for (let i = 0; i < BURST_SPARKS; i++) {
        const a = (i / BURST_SPARKS) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 1.6 + Math.random() * 1.6;
        this.stardust.emit(x + Math.cos(a) * 0.3, planeY, y + Math.sin(a) * 0.3, Math.cos(a) * speed, (layer ? -1 : 1) * Math.random() * 0.9, Math.sin(a) * speed, now);
      }
    }
  }

  /** A soft violet flash spreading from under the block, so you see at once where you landed. */
  private landingPulse(block: Block): void {
    const level = this.level;
    if (!level) return;
    const { x, z } = blockPosition(block);
    const n = blockLength(block);
    const onTile = blockCells(block).some(([cx, cy]) => cx >= 0 && cy >= 0 && cx < level.width && cy < level.height && this.tiles.has(this.cellKey(this.layer, cx, cy, level.width, level.height)));
    if (!onTile) return;
    const material = () => new THREE.MeshBasicMaterial({ color: COLORS.flip, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const [fill, edge] = [material(), material()];
    const pulse = makeFootprint(fill, edge);
    const [w, d] = [block.o === 'X' ? n : 1, block.o === 'Y' ? n : 1];
    setFootprint(pulse, w, d);
    pulse.position.set(x, FOOTPRINT_LIFT, z);
    this.frames[this.layer].add(pulse);
    void this.tween(LANDING_PULSE_MS, (t) => {
      // It grows outward past the block, which would otherwise hide most of it.
      const spread = easeOut(t);
      pulse.scale.set(1 + (spread * 1.3) / w, 1, 1 + (spread * 1.3) / d);
      fill.opacity = 0.7 * (1 - t) * (1 - t);
      edge.opacity = 1 - t;
    }).then(() => {
      pulse.removeFromParent();
      fill.dispose();
      edge.dispose();
    });
  }

  /** Light up the whole belt run the block is on, rippling away from it in the push direction. */
  private flareBelts(b: Block, dir: Dir): void {
    const byCell = new Map(this.chevrons.filter((c) => c.dir === dir).map((c) => [c.cell, c] as const));
    const depth = new Map<number, number>();
    const queue = blockCells(b).map(([x, y]) => this.layer * 1e8 + y * 10000 + x).filter((k) => byCell.has(k));
    queue.forEach((k) => depth.set(k, 0));
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      for (const n of [k + 1, k - 1, k + 10000, k - 10000]) {
        if (byCell.has(n) && !depth.has(n)) {
          depth.set(n, depth.get(k)! + 1);
          queue.push(n);
        }
      }
    }
    const lit = this.chevrons.filter((c) => depth.has(c.cell));
    const span = Math.max(0, ...depth.values()) * FLARE_STEP_MS + FLARE_MS;
    void this.tween(span, (t) => {
      const now = t * span;
      for (const c of lit) {
        const local = (now - depth.get(c.cell)! * FLARE_STEP_MS) / FLARE_MS;
        c.boost = local > 0 && local < 1 ? Math.sin(local * Math.PI) : 0;
      }
    });
  }

  /** A shape switch changed the block: it squashes or stretches to its new length, with a little bounce. */
  async reshape(from: Block, to: Block): Promise<void> {
    const [a, b] = [blockLength(from), blockLength(to)];
    await this.tween(360, (t) => {
      const e = easeOutBack(t);
      const n = a + (b - a) * e;
      this.block.scale.set(1 + 0.12 * Math.sin(t * Math.PI), n / 2, 1 + 0.12 * Math.sin(t * Math.PI));
      this.block.position.y = n / 2;
    });
    this.placeBlock(to);
  }

  pressSwitches(cells: { x: number; y: number }[]): void {
    for (const { x, y } of cells) {
      const sw = this.switches.get(this.layer * 1e8 + y * 10000 + x);
      if (sw) void this.tween(260, (t) => (sw.scale.y = 1 - Math.sin(t * Math.PI) * 0.7));
    }
  }

  setBridges(mask: number): Promise<void> {
    this.buildBlueprints(mask, mask ^ this.bridgeMask);
    const changes = this.bridges.filter((b) => b.slab.visible !== bridgeOut(b.tile, b.group, mask));
    if (changes.length === 0) return Promise.resolve();
    for (const b of changes) b.slab.visible = true;
    return this.tween(260, (t) => {
      for (const b of changes) {
        const on = bridgeOut(b.tile, b.group, mask);
        const s = on ? easeOut(t) : 1 - easeOut(t);
        b.slab.scale.set(Math.max(s, 0.001), 1, Math.max(s, 0.001));
        if (t === 1) b.slab.visible = on;
      }
    });
  }

  async fall(level: Level, block: Block, broke?: { x: number; y: number }): Promise<void> {
    const key = (x: number, y: number) => this.cellKey(this.layer, x, y, level.width, level.height);
    const tile = broke ? this.tiles.get(key(broke.x, broke.y)) : undefined;
    const start = this.block.position.clone();
    const spinX = (Math.random() - 0.5) * 2;
    const spinZ = (Math.random() - 0.5) * 2;
    const rot = this.block.rotation.clone();
    // Lean toward whichever half is over the void.
    const unsupported = blockCells(block).filter(([x, y]) => !this.tiles.has(key(x, y)));
    const lean = new THREE.Vector3();
    for (const [x, y] of unsupported) lean.add(new THREE.Vector3(x - start.x, 0, y - start.z));

    // A crash into a wall is already falling when this starts.
    const speed = this.fallSpeed;
    this.fallSpeed = 0;
    await this.tween(900, (t) => {
      const drop = 14 * t * t + speed * t;
      this.block.position.set(start.x + lean.x * t * 1.2, start.y - drop, start.z + lean.z * t * 1.2);
      this.block.rotation.set(rot.x + spinX * t * 2, rot.y, rot.z + spinZ * t * 2);
      if (tile) {
        tile.obj.position.y = tile.baseY - drop * 0.9;
        tile.obj.rotation.x = spinX * t;
      }
    });
    this.block.visible = false;
  }

  /**
   * The block sinks into the goal until it fills the hole: its top settles just above the floor
   * and it stays there, like a peg pushed into its socket. (The part below the floor is squashed
   * into the hole's depth, so nothing pokes out under the island.)
   */
  async win(): Promise<void> {
    const height = 1.96 * this.block.scale.y;
    const [top0, bottom0] = [height, 0];
    const [top1, bottom1] = [GOAL_FILL_TOP, -GOAL_DEPTH];
    const marker = this.goalMarker;
    await this.tween(650, (t) => {
      const e = easeIn(t);
      const top = top0 + (top1 - top0) * e;
      const bottom = bottom0 + (bottom1 - bottom0) * e;
      this.block.position.y = (top + bottom) / 2;
      this.block.scale.y = (top - bottom) / 1.96;
      // Slim down a touch to slot inside the glowing rim.
      const fit = 1 - 0.12 * e;
      this.block.scale.x = fit;
      this.block.scale.z = fit;
      // The marker swells briefly, then shrinks away as the block sinks.
      if (marker) marker.scale.setScalar(Math.max((1 - t) * (1 + Math.sin(t * Math.PI) * 0.5), 0.001));
    });
    // A little settle, so it reads as filling the hole rather than stopping.
    await this.tween(160, (t) => (this.block.position.y = (top1 + bottom1) / 2 - 0.03 * Math.sin(t * Math.PI)));
  }

  /** Drop the block onto the board from above, as it arrives in a level. */
  dropBlock(): Promise<void> {
    const y = this.block.position.y;
    this.block.position.y = y + 8;
    return this.tween(520, (t) => (this.block.position.y = y + 8 * (1 - easeOutBounce(t))));
  }

  /** Jump every animation in progress to its end, for when what's on screen is about to be replaced. */
  finishAnimations(): void {
    for (const tw of this.tweens) tw.start = -Infinity;
  }

  /** Islands rise into place and the block drops in from above. */
  private intro(): Promise<void> {
    const views = [...this.tiles.entries()];
    const final = this.block.position.clone();
    const tileAnim = this.tween(700, (t) => {
      for (const [i, view] of views) {
        const delay = ((i * 7919) % 97) / 97 * 0.4;
        const local = Math.min(Math.max((t - delay) / 0.6, 0), 1);
        view.obj.position.y = view.baseY - 6 * (1 - easeOut(local));
      }
    });
    const blockAnim = this.tween(950, (t) => {
      const local = Math.min(Math.max((t - 0.45) / 0.55, 0), 1);
      this.block.position.y = final.y + 8 * (1 - easeOutBounce(local));
    });
    return Promise.all([tileAnim, blockAnim]).then(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Loop.

  private tween(duration: number, update: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now(), duration, update, resolve });
    });
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    // An update can start another tween, which lands in the fresh list and runs from the next frame.
    const running = this.tweens;
    this.tweens = [];
    const unfinished = running.filter((tw) => {
      const t = Math.min((now - tw.start) / tw.duration, 1);
      tw.update(t);
      if (t >= 1) tw.resolve();
      return t < 1;
    });
    this.tweens.unshift(...unfinished);

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > this.center.x + 30) c.position.x = this.center.x - 30;
    }
    this.scenery?.update(now / 1000, dt, this.renderer.domElement.height, this.camera);
    this.sampleUpdate?.(now / 1000);
    for (const bird of this.sampleBirds) (bird.userData.flap as (s: number) => void)(now / 1000);
    this.stardust.update(now / 1000, this.renderer.domElement.height, this.camera.fov);
    for (const c of this.chevrons) {
      // Each chevron travels across the tile, growing in at the back and shrinking out at the front.
      const p = (now / BELT_MS + c.phase) % 1;
      c.obj.position.x = (p - 0.5) * 0.56;
      c.obj.scale.setScalar(Math.max(Math.sin(p * Math.PI), 0.001) * (1 + c.boost * 0.35));
      c.mat.emissiveIntensity = 0.5 + c.boost * 2.2;
    }
    // Every tread is turned to face its arrow, so one scroll moves them all the right way.
    treadScroll.x = -((now / BELT_MS) % 1);
    for (const p of this.padArrows.values()) p.mat.emissiveIntensity = 0.35 + p.boost * 1.6;
    for (const g of this.gusts) {
      // Each streak drifts along the arrow, fading in at the back and out at the front.
      const p = (now / GUST_MS + g.phase) % 1;
      g.obj.position.x = (p - 0.5) * 0.7;
      (g.obj.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.75;
    }
    if (this.goalMarker) {
      this.goalMarker.rotation.y += dt * 0.8;
      this.goalMarker.position.y = MARKER_Y + Math.sin(now / 520) * 0.1;
    }

    // Gravity: the camera turns over (or swings for a peek), and each layer fades as it gets in the way.
    const k = Math.min(1, dt * TURN_RATE);
    if (!this.flipTurn) {
      this.side += (this.sideTarget() - this.side) * k;
      this.layerAlpha = this.layerAlpha.map((a, l) => a + (this.alphaTarget(l) - a) * k);
    }
    this.applyLayerAlpha();
    this.updatePeekGhost(k);
    this.updatePeekOutline(now);
    for (const g of this.flipGlows) g.emissiveIntensity += (0.8 + Math.sin(now / 400) * 0.25 - g.emissiveIntensity) * 0.1;
    this.bpAlpha += (this.bpTarget() - this.bpAlpha) * k;
    for (const m of this.bpMats) m.opacity = m.userData.opacity * this.bpAlpha;
    this.blueprints.forEach((g, l) => (g.visible = l === this.layer && this.bpAlpha > 0.01));

    // Ease the camera toward its 90° snap, taking the short way round.
    const target = this.camIndex * (Math.PI / 2);
    let diff = target - this.camAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camAngle += diff * Math.min(1, dt * 10);
    this.camDist += (this.fitDist[this.camIndex] - this.camDist) * Math.min(1, dt * 6);
    this.placeCamera(this.camAngle, this.camDist);

    if (this.sheen.visible) {
      // Mirror the camera across the vertical through the board's center: its highlight lands mid-board.
      const { x, y, z } = this.camera.position;
      this.sheen.position.set(2 * this.center.x - x, y, 2 * this.center.z - z);
      this.sheen.target.position.copy(this.center);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const el = this.renderer.domElement.parentElement!;
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.applyViewShift();
    this.camera.updateProjectionMatrix();
    if (this.bounds.length) this.fitCamera();
  }

  /** Slide the whole picture sideways by a fraction of the screen's width, to make room beside the island for a menu. */
  setViewShift(fraction: number): void {
    this.viewShift = fraction;
    this.applyViewShift();
    this.camera.updateProjectionMatrix();
  }

  private applyViewShift(): void {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement.parentElement!;
    if (this.viewShift) this.camera.setViewOffset(w, h, -this.viewShift * w, 0, w, h);
    else this.camera.clearViewOffset();
  }

  /**
   * Look down at the island's centre from `angle` around it, `dist` away along the view line.
   * `side` turns the view over: 0 looks down at the ground, 1 looks up at the ceiling, the camera
   * swinging over the top on the way (a half turn about the horizontal axis across the view).
   */
  private placeCamera(angle: number, dist: number, side = this.side, cam = this.camera): void {
    const dir = new THREE.Vector3(Math.sin(angle), CAM_RISE, Math.cos(angle)).normalize();
    const look = new THREE.Vector3(this.center.x, THREE.MathUtils.lerp(-0.5, CEIL_H + 0.5, side), this.center.z);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)), Math.PI * side);
    cam.position.copy(look).addScaledVector(dir.applyQuaternion(turn), dist);
    cam.up.set(0, 1, 0).applyQuaternion(turn);
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }

  /** Which side the camera should be on: it follows the layer being looked at in turn mode. */
  private sideTarget(): number {
    if (!this.hasCeiling) return 0;
    return this.peeking ? 1 - this.layer : this.layer;
  }

  /** The blueprint shows on your own floor, and gives way to the real thing while you peek. */
  private bpTarget(): number {
    return this.hasCeiling && !this.peeking && !this.flipTurn ? 1 : 0;
  }

  /**
   * The camera always looks at one floor's walking side (yours, or the other while peeking); the
   * other floor would be in the way, so it vanishes and its blueprint stands in for it.
   */
  private alphaTarget(layer: number): number {
    if (!this.hasCeiling) return 1;
    if (layer === this.sideTarget()) return 1;
    return this.peeking && layer === this.layer ? PEEK_GHOST : 0;
  }

  /**
   * While peeking, your own floor lies pressed flat on the floor you're viewing, cell for cell. In its real
   * place, four tiles off, it would show up somewhere else on screen and say nothing about what lines up.
   */
  private updatePeekGhost(k: number): void {
    this.ghostShift.forEach((shift, layer) => {
      const next = shift + ((this.peeking && layer === this.layer ? 1 : 0) - shift) * k;
      this.ghostShift[layer] = next;
      const [home, sign] = layer ? [CEIL_H, -1] : [0, 1];
      const away = layer ? PEEK_GHOST_LIFT : CEIL_H - PEEK_GHOST_LIFT;
      const group = this.layerGroups[layer];
      group.position.y = THREE.MathUtils.lerp(home, away, next);
      group.scale.y = sign * THREE.MathUtils.lerp(1, PEEK_GHOST_THICKNESS, next);
    });
  }

  /** While peeking the real block hides, and a blinking outline of its face shows where it would be: same cells, flush with the other floor. */
  private updatePeekOutline(now: number): void {
    const outline = this.peekOutline;
    const parent = this.block.parent;
    // Hides the block's frame, not the block, which stays hidden by itself once it's won or fallen.
    for (const f of this.frames) f.visible = !(this.peeking && f === parent);
    outline.visible = this.peeking && this.block.visible;
    if (!outline.visible) return;
    const frame = this.frames[this.frames[0] === parent ? 1 : 0];
    if (outline.parent !== frame) frame.add(outline);
    // Work out the cells from the block itself, so a move made during a peek carries over, cell by cell.
    const along = PEEK_AXIS.set(0, 1, 0).applyQuaternion(this.block.quaternion);
    const n = THREE.MathUtils.clamp(Math.round(this.block.scale.y * 2), 1, 3);
    const standing = Math.abs(along.y) > 0.7;
    const alongX = !standing && Math.abs(along.x) > Math.abs(along.z);
    const alongZ = !standing && !alongX;
    const half = (n - 1) / 2;
    const { x, z } = this.block.position;
    outline.position.set(
      alongX ? Math.round(x - half) + half : Math.round(x),
      FOOTPRINT_LIFT,
      alongZ ? Math.round(z - half) + half : Math.round(z),
    );
    setFootprint(outline, alongX ? n : 1, alongZ ? n : 1);
    const pulse = 0.5 + 0.5 * Math.sin((now / PEEK_BLINK_MS) * Math.PI * 2);
    const [fill, edge] = outline.userData.mats as THREE.MeshBasicMaterial[];
    fill.opacity = 0.05 + pulse * 0.17;
    edge.opacity = 0.4 + pulse * 0.6;
  }

  /**
   * Each floor's shadow of the other: the other floor's tiles (bridges as they stand now) painted
   * into a canvas, blurred soft, then clipped to this floor's own tiles, so it lands only where
   * there's ground to fall on, like a real shadow, and tints whatever tile is there without hiding it.
   */
  private buildBlueprints(bridges: number, pulse = 0): void {
    this.bridgeMask = bridges;
    this.blueprints.forEach((g) => g.clear());
    this.bpMats.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.bpMats = [];
    const level = this.level;
    if (!level?.ceiling) return;
    const [w, h] = [level.width, level.height];
    for (const layer of [0, 1]) {
      const here = layerView(level, layer);
      const there = layerView(level, 1 - layer);
      const solid = (view: Level, i: number) =>
        view.tiles[i] !== Tile.Empty &&
        (!isBridge(view.tiles[i]) || bridgeOut(view.tiles[i], view.groups[i], bridges));
      const pad = SHADOW_BLUR * 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * SHADOW_PX + pad * 2;
      canvas.height = h * SHADOW_PX + pad * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = `blur(${SHADOW_BLUR}px)`;
      ctx.fillStyle = '#0a0a28';
      for (let i = 0; i < w * h; i++) {
        if (!solid(there, i)) continue;
        // Whole cells, so a stretch of floor above casts one continuous shadow.
        ctx.fillRect(pad + (i % w) * SHADOW_PX, pad + Math.floor(i / w) * SHADOW_PX, SHADOW_PX, SHADOW_PX);
      }
      ctx.filter = 'none';
      // Keep it only on this floor's tiles: a shadow needs something to fall on.
      // One path for the whole mask: each separate fill in this mode would wipe all the others.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      for (let i = 0; i < w * h; i++) {
        if (here.tiles[i] === Tile.Empty) continue;
        ctx.rect(pad + (i % w) * SHADOW_PX, pad + Math.floor(i / w) * SHADOW_PX, SHADOW_PX, SHADOW_PX);
      }
      ctx.fill();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false, side: THREE.DoubleSide });
      mat.userData.opacity = SHADOW_OPACITY;
      this.bpMats.push(mat);
      const sx = canvas.width / SHADOW_PX;
      const sz = canvas.height / SHADOW_PX;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
      plane.rotation.x = -Math.PI / 2;
      // Canvas row 0 is grid row 0 (the plane's top edge faces -z after the turn).
      plane.position.set((w - 1) / 2, SHADOW_LIFT, (h - 1) / 2);
      this.blueprints[layer].add(plane);

      // The other floor's bridges, as squares in their switch's color: bright when extended, faint
      // when retracted, and a pulse when a press just changed them, so a switch that reaches the
      // other floor shows what it did without a peek.
      for (let i = 0; i < w * h; i++) {
        if (!isBridge(there.tiles[i])) continue;
        const group = there.groups[i];
        const color = GROUP_COLORS[group % GROUP_COLORS.length];
        const on = bridgeOut(there.tiles[i], group, bridges);
        const [x, y] = [i % w, Math.floor(i / w)];
        const sq = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
        sq.userData.opacity = on ? BRIDGE_ON_OPACITY : BRIDGE_OFF_OPACITY;
        this.bpMats.push(sq);
        const inset = 0.36;
        for (const [ax, az, len] of [[0, -inset, 2 * inset], [0, inset, 2 * inset], [-inset, 0, 0], [inset, 0, 0]] as const) {
          const along = len > 0;
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(along ? 2 * inset + 0.06 : 0.06, 0.005, along ? 0.06 : 2 * inset + 0.06),
            sq,
          );
          bar.position.set(x + ax, SHADOW_LIFT + 0.01, y + az);
          this.blueprints[layer].add(bar);
        }
        if ((pulse >> group) & 1) {
          const glow = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
          glow.userData.opacity = 0;
          this.bpMats.push(glow);
          const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), glow);
          fill.rotation.x = -Math.PI / 2;
          fill.position.set(x, SHADOW_LIFT + 0.012, y);
          this.blueprints[layer].add(fill);
          // Two beats, then settle to the new state. The frame loop applies the opacity.
          void this.tween(BRIDGE_PULSE_MS, (t) => (glow.userData.opacity = 0.7 * Math.abs(Math.sin(t * Math.PI * 2))));
        }
      }
    }
  }

  private applyLayerAlpha(): void {
    const side = this.sideTarget();
    this.layerAlpha.forEach((a, layer) => {
      this.layerGroups[layer].visible = a > 0.01;
      // Mid-flip the view is nearly edge-on, where every root shows at full length, so soil shows only near either end of the turn.
      const soil = this.flipTurn ? Math.abs(this.side - layer) < FLIP_SOIL_BACK : layer === side;
      for (const e of this.earths[layer]) e.visible = soil;
      for (const e of this.layerMats[layer]) {
        const transparent = e.transparent || a < 0.995;
        if (transparent !== e.mat.transparent) {
          e.mat.transparent = transparent;
          e.mat.needsUpdate = true;
        }
        e.mat.opacity = e.opacity * a;
        e.mat.depthWrite = a >= 0.995;
      }
    });
  }

  private sceneryFor(sky: Theme['sky']): Scenery | null {
    const build = SCENERY[sky];
    if (!build) return null;
    let scenery = this.sceneries.get(sky);
    if (!scenery) {
      scenery = build();
      this.sceneries.set(sky, scenery);
      this.scene.add(scenery.group);
    }
    return scenery;
  }

  /** Dress the scene in a chapter's look. A two-floor level also needs its ceiling lit in any theme. */
  private applyTheme(theme: Theme): void {
    this.theme = theme;
    document.body.dataset.theme = theme.id;
    this.blockMat.color.set(theme.block.color);
    this.blockEdgeMat.color.set(theme.block.edge);
    this.blockMat.roughness = theme.block.roughness ?? 0.55;
    // White shows on space; a pale sky needs a dark outline.
    for (const m of this.peekOutline.userData.mats as THREE.MeshBasicMaterial[]) m.color.set(theme.sky === 'stars' ? 0xffffff : 0x2b2f8f);
    if (theme.finish.plastic && !this.plasticEnv) this.plasticEnv = plasticEnvironment(this.renderer);
    this.scene.environment = theme.finish.plastic ? this.plasticEnv : null;
    this.scene.environmentIntensity = 0.5;
    this.sheen.visible = !!theme.finish.plastic;
    this.hemi.color.set(theme.hemi.sky);
    this.hemi.groundColor.set(theme.hemi.ground);
    this.hemi.intensity = theme.hemi.intensity;
    this.sun.color.set(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    // The ceiling would shade the whole ground.
    this.sun.castShadow = !this.hasCeiling;
    this.moonlight.intensity = this.hasCeiling ? 2.2 : 0;
    this.stars.visible = theme.sky === 'stars';
    // Clouds drift below the ground, right where the camera goes to look up at a ceiling.
    for (const c of this.clouds) c.visible = theme.sky === 'clouds' && !this.hasCeiling;
    if (this.scenery) this.scenery.group.visible = false;
    // The camera turns over on two-floor levels, and only Starfall's surroundings are built for that.
    this.scenery = this.hasCeiling && theme.sky !== 'stars' ? null : this.sceneryFor(theme.sky);
    if (this.scenery) this.scenery.group.visible = true;
  }

  /** For each 90° camera position, the closest distance that keeps the whole island on screen. */
  private fitCamera(): void {
    const p = new THREE.Vector3();
    const fits = (angle: number, dist: number) => {
      this.placeCamera(angle, dist, 0);
      return this.bounds.every((b) => {
        p.copy(b).project(this.camera);
        return Math.abs(p.x) <= FIT_X && Math.abs(p.y) <= FIT_Y;
      });
    };
    this.fitDist = [0, 1, 2, 3].map((i) => {
      let [lo, hi] = [CAM_MIN_DIST, 400];
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (fits((i * Math.PI) / 2, mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    });
    this.placeCamera(this.camAngle, this.camDist);
  }
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  opts: THREE.MeshStandardMaterialParameters = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = !opts.transparent;
  return mesh;
}

/** A box with rounded edges, which catch the light the way molded plastic does. */
function rounded(
  w: number,
  h: number,
  d: number,
  color: number,
  radius: number,
  opts: THREE.MeshStandardMaterialParameters = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 3, radius),
    new THREE.MeshStandardMaterial({ color, roughness: 0.3, ...opts }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

const pegGeometry = new THREE.CylinderGeometry(0.05, 0.055, 0.03, 14);

/** Turns a +x-pointing belt top to face each grid direction ("up" is -z). */
const BELT_ROTATION: Record<Dir, number> = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };

/** A bold flat ">" pointing +x, sitting on the belt surface. */
function makeChevron(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
  g.userData.mat = mat;
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.035, 0.11), mat);
    arm.rotation.y = side * Math.PI / 4;
    arm.position.set(0, 0.018, side * 0.13);
    g.add(arm);
  }
  return g;
}

/** A flat arrow pointing +x for launch pads: a short shaft and a broad head. */
function arrowGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.3, -0.07);
  s.lineTo(0.02, -0.07);
  s.lineTo(0.02, -0.2);
  s.lineTo(0.32, 0);
  s.lineTo(0.02, 0.2);
  s.lineTo(0.02, 0.07);
  s.lineTo(-0.3, 0.07);
  s.closePath();
  const geom = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  // The shape is drawn in x/y; lay it flat on the tile with its point still toward +x.
  geom.rotateX(-Math.PI / 2);
  return geom;
}

/** Four corner brackets on a tile a flight (or a flip) can land on, in the pads' wind colour by default. */
function makeLandingMark(color: number = COLORS.mark): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const len = 0.26;
  const w = 0.075;
  const edge = 0.44 - w / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const along of ['x', 'z'] as const) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : w, 0.014, along === 'x' ? w : len), mat);
        const inset = (len - w) / 2;
        arm.position.set(sx * (edge - (along === 'x' ? inset : 0)), 0.012, sz * (edge - (along === 'z' ? inset : 0)));
        g.add(arm);
      }
    }
  }
  return g;
}

/** Centre of the block's mesh for a grid position. */
function blockPosition(b: Block): THREE.Vector3 {
  const half = (blockLength(b) - 1) / 2;
  if (b.o === 'S') return new THREE.Vector3(b.x, blockLength(b) / 2, b.y);
  if (b.o === 'X') return new THREE.Vector3(b.x + half, 0.5, b.y);
  return new THREE.Vector3(b.x, 0.5, b.y + half);
}

/** A darker shade of a color: the rim that keeps a mechanic readable on any floor. */
/**
 * A raised stone wall, with a thin line of its switch's color set in the ground around it. When it
 * sinks, its top stays flush with the ground inside that line.
 */
function makeWall(color: number, stone: WallStone): { frame: THREE.Object3D; pillar: THREE.Object3D } {
  const frame = new THREE.Group();
  const [outer, bar] = [WALL_WIDTH + 0.08, 0.05];
  for (const [dx, dz, w, d] of [[0, -outer / 2 + bar / 2, outer, bar], [0, outer / 2 - bar / 2, outer, bar], [-outer / 2 + bar / 2, 0, bar, outer - 2 * bar], [outer / 2 - bar / 2, 0, bar, outer - 2 * bar]]) {
    const edge = box(w, WALL_FLUSH + 0.006, d, color, { roughness: 0.6 });
    edge.position.set(dx, (WALL_FLUSH + 0.006) / 2, dz);
    edge.castShadow = false;
    frame.add(edge);
  }
  // The same top twice: in the floor, flush with the ground, and on the pillar that rises over it.
  frame.add(wallTop(WALL_FLUSH, 0, stone, false));
  const pillar = new THREE.Group();
  const shoulder = WALL_HEIGHT - WALL_NOTCH;
  const body = stoneBox(WALL_WIDTH, shoulder, WALL_WIDTH, stone);
  body.position.y = shoulder / 2;
  pillar.add(body, wallTop(WALL_NOTCH, shoulder, stone, true));
  return { frame, pillar };
}

/**
 * Walls that never move: plain low blocks of stone joined into one mass, with one layer of soil under
 * the island's edge. In a snowy world their tops are only dusted, so a maze still reads from above.
 */
function makeLowWalls(cells: { x: number; y: number; edge: boolean }[], theme: Theme): THREE.Object3D {
  const stone = wallStone(theme);
  const merged = (parts: THREE.BufferGeometry[], material: THREE.Material) => {
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    parts.forEach((p) => p.dispose());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const g = new THREE.Group();
  g.add(merged(cells.map(({ x, y }) => stoneGeometry(1, LOW_WALL_HEIGHT, 1).translate(x, LOW_WALL_HEIGHT / 2, y)), new THREE.MeshStandardMaterial({ map: stoneMap(stone), roughness: 0.95 })));
  if (stone.snow !== undefined) {
    const top = (x: number, y: number) => {
      const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(x, LOW_WALL_HEIGHT + 0.002, y);
      // Each cell takes its own quarter of the texture, so the dusting doesn't repeat tile to tile.
      const uv = plane.attributes.uv;
      const [u, v] = [(Math.abs(x) % 2) / 2, (Math.abs(y) % 2) / 2];
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) / 2, v + uv.getY(i) / 2);
      return plane;
    };
    g.add(merged(cells.map(({ x, y }) => top(x, y)), new THREE.MeshStandardMaterial({ map: dustedMap(stone), roughness: 0.95 })));
  }
  const edges = cells.filter((c) => c.edge);
  if (edges.length) {
    const soil = new THREE.MeshStandardMaterial({ color: theme.earth.soil, roughness: 0.85 });
    g.add(merged(edges.map(({ x, y }) => new THREE.BoxGeometry(0.9, 0.63, 0.9).translate(x, -0.31, y)), soil));
  }
  return g;
}

/**
 * The top of a wall: a darker deck between four notched corners `height` tall, starting at `y`.
 * A raised top in a snowy world holds snow on its deck and corners.
 */
function wallTop(height: number, y: number, stone: WallStone, raised: boolean): THREE.Object3D {
  const top = new THREE.Group();
  const deck = stoneBox(WALL_WIDTH, WALL_FLUSH / 2, WALL_WIDTH, stone, stone.deck);
  deck.position.y = y + WALL_FLUSH / 4;
  top.add(deck);
  const snow = raised ? stone.snow : undefined;
  if (snow !== undefined) {
    const drift = box(WALL_WIDTH - 0.04, 0.05, WALL_WIDTH - 0.04, snow, { roughness: 1 });
    drift.position.y = y + 0.025;
    top.add(drift);
  }
  const offset = WALL_WIDTH / 2 - WALL_MERLON / 2;
  for (const [dx, dz] of [[-offset, -offset], [offset, -offset], [-offset, offset], [offset, offset]]) {
    const merlon = stoneBox(WALL_MERLON, height, WALL_MERLON, stone);
    merlon.position.set(dx, y + height / 2, dz);
    top.add(merlon);
    if (snow !== undefined) {
      const cap = box(WALL_MERLON + 0.02, 0.045, WALL_MERLON + 0.02, snow, { roughness: 1 });
      cap.position.set(dx, y + height + 0.0225, dz);
      top.add(cap);
    }
  }
  return top;
}

/** One texture's worth of wall, in tiles: two bricks long and four courses high. */
const BRICK_TILE = 0.8;
/** First Glade's walls, and any world that hasn't chosen its own stone. */
const BRICK: WallStone = {
  style: 'brick',
  shades: ['#8f8574', '#857b6b', '#7a7263', '#97897a', '#8a7a68', '#807a6e'],
  mortar: '#5d5548',
  deck: WALL_DECK_TINT,
};
const wallStone = (theme: Theme): WallStone => theme.wall ?? BRICK;
/** Made once per stone and shared by every wall. */
const stoneMaps = new Map<WallStone, THREE.CanvasTexture>();
const dustedMaps = new Map<WallStone, THREE.CanvasTexture>();

function stoneMap(stone: WallStone): THREE.CanvasTexture {
  let map = stoneMaps.get(stone);
  if (!map) stoneMaps.set(stone, (map = canvasMap(stone.style === 'ashlar' ? ashlarCanvas(stone) : brickCanvas(stone), true)));
  return map;
}

/** The stone's texture under a dusting of snow: drifts in some joints and a few patches, never a full cover. */
function dustedMap(stone: WallStone): THREE.CanvasTexture {
  let map = dustedMaps.get(stone);
  if (map) return map;
  const base = stone.style === 'ashlar' ? ashlarCanvas(stone, false) : brickCanvas(stone);
  const ctx = base.getContext('2d')!;
  const size = base.width;
  let s = 7919;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const hex = stone.snow ?? 0xffffff;
  const [r, g, b] = [hex >> 16, (hex >> 8) & 255, hex & 255];
  // Soft-edged drifts, stretched along the wind, fading out rather than ending in a hard rim.
  for (let i = 0; i < 7; i++) {
    const [x, y, rad] = [rnd() * size, rnd() * size, 14 + rnd() * 18];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.35 + rnd() * 0.2);
    const drift = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    drift.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.75)`);
    drift.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.4)`);
    drift.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = drift;
    ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  dustedMaps.set(stone, (map = canvasMap(base, false)));
  return map;
}

function canvasMap(canvas: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

/** Stone bricks in a running bond, repeating seamlessly. */
function brickCanvas(stone: WallStone): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = stone.mortar;
  ctx.fillRect(0, 0, size, size);
  const [courses, perRow, mortar] = [4, 2, 5];
  const [h, w] = [size / courses, size / perRow];
  let n = 0;
  const shade = () => stone.shades[Math.floor(Math.abs(Math.sin(++n * 12.9898) * 43758.5453) % 1 * stone.shades.length)];
  for (let row = 0; row < courses; row++) {
    const shift = row % 2 ? w / 2 : 0;
    for (let col = 0; col < perRow; col++) {
      ctx.fillStyle = shade();
      // A brick running off the right edge continues on the left, so the texture tiles.
      for (const wrap of [0, -size]) ctx.fillRect(col * w + shift + wrap + mortar / 2, row * h + mortar / 2, w - mortar, h - mortar);
    }
  }
  return canvas;
}

/**
 * Big cut stones in uneven courses, each a little lighter at the top, flecked like granite, repeating
 * seamlessly. In a snowy world, snow lies along the top of some stones (`ledges`).
 */
function ashlarCanvas(stone: WallStone, ledges = true): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = 4271;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = stone.mortar;
  ctx.fillRect(0, 0, size, size);
  const mortar = 6;
  const courses = [92, 78, 86];
  let top = 0;
  for (const h of courses) {
    // Stone widths for this course, scaled so they fill the width exactly and the texture tiles.
    const widths: number[] = [];
    for (let sum = 0; sum < size; ) sum += widths[widths.push(60 + rnd() * 70) - 1];
    const total = widths.reduce((a, b) => a + b, 0);
    let x = rnd() * size;
    for (const raw of widths) {
      const w = (raw * size) / total;
      const shade = stone.shades[Math.floor(rnd() * stone.shades.length)];
      const ledge = ledges && stone.snow !== undefined && rnd() < 0.45;
      const ledgeFrom = rnd() * 0.3;
      const ledgeTo = 0.6 + rnd() * 0.4;
      for (const wrap of [0, -size]) {
        const [sx, sy, sw, sh] = [x + wrap + mortar / 2, top + mortar / 2, w - mortar, h - mortar];
        const face = ctx.createLinearGradient(0, sy, 0, sy + sh);
        face.addColorStop(0, lighten(shade, 0.12));
        face.addColorStop(0.35, shade);
        face.addColorStop(1, lighten(shade, -0.1));
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 7);
        ctx.fill();
        if (ledge) {
          ctx.fillStyle = cssColor(stone.snow!);
          ctx.beginPath();
          ctx.roundRect(sx + sw * ledgeFrom, sy - 1, sw * (ledgeTo - ledgeFrom), 5, 2.5);
          ctx.fill();
        }
      }
      x += w;
    }
    top += h;
  }
  // Granite flecks: tiny light and dark grains all over.
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.25;
    ctx.fillStyle = rnd() < 0.5 ? '#2c313a' : '#c7ccd4';
    ctx.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** A CSS color lightened (or, below zero, darkened) by a fraction. */
function lighten(css: string, by: number): string {
  const n = parseInt(css.slice(1), 16);
  const f = (c: number) => Math.round(by >= 0 ? c + (255 - c) * by : c * (1 + by));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** A box of stone whose bricks all come out the same size, whatever the box's proportions. */
function stoneBox(w: number, h: number, d: number, stone: WallStone, tint = 0xffffff): THREE.Mesh {
  const mesh = new THREE.Mesh(stoneGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: stoneMap(stone), color: tint, roughness: 0.95 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function stoneGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  // Four corners per face, in the order +x, -x, +y, -y, +z, -z.
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  faces.forEach(([across, up], face) => {
    for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * across) / BRICK_TILE, (uv.getY(i) * up) / BRICK_TILE);
  });
  return geometry;
}

const LEAF_DARK = 0x234f24;
const LEAF_MID = 0x2f6b2c;
const LEAF_LIGHT = 0x46883a;
/** Flat-shaded clumps, shared by every hedge: only the materials are per hedge, since a floor fades on its own. */
const leafClump = new THREE.IcosahedronGeometry(1, 0);

/** A clipped hedge of leaf clumps with no switch color, and the mat of leaves it leaves when it falls. */
function makeHedge(jitter: number): { bush: THREE.Object3D; flat: THREE.Object3D } {
  const clump = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const [dark, mid, light] = [clump(LEAF_DARK), clump(LEAF_MID), clump(LEAF_LIGHT)];
  const random = (i: number) => Math.abs(Math.sin((jitter + 1) * 91.7 + i * 37.3) * 2371.13) % 1;
  const bush = new THREE.Group();
  const body = box(0.8, HEDGE_HEIGHT - 0.1, 0.8, LEAF_DARK, { roughness: 1 });
  body.position.y = (HEDGE_HEIGHT - 0.1) / 2;
  bush.add(body);
  let n = 0;
  // Clumps stand proud of each side and the top, darker low down and lighter up where the sun is.
  for (let row = 0; row < 3; row++) {
    const y = 0.22 + row * 0.33;
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2 + random(n++) * 0.5;
      const r = 0.47 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const leaf = new THREE.Mesh(leafClump, row === 0 ? dark : row === 1 ? mid : light);
      leaf.position.set(Math.cos(angle) * r * 0.86, y + random(n++) * 0.08, Math.sin(angle) * r * 0.86);
      leaf.scale.setScalar(0.13 + random(n++) * 0.05);
      leaf.rotation.set(random(n++) * 3, random(n++) * 3, 0);
      leaf.castShadow = true;
      bush.add(leaf);
    }
  }
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(leafClump, i % 3 ? light : mid);
    const [gx, gz] = [(i % 3) - 1, Math.floor(i / 3) - 1];
    leaf.position.set(gx * 0.27 + (random(n++) - 0.5) * 0.08, HEDGE_HEIGHT - 0.06 + random(n++) * 0.05, gz * 0.27 + (random(n++) - 0.5) * 0.08);
    leaf.scale.setScalar(0.17 + random(n++) * 0.05);
    leaf.rotation.set(random(n++) * 3, random(n++) * 3, 0);
    leaf.castShadow = true;
    bush.add(leaf);
  }

  const flat = new THREE.Group();
  const mat = box(0.9, 0.03, 0.9, LEAF_MID, { roughness: 1 });
  mat.position.y = 0.015;
  mat.castShadow = false;
  flat.add(mat);
  for (let i = 0; i < 14; i++) {
    const leaf = new THREE.Mesh(leafClump, i % 3 ? mid : dark);
    leaf.position.set((random(n++) - 0.5) * 0.72, 0.035, (random(n++) - 0.5) * 0.72);
    leaf.scale.set(0.09 + random(n++) * 0.05, 0.022, 0.09 + random(n++) * 0.05);
    leaf.rotation.y = random(n++) * 3;
    flat.add(leaf);
  }
  return { bush, flat };
}

/** A fallen hedge wedged in a gap: a thick slab of leaves, level with the floor, with twigs hanging under it. */
function makeFallenHedge(jitter: number): THREE.Object3D {
  const random = (i: number) => Math.abs(Math.sin((jitter + 1) * 53.1 + i * 41.7) * 1931.3) % 1;
  const clump = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const [dark, mid, light] = [clump(LEAF_DARK), clump(LEAF_MID), clump(LEAF_LIGHT)];
  const g = new THREE.Group();
  const slab = box(0.98, 0.24, 0.98, LEAF_MID, { roughness: 1 });
  slab.position.y = -0.12;
  g.add(slab);
  let n = 0;
  for (let i = 0; i < 18; i++) {
    const leaf = new THREE.Mesh(leafClump, i % 3 === 0 ? light : i % 3 === 1 ? mid : dark);
    leaf.position.set((random(n++) - 0.5) * 0.84, 0.005, (random(n++) - 0.5) * 0.84);
    leaf.scale.set(0.09 + random(n++) * 0.06, 0.018, 0.09 + random(n++) * 0.06);
    leaf.rotation.y = random(n++) * 3;
    g.add(leaf);
  }
  for (let i = 0; i < 16; i++) {
    const leaf = new THREE.Mesh(leafClump, i % 2 ? dark : mid);
    leaf.position.set((random(n++) - 0.5) * 0.9, -0.25 - random(n++) * 0.08, (random(n++) - 0.5) * 0.9);
    leaf.scale.setScalar(0.1 + random(n++) * 0.07);
    leaf.rotation.set(random(n++) * 3, random(n++) * 3, 0);
    g.add(leaf);
  }
  return g;
}

function rimColor(color: number, shade = 0.55): number {
  return new THREE.Color(color).multiplyScalar(shade).getHex();
}

/** One top tile of walkable ground: a plain box, or one of a few detailed tops in a theme's shades. */
function floorTile(jitter: number, theme: Theme, layer: number): THREE.Mesh {
  if (!theme.floor.detail) {
    const plain = box(0.98, 0.18, 0.98, theme.floor.color);
    plain.position.y = -0.09;
    return plain;
  }
  // Per layer: each floor fades on its own as the camera turns over, so they can't share materials.
  const mats = detailMaterials(`${theme.id}-${layer}`, theme.floor.detail, theme.floor.style);
  const geometry = theme.finish.plastic ? plasticFloorGeometry() : floorGeometry();
  const mesh = new THREE.Mesh(geometry, mats[Math.floor(jitter * mats.length)]);
  mesh.position.y = -0.09;
  // A quarter turn per tile, so neighbors sharing a top don't look stamped.
  mesh.rotation.y = (Math.floor(jitter * 64) % 4) * (Math.PI / 2);
  mesh.receiveShadow = true;
  return mesh;
}

let sharedFloorGeometry: THREE.BoxGeometry | null = null;

/** A tile box with the detail texture on its top only: the other faces sample one solid shade. */
function floorGeometry(): THREE.BoxGeometry {
  if (sharedFloorGeometry) return sharedFloorGeometry;
  const geom = new THREE.BoxGeometry(0.98, 0.18, 0.98);
  const uv = geom.attributes.uv;
  const TOP_FACE = 2;
  for (let v = 0; v < uv.count; v++) {
    if (Math.floor(v / 4) !== TOP_FACE) uv.setXY(v, 0.5, 0.5);
  }
  sharedFloorGeometry = geom;
  return geom;
}

let sharedPlasticFloor: THREE.BufferGeometry | null = null;

/** A rounded tile for a plastic floor: the detail texture on its flat top, one solid shade elsewhere. */
function plasticFloorGeometry(): THREE.BufferGeometry {
  if (sharedPlasticFloor) return sharedPlasticFloor;
  const geom = new RoundedBoxGeometry(0.98, 0.18, 0.98, 3, 0.035);
  const { position, normal, uv } = geom.attributes;
  for (let v = 0; v < uv.count; v++) {
    if (normal.getY(v) > 0.7) uv.setXY(v, position.getX(v) / 0.98 + 0.5, 0.5 - position.getZ(v) / 0.98);
    else uv.setXY(v, 0.01, 0.01);
  }
  sharedPlasticFloor = geom;
  return geom;
}

const detailCache = new Map<string, THREE.MeshStandardMaterial[]>();

/** Materials for a theme's detailed floor, built once and shared by every tile. */
function detailMaterials(id: string, shades: number[], style: Theme['floor']['style']): THREE.MeshStandardMaterial[] {
  const cached = detailCache.get(id);
  if (cached) return cached;
  if (style === 'pegboard') {
    // A regular grid, so every tile can share one texture.
    const map = pegboardTexture(shades);
    const mats = [new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.4, roughness: 0.4 })];
    mats[0].userData.keptBetweenLevels = true;
    detailCache.set(id, mats);
    return mats;
  }
  const mats = [1, 2, 3, 4].map((seed) => {
    const map =
      style === 'snow' ? snowTexture(shades, seed) : style === 'slate' ? slateTexture(shades, seed) : style === 'meadow' ? meadowTexture(shades, seed) : detailTexture(shades, seed);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 1 });
    mat.userData.keptBetweenLevels = true;
    return mat;
  });
  detailCache.set(id, mats);
  return mats;
}

/** Holes per side of a pegboard tile: small and shallow, so they read as texture rather than openings. */
const PEG_HOLES = 4;

/** Small round dimples in a regular grid, each with a shaded top edge and a lit bottom lip. */
function pegboardTexture(shades: number[]): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const [dark, base, lit] = shades.map(cssColor);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const r = 8;
  for (let i = 0; i < PEG_HOLES; i++) {
    for (let j = 0; j < PEG_HOLES; j++) {
      const [x, y] = [((i + 0.5) / PEG_HOLES) * size, ((j + 0.5) / PEG_HOLES) * size];
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(x, y + 1.6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/** Soft overlapping blotches and fine specks in shades of one color, seeded so tiles never change. */
function detailTexture(shades: number[], seed: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed * 7919;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = cssColor(shades[1]);
  ctx.fillRect(0, 0, size, size);
  const dab = (count: number, min: number, max: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = cssColor(shades[Math.floor(rnd() * shades.length)]);
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, min + rnd() * (max - min), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  dab(46, 8, 20, 0.4);
  dab(120, 1.5, 4, 0.55);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Moonlit grass: soft patches under short blades leaning every way, with a few tiny pale flowers. */
function meadowTexture(shades: number[], seed: number): THREE.CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed * 104729;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const [dark, base, lit, bright] = shades.map(cssColor);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = i % 2 ? lit : dark;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, 14 + rnd() * 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  for (let i = 0; i < 150; i++) {
    const pick = rnd();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = pick < 0.4 ? dark : pick < 0.8 ? lit : bright;
    const [x, y, a, len] = [rnd() * size, rnd() * size, -Math.PI / 2 + (rnd() - 0.5) * 1.3, 8 + rnd() * 9];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#f2f4ff';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(14 + rnd() * (size - 28), 14 + rnd() * (size - 28), 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Layered slate: broad weathered bands, a few fine cracks, and pale flecks where the sun catches it. */
function slateTexture(shades: number[], seed: number): THREE.CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed * 15485863;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const [dark, base, lit, bright] = shades.map(cssColor);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Broken facets at odd angles, as the rock split: long even bands would look like planks.
  for (let i = 0; i < 12; i++) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = i % 2 ? lit : dark;
    const [x, y, r] = [rnd() * size, rnd() * size, 14 + rnd() * 30];
    const turn = rnd() * Math.PI * 2;
    ctx.beginPath();
    const corners = 4 + Math.floor(rnd() * 3);
    for (let c = 0; c < corners; c++) {
      const a = turn + (c / corners) * Math.PI * 2;
      const reach = r * (0.6 + rnd() * 0.5);
      ctx[c ? 'lineTo' : 'moveTo'](x + Math.cos(a) * reach, y + Math.sin(a) * reach);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Fine cracks.
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = dark;
    let [x, y] = [rnd() * size, rnd() * size];
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 4; step++) {
      x += (rnd() - 0.35) * 26;
      y += (rnd() - 0.5) * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = bright;
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rnd() * size, rnd() * size, 1.2 + rnd() * 2.2, 1 + rnd());
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Wind-shaped snow: soft drifts, ripples with a lit and a shaded side, and a few bright sparkles. */
function snowTexture(shades: number[], seed: number): THREE.CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed * 104729;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const [shade, base, lit, bright] = shades.map(cssColor);
  /** The same color with no opacity: fading to plain `transparent` would fade through black. */
  const clear = (hex: number) => `rgba(${hex >> 16}, ${(hex >> 8) & 255}, ${hex & 255}, 0)`;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Soft drifts: broad, faded pools of light and shade.
  for (let i = 0; i < 7; i++) {
    const [x, y, r] = [rnd() * size, rnd() * size, 40 + rnd() * 50];
    const isShade = i % 3 === 0;
    const pool = ctx.createRadialGradient(x, y, 0, x, y, r);
    pool.addColorStop(0, isShade ? shade : lit);
    pool.addColorStop(1, clear(isShade ? shades[0] : shades[2]));
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, size, size);
  }
  // Ripples, all roughly along one wind direction, drawn shaded side first and lit side just above.
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const [x, y, len, bow] = [rnd() * size * 0.6, rnd() * size, 60 + rnd() * 70, (rnd() - 0.5) * 26];
    const rise = -12 + rnd() * 8;
    const stroke = (color: string, width: number, alpha: number, dy: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.quadraticCurveTo(x + len / 2, y + bow + dy, x + len, y + rise + dy);
      ctx.stroke();
    };
    stroke(shade, 3, 0.45, 2.5);
    stroke(bright, 2.5, 0.7, 0);
  }
  // Sparkles: tiny bright crystals where the sun catches the snow.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.6 + rnd() * 0.4;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, 0.7 + rnd() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Thin tapering roots around a soil clump, merged into one mesh per variant. */
const rootGeometries = [0, 1, 2, 3].map((variant) => {
  const roots: THREE.BufferGeometry[] = [];
  const count = 3 + variant;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + variant;
    const len = 0.35 + ((i * 37 + variant * 13) % 10) * 0.05;
    const root = new THREE.CylinderGeometry(0.042, 0.012, len, 5);
    root.translate(0, -len / 2, 0);
    root.rotateX(0.14 * Math.sin(a * 3));
    root.rotateZ(0.14 * Math.cos(a * 2));
    root.translate(Math.cos(a) * 0.24, -0.72, Math.sin(a) * 0.24);
    roots.push(root);
  }
  return mergeGeometries(roots)!;
});
/** The glowing ends of those same roots, one mesh per variant, so a tile's tips share one light color. */
const rootTipGeometries = [0, 1, 2, 3].map((variant) => {
  const tips: THREE.BufferGeometry[] = [];
  const count = 3 + variant;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + variant;
    const len = 0.35 + ((i * 37 + variant * 13) % 10) * 0.05;
    const tip = new THREE.SphereGeometry(0.045, 7, 5);
    tip.translate(0, -len, 0);
    tip.rotateX(0.14 * Math.sin(a * 3));
    tip.rotateZ(0.14 * Math.cos(a * 2));
    tip.translate(Math.cos(a) * 0.24, -0.72, Math.sin(a) * 0.24);
    tips.push(tip);
  }
  return mergeGeometries(tips)!;
});
const clumpGeometry = new THREE.SphereGeometry(0.38, 14, 10);
const driftGeometry = new THREE.SphereGeometry(1, 10, 6);

/** Clusters of icicles hanging from the soil, merged into one mesh per variant. */
const icicleGeometries = [0, 1, 2, 3].map((variant) => {
  const icicles: THREE.BufferGeometry[] = [];
  const count = 4 + variant;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + variant * 1.3;
    const len = 0.28 + ((i * 41 + variant * 17) % 10) * 0.075;
    const radius = 0.045 + ((i * 23 + variant) % 4) * 0.012;
    const spike = new THREE.ConeGeometry(radius, len, 7);
    spike.rotateX(Math.PI);
    const ring = 0.14 + ((i * 7) % 3) * 0.1;
    spike.translate(Math.cos(a) * ring, -0.62 - len / 2, Math.sin(a) * ring);
    icicles.push(spike);
  }
  return mergeGeometries(icicles)!;
});

/** Hard hanging splinters of rock, flat-shaded so they stay jagged, merged into one mesh per variant. */
const shardGeometries = [0, 1, 2, 3].map((variant) => {
  const shards: THREE.BufferGeometry[] = [];
  const count = 3 + variant;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + variant * 0.9;
    const len = 0.32 + ((i * 29 + variant * 11) % 10) * 0.085;
    const radius = 0.11 + ((i * 13 + variant) % 4) * 0.04;
    const shard = new THREE.ConeGeometry(radius, len, 4);
    shard.rotateX(Math.PI);
    shard.rotateY(a * 2);
    shard.rotateZ(0.14 * Math.sin(a * 3));
    const ring = 0.1 + ((i * 5) % 3) * 0.11;
    shard.translate(Math.cos(a) * ring, -0.62 - len / 2, Math.sin(a) * ring);
    shards.push(shard);
  }
  return mergeGeometries(shards)!;
});
const brassRingGeometry = new THREE.TorusGeometry(0.44, 0.014, 6, 28);

/** Dangling pegs and connector bars under a plastic tile, merged into one mesh per variant. */
const hangingPegGeometries = [0, 1, 2, 3].map((variant) => {
  const parts: THREE.BufferGeometry[] = [];
  const count = 4 + variant;
  const ends: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + variant * 1.1;
    const len = 0.26 + ((i * 37 + variant * 13) % 10) * 0.065;
    const radius = 0.04 + ((i * 11 + variant) % 3) * 0.012;
    const ring = 0.12 + ((i * 5) % 3) * 0.11;
    const [x, z] = [Math.cos(a) * ring, Math.sin(a) * ring];
    const shaft = new THREE.CylinderGeometry(radius, radius, len, 10);
    shaft.translate(x, -0.62 - len / 2, z);
    const cap = new THREE.CylinderGeometry(radius * 1.7, radius * 1.7, 0.055, 12);
    cap.translate(x, -0.62 - len, z);
    parts.push(shaft, cap);
    ends.push([x, -0.62 - len * 0.55, z]);
  }
  // A connector bar between two neighbors, so it reads as parts of a kit rather than spikes.
  const [from, to] = [new THREE.Vector3(...ends[0]), new THREE.Vector3(...ends[1])];
  const span = from.distanceTo(to);
  const bar = new THREE.CylinderGeometry(0.03, 0.03, span, 8);
  bar.rotateZ(Math.PI / 2);
  bar.rotateY(-Math.atan2(to.z - from.z, to.x - from.x));
  bar.translate((from.x + to.x) / 2, Math.max(from.y, to.y), (from.z + to.z) / 2);
  parts.push(bar);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
});

/** One tile of tread, as a plane that sits between the belt's rails, with u running along the arrow. */
const treadGeometry = new THREE.PlaneGeometry(0.98, 0.8);
const treadScroll = new THREE.Vector2();
let sharedTread: THREE.MeshStandardMaterial | null = null;

/** Chunky tread links on one scrolling texture: every belt shares it, so it costs one update a frame. */
function treadMaterial(): THREE.MeshStandardMaterial {
  if (sharedTread) return sharedTread;
  const [w, h] = [256, 128];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#26242c';
  ctx.fillRect(0, 0, w, h);
  const links = 4;
  for (let i = 0; i < links; i++) {
    const x = (i / links) * w;
    ctx.fillStyle = '#6d6974';
    ctx.fillRect(x + 8, 4, w / links - 16, h - 8);
    ctx.fillStyle = '#918d98';
    ctx.fillRect(x + 8, 4, 10, h - 8);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.offset = treadScroll;
  sharedTread = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.5, roughness: 0.4 });
  sharedTread.userData.keptBetweenLevels = true;
  return sharedTread;
}

/** What's under a floating tile: soil, and either hanging rock or a clump with dangling roots. */
function earth(jitter: number, theme: Theme): THREE.Object3D {
  const g = new THREE.Group();
  g.userData.earth = true;
  const dirt = box(0.9, 0.45, 0.9, theme.earth.soil, theme.finish.plastic ? { roughness: 0.35 } : {});
  dirt.position.y = -0.4;
  g.add(dirt);
  if (theme.earth.style === 'plain') return g;
  if (theme.earth.style === 'roots' || theme.earth.style === 'glowroots') {
    const clump = new THREE.Mesh(clumpGeometry, new THREE.MeshStandardMaterial({ color: theme.earth.soil, roughness: 1 }));
    clump.position.y = -0.62;
    clump.scale.set(1, 0.55 + jitter * 0.3, 1);
    const variant = Math.floor(jitter * rootGeometries.length);
    const roots = new THREE.Mesh(
      rootGeometries[variant],
      new THREE.MeshStandardMaterial({ color: theme.earth.hanging, roughness: 1 }),
    );
    g.add(clump, roots);
    if (theme.earth.style === 'glowroots') g.add(new THREE.Mesh(rootTipGeometries[variant], new THREE.MeshBasicMaterial({ color: 0xbfe2ff })));
    return g;
  }
  if (theme.earth.style === 'shards') {
    const shards = new THREE.Mesh(
      shardGeometries[Math.floor(jitter * shardGeometries.length)],
      new THREE.MeshStandardMaterial({ color: theme.earth.hanging, roughness: 1, flatShading: true }),
    );
    g.add(shards);
    return g;
  }
  if (theme.earth.style === 'pegs') {
    const pegs = new THREE.Mesh(
      hangingPegGeometries[Math.floor(jitter * hangingPegGeometries.length)],
      new THREE.MeshStandardMaterial({ color: theme.earth.hanging, roughness: 0.3 }),
    );
    g.add(pegs);
    return g;
  }
  if (theme.earth.style === 'icicles') {
    const icicles = new THREE.Mesh(
      icicleGeometries[Math.floor(jitter * icicleGeometries.length)],
      new THREE.MeshStandardMaterial({ color: theme.earth.hanging, roughness: 0.25 }),
    );
    g.add(icicles);
    return g;
  }
  if (jitter > 0.35) {
    const h = 0.4 + jitter * 0.9;
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, h, 5),
      new THREE.MeshStandardMaterial({ color: theme.earth.hanging, roughness: 1, flatShading: true }),
    );
    rock.rotation.x = Math.PI;
    rock.rotation.y = jitter * 6;
    rock.position.y = -0.62 - h / 2;
    g.add(rock);
  }
  return g;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeIn = (t: number) => t * t;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const easeOut = (t: number) => 1 - (1 - t) ** 2;
function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** A sky full of stars around the level, for the Starfall night. */
function makeStars(): THREE.Points {
  const pts: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    // Far beyond the home world and moon, so they pass in front of the stars.
    v.multiplyScalar(340 + Math.random() * 110);
    pts.push(v.x, v.y, v.z);
    c.setHSL(0.6 + Math.random() * 0.15, 0.6, 0.75 + Math.random() * 0.25);
    colors.push(c.r, c.g, c.b);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(geom, new THREE.PointsMaterial({ size: 3.4, vertexColors: true, sizeAttenuation: true, map: softDot(), transparent: true, depthWrite: false }));
}

const footprintBar = new THREE.BoxGeometry(1, 0.004, 1);
const footprintFill = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A flat rectangle lying on a floor: a bright border and a faint fill. Sized by setFootprint. */
function makeFootprint(fill: THREE.MeshBasicMaterial, edge: THREE.MeshBasicMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(footprintFill, fill));
  for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(footprintBar, edge));
  g.userData.mats = [fill, edge];
  return g;
}

/** Size a footprint to cover `w` by `d` tiles, around its center. */
function setFootprint(g: THREE.Group, w: number, d: number): void {
  const [fw, fd] = [w - FOOTPRINT_INSET * 2, d - FOOTPRINT_INSET * 2];
  const t = FOOTPRINT_BORDER;
  const [fill, ...bars] = g.children;
  fill.scale.set(fw, 1, fd);
  bars.forEach((bar, i) => {
    const across = i < 2;
    const side = i % 2 ? 1 : -1;
    bar.scale.set(across ? fw : t, 1, across ? t : fd);
    bar.position.set(across ? 0 : side * (fw - t) / 2, 0, across ? side * (fd - t) / 2 : 0);
  });
}
