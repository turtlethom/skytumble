import * as THREE from 'three';
import { Motion, blockCells, flightLandings } from '../game/rules';
import { Block, DIR_DELTA, DIRS, Dir, Level, State, Tile } from '../game/types';
import { CONVEYOR_COLORS } from './palette';

const COLORS = {
  grass: 0x86d07a,
  dirt: 0x9a6b4b,
  rock: 0x7d5a44,
  plank: 0xe2b26f,
  plankDark: 0xb98545,
  hole: 0x1d1a2b,
  goal: 0xffd36b,
  block: 0xf0c987,
  blockEdge: 0x8a6436,
  cloud: 0xffffff,
  ice: 0xbfe6ff,
  glint: 0xffffff,
  belt: 0x4a5266,
  rail: 0x8a93a8,
  padStone: 0xdfe5ec,
  padRim: 0xa9b4c2,
  /** Pad arrows, gusts and landing marks share one colour so a mark reads as "a pad sends you here". */
  wind: 0x5cc8ff,
  /** Landing marks: a deeper blue of the same hue, so they hold up on grass. */
  mark: 0x1f8fe0,
};

/** Each bridge group gets its own colour so you can see which switch drives which bridge. */
const GROUP_COLORS = [0xf4a940, 0xb57edc, 0x4fc3f7, 0xef6f6c];

const ROLL_MS = 170;
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
  group: number;
  slab: THREE.Object3D;
}

