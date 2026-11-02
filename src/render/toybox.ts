import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Scenery, SceneryTiles, canvas, cloudTexture, intoTheSky, seeded, softDot } from './scenery';
import { BLUE, GREEN, IVORY, ORANGE, PURPLE, RED, YELLOW, bake, brick, makeRingStack, makeTop, makeTower, part, plastic } from './toys';

/** The peach-pink haze the playroom's depths sink into. */
const HAZE = 0xf3ccc0;
const PAPER = '#e6c4d4';
const MOTIF = '#c79cbd';

/** The room: how far its walls stand from the board, and how far down its floor lies. */
const WALL_DISTANCE = 118;
const WALL_BASE = -150;
const WALL_TOP = 140;
const MOTIF_CELL = 34;

/** The sea of toys: how many, and how high its surface stands near the board and out by the walls. */
const SEA_TOYS = 1100;
const HERO_TOWERS = 14;
const HERO_RINGS = 22;
const SEA_NEAR = -50;
const SEA_FAR = -104;
const CLOUD_LEVELS = [-78, -46];

/** The train's raised track: below the board, and far enough out that it never shows through a gap. */
const TRACK_Y = -9;
const TRACK_MARGIN = 9;
const TRACK_WIDTH = 0.42;
/** Short stubs under the track, like the pegs under the board: it floats, as everything up here does. */
const POSTS = 14;
const POST_LENGTH = 1.5;
const TRAIN_SPEED = 1.5;
const CAR_SPACING = 2.75;

/** Tall towers with a top spinning on each, out on the diagonals, clear of the board in every view. */
const TOWER_MARGIN = 10;
const TOWER_TOP = -15;
const TOP_SCALE = 1.5;
const TOP_TURN = 7;
const TOWER_SCALE = 2.6;
/** A tower thins away on its way down, so its column doesn't compete with the board. */
const TOWER_FADE = [-17, -33];

/** Motion, kept apart so it can be turned down. If it runs slowly, cut dust, then spinning tops, with the train last. */
const DUST = 70;
const SPARKLES = 16;
const CLOUD_SPEED = 0.006;

/** Toy colors in the sea, some more often than others. */
const SEA_COLORS = [RED, RED, BLUE, BLUE, YELLOW, YELLOW, GREEN, ORANGE, PURPLE, IVORY];

/** How high the sea stands at a spot: a great heap under the board, falling away to the walls, with rolling drifts. */
function seaSurface(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const drop = THREE.MathUtils.smoothstep(r, 8, WALL_DISTANCE);
  return THREE.MathUtils.lerp(SEA_NEAR, SEA_FAR, drop) + 4.5 * Math.sin(x * 0.09 + 1) * Math.cos(z * 0.11) + 2.5 * Math.sin(x * 0.23 + z * 0.19);
}