/** Three.js view of a level. Holds no game rules: the controller tells it what happened. */
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private levelGroup = new THREE.Group();
  private clouds: THREE.Group[] = [];
  private block: THREE.Mesh;
  private tiles = new Map<number, TileView>();
  private switches = new Map<number, THREE.Object3D>();
  private bridges: BridgeView[] = [];
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

    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7a66, 1.4));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.levelGroup);

    const geom = new THREE.BoxGeometry(0.98, 1.96, 0.98);
    this.block = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: COLORS.block, roughness: 0.55 }));
    this.block.castShadow = true;
    this.block.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: COLORS.blockEdge })),
    );
    this.scene.add(this.block);

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

  // -------------------------------------------------------------------------
  // Level construction.

  setLevel(level: Level, state: State): Promise<void> {
    this.levelGroup.clear();
    this.tiles.clear();
    this.switches.clear();
    this.bridges = [];
    this.goalMarker = null;
    this.chevrons = [];
    this.padArrows.clear();
    this.gusts = [];

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        const obj = this.buildTile(level.tiles[i], level.groups[i], x, y);
        if (!obj) continue;
        obj.position.set(x, 0, y);
        this.levelGroup.add(obj);
        this.tiles.set(i, { obj, baseY: 0 });
      }
    }

    // Landing marks ride on their tiles, so they rise in with the island and fall with a broken tile.
    for (const { x, y } of flightLandings(level)) {
      this.tiles.get(y * level.width + x)?.obj.add(makeLandingMark());
    }

    // Frame the tiles themselves, not the grid: a wide, shallow level shouldn't be framed as a square.
    const xs: number[] = [];
    const zs: number[] = [];
    level.tiles.forEach((t, i) => {
      if (t === Tile.Empty) return;
      xs.push(i % level.width);
      zs.push(Math.floor(i / level.width));
    });
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 0.5, Math.max(...zs) + 0.5];
    this.center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.viewSize = Math.max(maxX - minX, maxZ - minZ, 6);
    this.bounds = [];
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of [-0.6, 2]) this.bounds.push(new THREE.Vector3(x, y, z));
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
    this.fitShadows(level);
    this.syncState(state);
    return this.intro();
  }

  private buildTile(tile: Tile, group: number, x: number, y: number): THREE.Object3D | null {
    if (tile === Tile.Empty) return null;
    const g = new THREE.Group();
    // Deterministic per-cell variation so islands look natural.
    const jitter = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

    if (tile === Tile.Bridge) {
      const color = GROUP_COLORS[group % GROUP_COLORS.length];
      const ghost = box(0.94, 0.04, 0.94, color, { transparent: true, opacity: 0.4 });
      ghost.position.y = -0.1;
      const slab = box(0.96, 0.16, 0.96, color, { roughness: 0.7 });
      slab.position.y = -0.08;
      g.add(ghost, slab);
      this.bridges.push({ group, slab });
      return g;
    }

    if (tile === Tile.Fragile) {
      for (let p = -1; p <= 1; p++) {
        const plank = box(0.3, 0.12, 0.96, p === 0 ? COLORS.plankDark : COLORS.plank);
        plank.position.set(p * 0.32, -0.06, 0);
        g.add(plank);
      }
      return g;
    }

    if (tile === Tile.Goal) {
      const pit = box(0.9, 0.5, 0.9, COLORS.hole);
      pit.position.y = -0.35;
      g.add(pit);
      const rim = new THREE.MeshStandardMaterial({ color: COLORS.goal, emissive: COLORS.goal, emissiveIntensity: 0.6 });
      for (const [dx, dz, w, d] of [[0, -0.44, 0.96, 0.08], [0, 0.44, 0.96, 0.08], [-0.44, 0, 0.08, 0.96], [0.44, 0, 0.08, 0.96]]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), rim);
        edge.position.set(dx, -0.1, dz);
        edge.receiveShadow = true;
        g.add(edge);
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
      const ice = box(0.98, 0.18, 0.98, COLORS.ice, { roughness: 0.08, metalness: 0.1 });
      ice.position.y = -0.09;
      g.add(ice, earth(jitter));
      // A couple of diagonal glints so ice reads as slick even without reflections.
      for (const [off, len] of [[-0.18, 0.5], [0.16, 0.3]]) {
        const glint = box(len, 0.01, 0.05, COLORS.glint, { transparent: true, opacity: 0.7, roughness: 0.1 });
        glint.rotation.y = Math.PI / 4;
        glint.position.set(off, 0.005, off * 0.6);
        g.add(glint);
      }
      return g;
    }

    if (tile === Tile.Conveyor) {
      const belt = box(0.98, 0.18, 0.98, COLORS.belt, { roughness: 0.9 });
      belt.position.y = -0.09;
      g.add(belt, earth(jitter));
      // Chevrons are built pointing +x (right), then the whole belt top turns to face its arrow.
      const dir = DIRS[group];
      const top = new THREE.Group();
      top.rotation.y = BELT_ROTATION[dir];
      for (const side of [-1, 1]) {
        const rail = box(0.98, 0.05, 0.08, COLORS.rail);
        rail.position.set(0, 0.02, side * 0.44);
        top.add(rail);
      }
      for (const phase of [0, 0.5]) {
        const chevron = makeChevron(CONVEYOR_COLORS[dir]);
        top.add(chevron);
        this.chevrons.push({ obj: chevron, phase, cell: y * 10000 + x, mat: chevron.userData.mat, dir, boost: 0 });
      }
      g.add(top);
      return g;
    }

    if (tile === Tile.Pad) {
      const stone = box(0.98, 0.18, 0.98, COLORS.padRim, { roughness: 0.9 });
      stone.position.y = -0.09;
      const plate = box(0.82, 0.04, 0.82, COLORS.padStone, { roughness: 0.6 });
      plate.position.y = 0.01;
      g.add(stone, plate, earth(jitter));
      const dir = DIRS[group];
      const top = new THREE.Group();
      top.rotation.y = BELT_ROTATION[dir];
      const mat = new THREE.MeshStandardMaterial({ color: COLORS.wind, emissive: COLORS.wind, emissiveIntensity: 0.35 });
      const arrow = new THREE.Mesh(arrowGeometry(), mat);
      arrow.position.y = 0.03;
      arrow.receiveShadow = true;
      top.add(arrow);
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
      this.padArrows.set(y * 10000 + x, { mat, boost: 0 });
      return g;
    }

    const grass = box(0.98, 0.18, 0.98, COLORS.grass);
    grass.position.y = -0.09;
    g.add(grass, earth(jitter));

    if (tile === Tile.SoftSwitch || tile === Tile.HeavySwitch) {
      const color = GROUP_COLORS[group % GROUP_COLORS.length];
      const sw = new THREE.Group();
      if (tile === Tile.SoftSwitch) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.34, 0.1, 24),
          new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
        );
        sw.add(disc);
      } else {
        for (const angle of [Math.PI / 4, -Math.PI / 4]) {
          const bar = box(0.78, 0.1, 0.18, color, { roughness: 0.4 });
          bar.rotation.y = angle;
          sw.add(bar);
        }
      }
      sw.position.y = 0.05;
      sw.traverse((o) => (o.castShadow = true));
      g.add(sw);
      this.switches.set(y * 10000 + x, sw);
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
    this.placeBlock(state.block);
    this.block.visible = true;
    this.goalMarker?.scale.setScalar(1);
    for (const view of this.tiles.values()) {
      view.obj.position.y = view.baseY;
      view.obj.rotation.set(0, 0, 0);
    }
    for (const b of this.bridges) {
      const on = ((state.bridges >> b.group) & 1) === 1;
      b.slab.visible = on;
      b.slab.scale.set(1, 1, 1);
    }
  }

  private placeBlock(b: Block): void {
    this.block.rotation.set(0, 0, 0);
    this.block.position.copy(blockPosition(b));
    if (b.o === 'X') this.block.rotation.z = Math.PI / 2;
    else if (b.o === 'Y') this.block.rotation.x = Math.PI / 2;
  }

  /** Tip the block over its leading bottom edge. */
  async roll(from: Block, to: Block, dir: Dir): Promise<void> {
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

    this.scene.add(pivot);
    pivot.attach(this.block);
    await this.tween(ROLL_MS, (t) => (pivot.rotation[axis] = angle * easeInOut(t)));
    this.scene.attach(this.block);
    this.scene.remove(pivot);
    this.placeBlock(to);
  }

  /** Carry the block without turning it: a glide that eases to a stop on ice, a steady shove on a belt. */
  async move(m: Motion): Promise<void> {
    if (m.kind === 'fly') return this.fly(m);
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
      const halfAlong = alongLength ? 0.98 : 0.49;
      const toPivot = new THREE.Vector3(-dx * halfAlong, lying ? -0.49 : -0.98, -dy * halfAlong);
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
      .map(([x, y]) => this.padArrows.get(y * 10000 + x))
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
    await this.tween(FLY_MS_BASE + FLY_MS_PER_TILE * tiles, (t) => {
      this.block.position.lerpVectors(start, end, t);
      this.block.position.y += arc * 4 * t * (1 - t);
      tumble.setFromAxisAngle(axis, (Math.PI / 2) * easeInOut(t));
      this.block.quaternion.copy(base).premultiply(tumble);
    });
    this.placeBlock(m.to);
  }

  /** Light up the whole belt run the block is on, rippling away from it in the push direction. */
  private flareBelts(b: Block, dir: Dir): void {
    const byCell = new Map(this.chevrons.filter((c) => c.dir === dir).map((c) => [c.cell, c] as const));
    const depth = new Map<number, number>();
    const queue = blockCells(b).map(([x, y]) => y * 10000 + x).filter((k) => byCell.has(k));
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

  pressSwitches(cells: { x: number; y: number }[]): void {
    for (const { x, y } of cells) {
      const sw = this.switches.get(y * 10000 + x);
      if (sw) void this.tween(260, (t) => (sw.scale.y = 1 - Math.sin(t * Math.PI) * 0.7));
    }
  }

  setBridges(mask: number): Promise<void> {
    const changes = this.bridges.filter((b) => b.slab.visible !== (((mask >> b.group) & 1) === 1));
    if (changes.length === 0) return Promise.resolve();
    for (const b of changes) b.slab.visible = true;
    return this.tween(260, (t) => {
      for (const b of changes) {
        const on = ((mask >> b.group) & 1) === 1;
        const s = on ? easeOut(t) : 1 - easeOut(t);
        b.slab.scale.set(Math.max(s, 0.001), 1, Math.max(s, 0.001));
        if (t === 1) b.slab.visible = on;
      }
    });
  }

  async fall(level: Level, block: Block, broke?: { x: number; y: number }): Promise<void> {
    const tile = broke ? this.tiles.get(broke.y * level.width + broke.x) : undefined;
    const start = this.block.position.clone();
    const spinX = (Math.random() - 0.5) * 2;
    const spinZ = (Math.random() - 0.5) * 2;
    const rot = this.block.rotation.clone();
    // Lean toward whichever half is over the void.
    const unsupported = blockCells(block).filter(([x, y]) => !this.tiles.has(y * level.width + x));
    const lean = new THREE.Vector3();
    for (const [x, y] of unsupported) lean.add(new THREE.Vector3(x - start.x, 0, y - start.z));

    await this.tween(900, (t) => {
      const drop = 14 * t * t;
      this.block.position.set(start.x + lean.x * t * 1.2, start.y - drop, start.z + lean.z * t * 1.2);
      this.block.rotation.set(rot.x + spinX * t * 2, rot.y, rot.z + spinZ * t * 2);
      if (tile) {
        tile.obj.position.y = tile.baseY - drop * 0.9;
        tile.obj.rotation.x = spinX * t;
      }
    });
    this.block.visible = false;
  }

  async win(): Promise<void> {
    const start = this.block.position.y;
    const marker = this.goalMarker;
    await this.tween(650, (t) => {
      this.block.position.y = start - 2.4 * easeIn(t);
      // The marker swells briefly, then shrinks away as the block sinks.
      if (marker) marker.scale.setScalar(Math.max((1 - t) * (1 + Math.sin(t * Math.PI) * 0.5), 0.001));
    });
    this.block.visible = false;
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

    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min((now - tw.start) / tw.duration, 1);
      tw.update(t);
      if (t >= 1) tw.resolve();
      return t < 1;
    });

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > this.center.x + 30) c.position.x = this.center.x - 30;
    }
    for (const c of this.chevrons) {
      // Each chevron travels across the tile, growing in at the back and shrinking out at the front.
      const p = (now / BELT_MS + c.phase) % 1;
      c.obj.position.x = (p - 0.5) * 0.56;
      c.obj.scale.setScalar(Math.max(Math.sin(p * Math.PI), 0.001) * (1 + c.boost * 0.35));
      c.mat.emissiveIntensity = 0.5 + c.boost * 2.2;
    }
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

    // Ease the camera toward its 90° snap, taking the short way round.
    const target = this.camIndex * (Math.PI / 2);
    let diff = target - this.camAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.camAngle += diff * Math.min(1, dt * 10);
    this.camDist += (this.fitDist[this.camIndex] - this.camDist) * Math.min(1, dt * 6);
    this.placeCamera(this.camAngle, this.camDist);

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const el = this.renderer.domElement.parentElement!;
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    if (this.bounds.length) this.fitCamera();
  }

  /** Look down at the island's centre from `angle` around it, `dist` away along the view line. */
  private placeCamera(angle: number, dist: number): void {
    const dir = new THREE.Vector3(Math.sin(angle), CAM_RISE, Math.cos(angle)).normalize();
    const look = new THREE.Vector3(this.center.x, -0.5, this.center.z);
    this.camera.position.copy(look).addScaledVector(dir, dist);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
  }

  /** For each 90° camera position, the closest distance that keeps the whole island on screen. */
  private fitCamera(): void {
    const p = new THREE.Vector3();
    const fits = (angle: number, dist: number) => {
      this.placeCamera(angle, dist);
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

/** Four corner brackets on a tile a flight can land on, in the pads' wind colour. */
function makeLandingMark(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.mark });
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
  if (b.o === 'S') return new THREE.Vector3(b.x, 1, b.y);
  if (b.o === 'X') return new THREE.Vector3(b.x + 0.5, 0.5, b.y);
  return new THREE.Vector3(b.x, 0.5, b.y + 0.5);
}

/** The dirt and hanging rock under a floating tile. */
function earth(jitter: number): THREE.Object3D {
  const g = new THREE.Group();
  const dirt = box(0.9, 0.45, 0.9, COLORS.dirt);
  dirt.position.y = -0.4;
  g.add(dirt);
  if (jitter > 0.35) {
    const h = 0.4 + jitter * 0.9;
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, h, 5),
      new THREE.MeshStandardMaterial({ color: COLORS.rock, roughness: 1, flatShading: true }),
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
const easeOut = (t: number) => 1 - (1 - t) ** 2;
function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