/** Toybox's surroundings: wallpaper walls dissolving into a sunset, a sea of toys, a train on a raised track, tops on towers. */
export class ToyboxScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = { uHeight: { value: 1 }, uHaze: { value: new THREE.Color(HAZE) } };
  private clouds: THREE.CanvasTexture[] = [];
  /** Rebuilt for each level's size. */
  private track = new THREE.Group();
  private train: THREE.Object3D[] = [];
  private trackRadius = 15;
  private tops: { spinner: THREE.Object3D; lean: THREE.Object3D; phase: number }[] = [];
  private towers: THREE.Object3D[] = [];
  private dust: THREE.Points;
  private dustDrift: { phase: number; speed: number }[] = [];
  private sparkles: THREE.Points;
  private spread = 6;

  constructor() {
    this.group.add(this.makeWalls(), this.makeHeap(), ...this.makeSea(), ...this.makeClouds(), this.track);
    this.makeTrain();
    this.makeTowers();
    this.dust = this.makeMotes(DUST, 0.14, 0.75, 0xfff0d8);
    this.sparkles = this.makeMotes(SPARKLES, 0.2, 1, 0xffffff);
    this.group.add(this.dust, this.sparkles);
    const rnd = seeded(13);
    for (let i = 0; i < DUST; i++) this.dustDrift.push({ phase: rnd() * 6.28, speed: 0.1 + rnd() * 0.2 });
  }

  place(center: THREE.Vector3, viewSize: number, _tiles: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.7;
    this.trackRadius = viewSize / 2 + TRACK_MARGIN;
    this.buildTrack();
    const out = viewSize / 2 + TOWER_MARGIN;
    this.towers.forEach((t, i) => t.position.set((i % 3 ? 1 : -1) * out, 0, (i < 2 ? -1 : 1) * out));
    const rnd = seeded(17);
    for (const points of [this.dust, this.sparkles]) {
      const pos = points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, (rnd() * 2 - 1) * this.spread * 1.3, rnd() * 6 - 1, (rnd() * 2 - 1) * this.spread * 1.3);
      }
      pos.needsUpdate = true;
    }
  }

  update(seconds: number, dt: number, canvasHeight: number): void {
    this.uniforms.uHeight.value = canvasHeight;
    this.clouds.forEach((tex, i) => {
      tex.offset.x = seconds * CLOUD_SPEED * (i ? 1.4 : 1);
    });

    // The train keeps the same pace on any size of track.
    const lead = (seconds * TRAIN_SPEED) / this.trackRadius;
    this.train.forEach((car, i) => {
      const a = lead - (i * CAR_SPACING) / this.trackRadius;
      car.position.set(Math.cos(a) * this.trackRadius, TRACK_Y + 0.12, Math.sin(a) * this.trackRadius);
      car.rotation.y = -a - Math.PI / 2;
    });

    for (const { spinner, lean, phase } of this.tops) {
      spinner.rotation.y += TOP_TURN * dt;
      // The lean slowly circles, the way a top's axis does.
      lean.rotation.y = seconds * 1.1 + phase;
    }

    const pos = this.dust.geometry.attributes.position;
    const edge = this.spread * 1.3;
    for (let i = 0; i < pos.count; i++) {
      const { phase, speed } = this.dustDrift[i];
      let x = pos.getX(i) + speed * dt;
      const y = pos.getY(i) + Math.sin(seconds * 0.4 + phase) * 0.08 * dt;
      if (x > edge) x = -edge;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
    (this.sparkles.material as THREE.PointsMaterial).opacity = 0.35 + 0.65 * Math.abs(Math.sin(seconds * 0.9));
  }

  /** Sink a material into the haze as it goes up the screen, then into the page's sky. `sink` also thins it away between two heights. */
  private hazed<M extends THREE.Material>(mat: M, near: number, far: number, fadeFrom = 0.72, fadeTo = 0.94, sink?: number[]): M {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      const sinkLine = sink ? `gl_FragColor.a *= 1.0 - smoothstep(${(-sink[0]).toFixed(1)}, ${(-sink[1]).toFixed(1)}, -vWorldY);` : '';
      if (sink) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;');
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;${sink ? '\nvarying float vWorldY;' : ''}`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${sinkLine}\n${intoTheSky(near, far, 0.76, fadeFrom, fadeTo)}`);
    };
    // The same callback with other numbers: without this, every material here would share one program.
    mat.customProgramCacheKey = () => `toybox-${near}-${far}-${fadeFrom}-${fadeTo}-${sink ?? ''}`;
    return mat;
  }

  /** Four distant walls of toy-silhouette wallpaper over a pale skirting board. They rise right out of the picture. */
  private makeWalls(): THREE.Mesh {
    const span = WALL_DISTANCE * 2;
    const height = WALL_TOP - WALL_BASE;
    const parts: THREE.BufferGeometry[] = [];
    for (let side = 0; side < 4; side++) {
      const wall = new THREE.PlaneGeometry(span, height);
      const uv = wall.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * span) / MOTIF_CELL, (uv.getY(v) * height) / MOTIF_CELL);
      wall.translate(0, (WALL_TOP + WALL_BASE) / 2, -WALL_DISTANCE);
      wall.rotateY((side * Math.PI) / 2);
      parts.push(wall);
    }
    const mat = this.hazed(
      new THREE.MeshBasicMaterial({ map: wallpaper(), transparent: true, depthWrite: false }),
      0,
      0.2,
      0.78,
      0.99,
    );
    const walls = new THREE.Mesh(mergeGeometries(parts)!, mat);
    walls.renderOrder = -8;
    walls.frustumCulled = false;
    return walls;
  }

  /** The dark shape the toys lie on, so the gaps between them read as crevices rather than a drop. */
  private makeHeap(): THREE.Mesh {
    const size = WALL_DISTANCE * 2;
    const geom = new THREE.PlaneGeometry(size, size, 48, 48);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    for (let v = 0; v < pos.count; v++) pos.setY(v, seaSurface(pos.getX(v), pos.getZ(v)) - 1.5);
    geom.computeVertexNormals();
    const heap = new THREE.Mesh(geom, this.hazed(new THREE.MeshLambertMaterial({ color: 0x7c5a7d, transparent: true }), 0.5, 0.82));
    heap.renderOrder = -7;
    heap.frustumCulled = false;
    return heap;
  }

  /** The sea: hundreds of bricks, blocks, rings and balls in drifts, with whole towers and ring stacks standing proud. */
  private makeSea(): THREE.Object3D[] {
    const rnd = seeded(31);
        const shapes = [seaBrick(), seaBlock(), new THREE.CylinderGeometry(0.5, 0.5, 0.8, 16), new THREE.SphereGeometry(0.55, 14, 10), new THREE.TorusGeometry(0.42, 0.2, 8, 18), new THREE.ConeGeometry(0.58, 1, 14)];
    // Mostly the building set; the odd ball and ring among them.
    const weights = [0.42, 0.24, 0.1, 0.08, 0.1, 0.06];
    const counts = weights.map((w) => Math.round(w * SEA_TOYS));
    // A cheap shine: this far off, a highlight says plastic as well as true reflections would, for far less work.
    const mat = this.hazed(new THREE.MeshPhongMaterial({ shininess: 70, specular: 0x777777, transparent: true }), 0.42, 0.78);
    const seas = shapes.map((geom, i) => new THREE.InstancedMesh(geom, mat, counts[i]));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const color = new THREE.Color();
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const fill = counts.map(() => 0);
    let shape = 0;
    const reach = WALL_DISTANCE * Math.SQRT2;
    for (let i = 0; i < SEA_TOYS * 1.6; i++) {
      const r = 8 + (reach - 8) * Math.sqrt((i + 0.5) / (SEA_TOYS * 1.6));
      const a = i * GOLDEN;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      if (Math.abs(x) > WALL_DISTANCE - 2 || Math.abs(z) > WALL_DISTANCE - 2) continue;
      for (let tries = 0; fill[shape] >= counts[shape] && tries < counts.length; tries++) shape = (shape + 1) % counts.length;
      if (fill[shape] >= counts[shape]) break;
      const size = 3.4 + rnd() * 1.8 + (r / reach) * 2.6;
      m.compose(
        new THREE.Vector3(x, seaSurface(x, z) + size * 0.14, z),
        q.setFromEuler(e.set((rnd() - 0.5) * 1.3, rnd() * 6.28, (rnd() - 0.5) * 1.3)),
        new THREE.Vector3(size, size, size),
      );
      const n = fill[shape]++;
      seas[shape].setMatrixAt(n, m);
      seas[shape].setColorAt(n, color.set(SEA_COLORS[Math.floor(rnd() * SEA_COLORS.length)]));
      shape = Math.floor(rnd() * counts.length);
    }
    seas.forEach((sea, i) => {
      sea.count = fill[i];
      sea.renderOrder = -6;
      sea.frustumCulled = false;
    });

    // Whole toys standing out of the sea, so a glance says what all this is.
    const hero = this.hazed(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x777777, transparent: true }), 0.34, 0.74);
    const stand = (geom: THREE.BufferGeometry, count: number, scale: number, seed: number) => {
      const random = seeded(seed);
      const mesh = new THREE.InstancedMesh(geom, hero, count);
      for (let i = 0; i < count; i++) {
        const r = 26 + (WALL_DISTANCE - 34) * Math.sqrt((i + 0.5) / count);
        const a = i * GOLDEN + seed;
        const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
        const s = scale * (0.8 + random() * 0.5);
        m.compose(new THREE.Vector3(x, seaSurface(x, z) - s * 0.3, z), q.setFromEuler(e.set(0, random() * 6.28, 0)), new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(i, m);
      }
      mesh.renderOrder = -5;
      mesh.frustumCulled = false;
      return mesh;
    };
    return [...seas, stand(bake(makeTower(true)), HERO_TOWERS, 5, 3), stand(bake(makeRingStack(true)), HERO_RINGS, 4.5, 7)];
  }

  /** Two thin sheets of pale cloud among the toys: this playroom is up in the sky. */
  private makeClouds(): THREE.Mesh[] {
    return CLOUD_LEVELS.map((y, i) => {
      const tex = cloudTexture(61 + i * 13);
      tex.repeat.set(1.6, 1.6);
      this.clouds.push(tex);
      const mat = this.hazed(
        new THREE.MeshBasicMaterial({ color: 0xfff1ea, map: tex, transparent: true, depthWrite: false, opacity: i ? 0.42 : 0.6 }),
        0.1,
        0.5,
      );
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(WALL_DISTANCE * 2, WALL_DISTANCE * 2), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      plane.renderOrder = -4 + i * 0.5;
      plane.frustumCulled = false;
      return plane;
    });
  }

  /** The ring of track, its ties and the posts holding it up, sized to this level. */
  private buildTrack(): void {
    for (const child of [...this.track.children]) {
      this.track.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    const r = this.trackRadius;
    const rails = new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(r + side * TRACK_WIDTH, 0.07, 6, 96), rails);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = TRACK_Y;
      this.track.add(rail);
    }
    const ties = Math.round((2 * Math.PI * r) / 0.8);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.09, 0.42), plastic(BLUE), ties);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < ties; i++) {
      const a = (i / ties) * Math.PI * 2;
      sleepers.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * r, TRACK_Y - 0.08, Math.sin(a) * r), q.setFromAxisAngle(up, -a), one));
    }
    sleepers.frustumCulled = false;
    this.track.add(sleepers);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 1, 12), plastic(YELLOW), POSTS);
    for (let i = 0; i < POSTS; i++) {
      const a = (i / POSTS) * Math.PI * 2 + 0.2;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      posts.setMatrixAt(i, m.compose(new THREE.Vector3(x, TRACK_Y - 0.1 - POST_LENGTH / 2, z), q.identity(), new THREE.Vector3(1, POST_LENGTH, 1)));
    }
    posts.frustumCulled = false;
    this.track.add(posts);
  }

  /** An engine and a line of cars, each one mesh in shiny colors. */
  private makeTrain(): void {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22 });
    const cars = [bake(engine()), bake(wagon(BLUE, YELLOW)), bake(wagon(GREEN, RED)), bake(wagon(YELLOW, BLUE)), bake(wagon(RED, GREEN))];
    for (const geom of cars) {
      const car = new THREE.Mesh(geom, mat);
      car.frustumCulled = false;
      this.train.push(car);
      this.group.add(car);
    }
  }

  /** Tall brick towers out on the diagonals, each with a top spinning on its flat head. */
  private makeTowers(): void {
    const column = new THREE.Group();
    const colors = [RED, BLUE, YELLOW, GREEN];
    const layers = Math.ceil((TOWER_TOP - TOWER_FADE[1]) / (0.55 * TOWER_SCALE));
    for (let i = 0; i < layers; i++) {
      const piece = brick(1.25, 0.55, 1.25, colors[i % colors.length], true);
      piece.position.y = -(i + 1) * 0.55;
      piece.rotation.y = i * 0.17;
      column.add(piece);
    }
    column.scale.setScalar(TOWER_SCALE);
    const geom = bake(column);
    const mat = this.hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, transparent: true }), 0.03, 0.3, 0.72, 0.94, TOWER_FADE);
    for (let i = 0; i < 4; i++) {
      const tower = new THREE.Group();
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = TOWER_TOP;
      mesh.rotation.y = i;
      mesh.frustumCulled = false;
      mesh.renderOrder = -3;
      const top = makeTop();
      top.scale.setScalar(TOP_SCALE);
      top.position.y = TOWER_TOP + 0.3;
      tower.add(mesh, top);
      this.tops.push({ spinner: top.userData.spinner, lean: top.userData.lean, phase: i * 1.7 });
      this.towers.push(tower);
      this.group.add(tower);
    }
  }

  private makeMotes(count: number, size: number, opacity: number, color: number): THREE.Points {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    const points = new THREE.Points(geom, new THREE.PointsMaterial({ color, map: softDot(), size, transparent: true, opacity, depthWrite: false }));
    points.frustumCulled = false;
    return points;
  }
}

/** A sea brick in one color, two long, with two pegs. Colored per toy, so its parts share one color. */
function seaBrick(): THREE.BufferGeometry {
  const body = new RoundedBoxGeometry(1.7, 0.7, 0.85, 1, 0.08);
  body.deleteAttribute('uv');
  const parts: THREE.BufferGeometry[] = [body];
  for (const x of [-0.42, 0.42]) {
    const peg = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10).toNonIndexed();
    peg.deleteAttribute('uv');
    peg.translate(x, 0.42, 0);
    parts.push(peg);
  }
  return mergeGeometries(parts)!;
}

function seaBlock(): THREE.BufferGeometry {
  const body = new RoundedBoxGeometry(0.95, 0.95, 0.95, 1, 0.08);
  body.deleteAttribute('uv');
  const peg = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10).toNonIndexed();
  peg.deleteAttribute('uv');
  peg.translate(0, 0.54, 0);
  return mergeGeometries([body, peg])!;
}

/** Four dark wheels under a car, which runs along +x. */
function addWheels(car: THREE.Group, length: number): void {
  const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14);
  wheel.rotateX(Math.PI / 2);
  for (const x of [-length * 0.3, length * 0.3]) {
    for (const z of [-0.42, 0.42]) car.add(part(wheel, plastic(0x2c2a33), 0.2, x, z));
  }
}

/** A toy engine: chunky boiler, cab, chimney. Runs along +x. */
function engine(): THREE.Group {
  const g = new THREE.Group();
  addWheels(g, 2.2);
  g.add(part(new RoundedBoxGeometry(2.4, 0.26, 1, 2, 0.05), plastic(BLUE), 0.42));
  const boiler = new THREE.CylinderGeometry(0.42, 0.42, 1.5, 22);
  boiler.rotateZ(Math.PI / 2);
  g.add(part(boiler, plastic(RED), 0.86, 0.42));
  g.add(part(new RoundedBoxGeometry(0.85, 1.05, 1, 2, 0.07), plastic(YELLOW), 1.05, -0.74));
  g.add(part(new RoundedBoxGeometry(1.05, 0.14, 1.16, 2, 0.05), plastic(RED), 1.63, -0.74));
  g.add(part(new THREE.CylinderGeometry(0.2, 0.13, 0.5, 16), plastic(BLUE), 1.42, 0.82));
  return g;
}

/** An open wagon carrying a few bricks. Runs along +x. */
function wagon(body: number, load: number): THREE.Group {
  const g = new THREE.Group();
  addWheels(g, 2);
  g.add(part(new RoundedBoxGeometry(2.1, 0.62, 1.02, 2, 0.07), plastic(body), 0.68));
  const cargo = brick(0.8, 0.34, 0.68, load);
  cargo.position.set(-0.38, 0.92, 0);
  const other = brick(0.8, 0.34, 0.68, IVORY);
  other.position.set(0.48, 0.92, 0);
  g.add(cargo, other);
  return g;
}

/** Wallpaper: staggered silhouettes of the room's toys on faded paper, one shade apart. */
function wallpaper(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = MOTIF;
  const motifs = [drawTrain, drawRings, drawTop, drawTower];
  const cell = size / 2;
  for (let i = 0; i < 4; i++) {
    const [col, row] = [i % 2, i >> 1];
    ctx.save();
    ctx.translate((col + 0.5) * cell + (row ? cell / 4 : -cell / 4), (row + 0.5) * cell);
    ctx.scale(cell / 100, cell / 100);
    motifs[i](ctx);
    ctx.restore();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

// Each motif is drawn around (0, 0) in a box about 70 across.

function drawTrain(ctx: CanvasRenderingContext2D): void {
  ctx.fillRect(-32, -6, 44, 18);
  ctx.fillRect(-32, -24, 20, 20);
  ctx.fillRect(-36, -28, 28, 5);
  ctx.fillRect(2, -20, 9, 16);
  ctx.fillRect(15, 2, 20, 10);
  for (const x of [-22, 2, 26]) {
    ctx.beginPath();
    ctx.arc(x, 15, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings(ctx: CanvasRenderingContext2D): void {
  ctx.fillRect(-26, 26, 52, 6);
  [24, 20, 16, 12].forEach((w, i) => {
    ctx.beginPath();
    ctx.ellipse(0, 18 - i * 13, w, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.arc(0, -36, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawTop(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.quadraticCurveTo(-30, 6, -26, -6);
  ctx.quadraticCurveTo(0, -24, 26, -6);
  ctx.quadraticCurveTo(30, 6, 0, 34);
  ctx.fill();
  ctx.fillRect(-3, -34, 6, 22);
  ctx.beginPath();
  ctx.arc(0, -36, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTower(ctx: CanvasRenderingContext2D): void {
  ctx.fillRect(-20, 16, 40, 16);
  ctx.fillRect(-16, 2, 32, 12);
  ctx.fillRect(-20, -12, 40, 12);
  ctx.beginPath();
  ctx.moveTo(-24, -14);
  ctx.lineTo(0, -38);
  ctx.lineTo(24, -14);
  ctx.closePath();
  ctx.fill();
}
