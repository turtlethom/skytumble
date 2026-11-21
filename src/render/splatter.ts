import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { StudioCat } from './cat';
import { Scenery, SceneryTiles, canvas, intoTheSky, seeded, softDot } from './scenery';

/**
 * Splatter Studio's surroundings (look session 2026-11-20): the board floats in a vast painter's studio
 * on a lamp-lit evening. Far plaster walls hung with paintings, tall windows glowing with dusk, a
 * paint-splattered floorboard floor far below with easels on it, pendant lamps throwing warm pools of
 * light, and paint flecks drifting in the air. Warm in the room; the board itself keeps its near-neutral
 * light (themes.ts), so paint reads true. Decoration only.
 */

/** The warm amber haze the room's depths sink into. */
const HAZE = 0x6e4a33;

/** The room: how far its walls stand from the board, how far down its floor lies, how high the walls rise. */
const WALL_DISTANCE = 104;
const FLOOR_Y = -95;
const WALL_TOP = 120;

/** Things in the room, kept modest for the laptop budget. */
const PAINTINGS_PER_WALL = 5;
const WINDOWS_PER_WALL = 2;
/** Window centers along each wall, and the bare stretches of wall where paintings hang, clear of the glass. */
const WINDOW_SPACING = 92;
const WALL_GAPS = [-80, -14, 14, 80, 0];
const EASELS = 24;
const SPLATS = 160;
const JARS = 50;
const STACKS = 16;
const LAMPS = 4;
/** Lamps hang out on the diagonals, beyond the board, so they never cover it. */
const LAMP_MARGIN = 2.5;
const LAMP_HEIGHT = 4;

/** Motion, kept apart so it can be cut first: drifting paint flecks and a gentle lamp sway. */
const FLECKS = 60;
const LAMP_SWAY = 0.035;

/**
 * Furniture scale: one meter in world units, from the windows (52 units tall, about 2.6 m), so the
 * furniture reads at the windows' scale (the user's call: at 7 units a meter it all looked toy-sized).
 */
const M = 20;
/** Furniture stands against the far wall, under and beside the windows, where the camera sees it above the board. */
const BACK = -WALL_DISTANCE;
/** The living corner, under the left window: sofa (with the cat), rug, armchair and a low table. */
// Its armrests reach 1.15 m each side: from -73 to -27, clear of the bookcase.
const SOFA_AT = new THREE.Vector3(-50, FLOOR_Y, BACK + 0.6 * M);
/** The worktable, under the right window. */
const TABLE_AT = new THREE.Vector3(54, FLOOR_Y, BACK + 0.6 * M);
/** Floor clutter keeps off the furniture: out of the living corner and the work corner. */
const clearOfFurniture = (x: number, z: number) => !((x < -8 && z < BACK + 3.4 * M) || (x > 24 && z < BACK + 2.2 * M));
/** The cat is built about 6.5 units long; this makes it about a meter: big, so it reads from up at the board. */
const CAT_SCALE = 3.2;

/** Paint colors for the room's mess, a little muted so the board's colors stay the brightest thing on screen. */
const MESS = [0xb8473e, 0x3e64b0, 0xd9b84a, 0x7b52a0, 0xd4803e, 0x4e8f57, 0x8a6a4a, 0xd8cdb4];

export class SplatterScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = { uHeight: { value: 1 }, uHaze: { value: new THREE.Color(HAZE) } };
  private lamps: THREE.Object3D[] = [];
  private flecks: THREE.Points;
  private fleckDrift: { phase: number; fall: number }[] = [];
  private spread = 6;
  private cat = new StudioCat();

  constructor() {
    this.group.add(this.makeWalls(), this.makeWindows(), this.makePaintings(), this.makeFloor(), this.makeEasels(), this.makeJars(), this.makeStacks());
    for (let i = 0; i < LAMPS; i++) {
      const lamp = makeLamp();
      this.lamps.push(lamp);
      this.group.add(lamp);
    }
    this.flecks = this.makeFlecks();
    this.group.add(this.flecks, this.makeFurniture());
    // The cat, curled on the sofa's left-hand cushion, looking out toward the board. The right-hand one
    // is too near the board, which hid the cat from the default view.
    this.cat.group.scale.setScalar(CAT_SCALE);
    this.cat.group.position.copy(SOFA_AT).add(new THREE.Vector3(-0.48 * M, 0.61 * M, 0.08 * M));
    this.cat.group.rotation.y = -Math.PI / 2 - 0.3;
    this.group.add(this.cat.group);
  }

  place(center: THREE.Vector3, viewSize: number, tiles: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.7;
    // From the board's real edges (the overall size overshoots a wide board's depth): two lamps just behind
    // the far edge and one beyond each side, hanging low enough to stay in frame and never over a tile.
    const xs = tiles.solid.map((t) => t.x - center.x);
    const zs = tiles.solid.map((t) => t.z - center.z);
    const [minX, maxX, minZ] = xs.length ? [Math.min(...xs), Math.max(...xs), Math.min(...zs)] : [-3, 3, -3];
    const spots = [
      [minX + (maxX - minX) * 0.25, minZ - LAMP_MARGIN],
      [minX + (maxX - minX) * 0.75, minZ - LAMP_MARGIN],
      [minX - LAMP_MARGIN, minZ * 0.3],
      [maxX + LAMP_MARGIN, minZ * 0.3],
    ];
    this.lamps.forEach((lamp, i) => lamp.position.set(spots[i][0], LAMP_HEIGHT, spots[i][1]));
    const rnd = seeded(23);
    const pos = this.flecks.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (rnd() * 2 - 1) * this.spread * 1.4, rnd() * 9 - 3, (rnd() * 2 - 1) * this.spread * 1.4);
    pos.needsUpdate = true;
  }

  update(seconds: number, dt: number, canvasHeight: number): void {
    this.uniforms.uHeight.value = canvasHeight;
    this.cat.update(seconds);
    this.lamps.forEach((lamp, i) => {
      lamp.rotation.z = Math.sin(seconds * 0.5 + i * 1.7) * LAMP_SWAY;
      lamp.rotation.x = Math.cos(seconds * 0.4 + i) * LAMP_SWAY * 0.6;
    });
    // Flecks drift down slowly and wander a little, wrapping back to the top.
    const pos = this.flecks.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const { phase, fall } = this.fleckDrift[i];
      let y = pos.getY(i) - fall * dt;
      if (y < -4) y = 6;
      pos.setXYZ(i, pos.getX(i) + Math.sin(seconds * 0.3 + phase) * 0.12 * dt, y, pos.getZ(i) + Math.cos(seconds * 0.25 + phase) * 0.1 * dt);
    }
    pos.needsUpdate = true;
  }

  /**
   * Sink a material into the haze as it goes up the screen, then into the page's backdrop. `opaque` keeps
   * the haze but drops the fade (alpha stays 1), for things low enough on screen never to reach it: they
   * draw without blending, which the laptop's GPU needs (the room ran at 40 fps with everything blended).
   */
  private hazed<M extends THREE.Material>(mat: M, near: number, far: number, fadeFrom = 0.72, fadeTo = 0.94, opaque = false): M {
    mat.transparent = !opaque;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(near, far, 0.76, fadeFrom, fadeTo)}${opaque ? '\ngl_FragColor.a = 1.0;' : ''}`);
    };
    mat.customProgramCacheKey = () => `splatter-${near}-${far}-${fadeFrom}-${fadeTo}-${opaque}`;
    return mat;
  }

  /** Four far walls of warm plaster with a dark wainscot, rising out of the picture. */
  private makeWalls(): THREE.Mesh {
    const span = WALL_DISTANCE * 2;
    const height = WALL_TOP - FLOOR_Y;
    const parts: THREE.BufferGeometry[] = [];
    for (let side = 0; side < 4; side++) {
      const wall = new THREE.PlaneGeometry(span, height);
      const uv = wall.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * span) / 40, uv.getY(v));
      wall.translate(0, (WALL_TOP + FLOOR_Y) / 2, -WALL_DISTANCE);
      wall.rotateY((side * Math.PI) / 2);
      parts.push(wall);
    }
    const mat = this.hazed(new THREE.MeshBasicMaterial({ map: plasterTexture(height), transparent: true, depthWrite: false }), 0.0, 0.22, 0.88, 0.995);
    const walls = new THREE.Mesh(mergeGeometries(parts)!, mat);
    walls.renderOrder = -9;
    walls.frustumCulled = false;
    return walls;
  }

  /** Tall windows glowing with an evening sky, deep blue above, amber at the sill. */
  private makeWindows(): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    const [w, h] = [26, 52];
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < WINDOWS_PER_WALL; k++) {
        const win = new THREE.PlaneGeometry(w, h);
        // Low on the wall, where the camera actually sees it: from above, the top of the screen only
        // reaches some 35 units below the board.
        win.translate((k - (WINDOWS_PER_WALL - 1) / 2) * WINDOW_SPACING, FLOOR_Y + 12 + h / 2, -WALL_DISTANCE + 0.3);
        win.rotateY((side * Math.PI) / 2);
        parts.push(win);
      }
    }
    const mat = this.hazed(new THREE.MeshBasicMaterial({ map: windowTexture(), transparent: true, depthWrite: false }), 0.0, 0.08, 0.9, 0.995);
    const windows = new THREE.Mesh(mergeGeometries(parts)!, mat);
    windows.renderOrder = -8;
    windows.frustumCulled = false;
    return windows;
  }

  /** Framed abstract paintings hung at different heights along the walls. */
  private makePaintings(): THREE.Mesh {
    const rnd = seeded(41);
    const parts: THREE.BufferGeometry[] = [];
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < PAINTINGS_PER_WALL; k++) {
        const [w, h] = [9 + rnd() * 9, 8 + rnd() * 10];
        const quad = new THREE.PlaneGeometry(w, h);
        // Each painting picks one of four panels in the atlas.
        const panel = Math.floor(rnd() * 4);
        const uv = quad.attributes.uv;
        for (let v = 0; v < uv.count; v++) uv.setXY(v, (panel % 2) * 0.5 + uv.getX(v) * 0.5, Math.floor(panel / 2) * 0.5 + uv.getY(v) * 0.5);
        // Only on bare wall, between and beside the windows (the user saw paintings hung over the glass).
        const along = WALL_GAPS[k % WALL_GAPS.length] + (rnd() - 0.5) * 4;
        quad.translate(along, FLOOR_Y + 22 + rnd() * 30, -WALL_DISTANCE + 0.6);
        quad.rotateY((side * Math.PI) / 2);
        parts.push(quad);
      }
    }
    const mat = this.hazed(new THREE.MeshBasicMaterial({ map: paintingAtlas(), transparent: true, depthWrite: false }), 0.0, 0.15, 0.9, 0.995);
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
    mesh.renderOrder = -7;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** The studio floor far below: warm floorboards with pools of lamplight. */
  private makeFloor(): THREE.Mesh {
    const size = WALL_DISTANCE * 2;
    const geom = new THREE.PlaneGeometry(size, size);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, FLOOR_Y, 0);
    const mat = this.hazed(new THREE.MeshBasicMaterial({ map: floorboardTexture(size) }), 0.62, 0.92, 0.72, 0.94, true);
    const floor = new THREE.Mesh(geom, mat);
    floor.renderOrder = -10;
    floor.frustumCulled = false;
    return floor;
  }

  /** Easels on the floor, each holding a canvas, scattered out toward the walls. */
  private makeEasels(): THREE.Group {
    const rnd = seeded(61);
    const wood = this.hazed(new THREE.MeshLambertMaterial({ color: 0x8c6239 }), 0.45, 0.88, 0.72, 0.94, true);
    const board = this.hazed(new THREE.MeshLambertMaterial({ map: paintingAtlas() }), 0.45, 0.88, 0.72, 0.94, true);
    // One easel model: three legs leaning together and a canvas on a ledge.
    const legs: THREE.BufferGeometry[] = [];
    for (const [x, z, rx, rz] of [[-1.4, 0.4, -0.12, 0.18], [1.4, 0.4, -0.12, -0.18], [0, -1.6, 0.35, 0]]) {
      const leg = new THREE.BoxGeometry(0.25, 11, 0.25);
      leg.rotateX(rx);
      leg.rotateZ(rz);
      leg.translate(x, 5.4, z);
      legs.push(leg);
    }
    const ledge = new THREE.BoxGeometry(4, 0.3, 0.8).translate(0, 3.8, 0.7);
    const legGeom = mergeGeometries([...legs, ledge])!;
    const canvasGeom = new THREE.BoxGeometry(5, 4, 0.2).translate(0, 6.2, 0.75);
    const legsMesh = new THREE.InstancedMesh(legGeom, wood, EASELS);
    const canvasMesh = new THREE.InstancedMesh(canvasGeom, board, EASELS);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < EASELS; i++) {
      const r = 42 + rnd() * (WALL_DISTANCE - 54);
      const a = (i / EASELS) * Math.PI * 2 + rnd() * 0.3;
      const s = 1.7 + rnd() * 0.9;
      // Facing roughly toward the middle of the room, as if painters had been looking at the board.
      q.setFromEuler(new THREE.Euler(0, -a - Math.PI / 2 + (rnd() - 0.5) * 0.6, 0));
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      m.compose(new THREE.Vector3(x, FLOOR_Y, z), q, clearOfFurniture(x, z) ? new THREE.Vector3(s, s, s) : new THREE.Vector3(0, 0, 0));
      legsMesh.setMatrixAt(i, m);
      canvasMesh.setMatrixAt(i, m);
    }
    const g = new THREE.Group();
    for (const mesh of [legsMesh, canvasMesh]) {
      mesh.renderOrder = -8;
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    return g;
  }

  /** Paint jars and tins around the easels. */
  private makeJars(): THREE.InstancedMesh {
    const rnd = seeded(71);
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1.6, 12), this.hazed(new THREE.MeshLambertMaterial(), 0.5, 0.88, 0.72, 0.94, true), JARS);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < JARS; i++) {
      const r = 36 + rnd() * (WALL_DISTANCE - 44);
      const a = rnd() * Math.PI * 2;
      const s = 1.4 + rnd() * 1.4;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      m.compose(new THREE.Vector3(x, FLOOR_Y + 0.8 * s, z), new THREE.Quaternion(), clearOfFurniture(x, z) ? new THREE.Vector3(s, s, s) : new THREE.Vector3(0, 0, 0));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(MESS[Math.floor(rnd() * MESS.length)]));
    }
    mesh.renderOrder = -8;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Canvases leaning in stacks against nothing in particular, the way they pile up in a studio. */
  private makeStacks(): THREE.InstancedMesh {
    const rnd = seeded(77);
    const geom = new THREE.BoxGeometry(5, 4, 0.25).translate(0, 2, 0);
    const mesh = new THREE.InstancedMesh(geom, this.hazed(new THREE.MeshLambertMaterial({ map: paintingAtlas() }), 0.45, 0.88, 0.72, 0.94, true), STACKS * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let i = 0; i < STACKS; i++) {
      const r = 36 + rnd() * (WALL_DISTANCE - 46);
      const a = rnd() * Math.PI * 2;
      const turn = rnd() * Math.PI * 2;
      const s = 1.8 + rnd() * 1.2;
      // Three canvases leaning together, each a little further over.
      for (let k = 0; k < 3; k++) {
        q.setFromEuler(new THREE.Euler(-0.18 - k * 0.07, turn, 0, 'YXZ'));
        const off = new THREE.Vector3(0, 0, k * 0.5 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
        const [x, z] = [Math.cos(a) * r + off.x, Math.sin(a) * r + off.z];
        m.compose(new THREE.Vector3(x, FLOOR_Y, z), q, clearOfFurniture(x, z) ? new THREE.Vector3(s, s * (0.8 + k * 0.15), s) : new THREE.Vector3(0, 0, 0));
        mesh.setMatrixAt(n++, m);
      }
    }
    mesh.renderOrder = -8;
    mesh.frustumCulled = false;
    return mesh;
  }

  /**
   * Furniture, in muted off-palette colors so nothing echoes a game color, all merged into one mesh:
   * a rug, a sofa and armchair round a low table, a long worktable with jars and brushes, a tall
   * bookcase, potted plants, stools and a stepladder.
   */
  private makeFurniture(): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    const [FABRIC, LEATHER, WOOD, LIGHT_WOOD, RUG, RUG_EDGE, POT, LEAF] = [0x6c7556, 0x94653c, 0x4f3523, 0xa98256, 0xcbb894, 0x6e4d39, 0x8c5236, 0x557a42];
    // A piece in meters, local to its item, then the item placed in the room.
    const item = (at: THREE.Vector3, turn: number, build: (add: (g: THREE.BufferGeometry, color: number) => void) => void) => {
      const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(M, M, M));
      build((g, color) => parts.push(tinted(g.applyMatrix4(m), color)));
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const cyl = (r: number, h: number, x: number, y: number, z: number, top = r) => new THREE.CylinderGeometry(top, r, h, 12).translate(x, y + h / 2, z);
    const legs = (add: (g: THREE.BufferGeometry, c: number) => void, w: number, d: number, h: number, color: number) => {
      for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) add(cyl(0.035, h, x, 0, z), color);
    };

    // The living corner.
    item(SOFA_AT.clone().add(new THREE.Vector3(0, 0, 1.2 * M)), 0, (add) => {
      add(box(3.0, 0.02, 2.2, 0, 0.005, 0), RUG_EDGE);
      add(box(2.7, 0.02, 1.9, 0, 0.012, 0), RUG);
    });
    item(SOFA_AT, 0, (add) => {
      legs(add, 2.0, 0.8, 0.12, WOOD);
      add(box(2.2, 0.33, 0.95, 0, 0.12, 0), FABRIC);
      for (const x of [-0.5, 0.5]) add(box(0.98, 0.16, 0.78, x, 0.45, 0.06), FABRIC);
      add(box(2.2, 0.6, 0.24, 0, 0.45, -0.36), FABRIC);
      for (const x of [-1.04, 1.04]) add(box(0.22, 0.42, 0.95, x, 0.45, 0), FABRIC);
    });
    item(SOFA_AT.clone().add(new THREE.Vector3(-1.75 * M, 0, 0.9 * M)), 0.9, (add) => {
      legs(add, 0.8, 0.75, 0.14, WOOD);
      add(box(1.0, 0.32, 0.9, 0, 0.14, 0), LEATHER);
      add(box(0.84, 0.14, 0.72, 0, 0.46, 0.06), LEATHER);
      add(box(1.0, 0.62, 0.2, 0, 0.46, -0.35), LEATHER);
      for (const x of [-0.46, 0.46]) add(box(0.16, 0.36, 0.9, x, 0.46, 0), LEATHER);
    });
    item(SOFA_AT.clone().add(new THREE.Vector3(0.1 * M, 0, 1.25 * M)), 0, (add) => {
      legs(add, 1.0, 0.5, 0.4, WOOD);
      add(box(1.15, 0.05, 0.6, 0, 0.4, 0), LIGHT_WOOD);
      add(cyl(0.07, 0.14, 0.25, 0.45, 0.05), 0xd8cdb4);
    });

    // The worktable, out to the right, with paint pots, a jar of brushes and a palette.
    item(TABLE_AT, 0, (add) => {
      legs(add, 2.4, 0.8, 0.88, WOOD);
      add(box(2.7, 0.07, 0.95, 0, 0.88, 0), LIGHT_WOOD);
      const rnd = seeded(91);
      for (let i = 0; i < 7; i++) add(cyl(0.07, 0.12 + rnd() * 0.06, -1.1 + i * 0.28, 0.95, -0.2 + rnd() * 0.3), MESS[Math.floor(rnd() * MESS.length)]);
      add(cyl(0.08, 0.2, 0.9, 0.95, 0.15), 0x8b8680);
      for (let i = 0; i < 5; i++) add(cyl(0.012, 0.4, 0.86 + (i % 3) * 0.04, 1.0, 0.12 + (i % 2) * 0.05), WOOD);
      add(cyl(0.3, 0.02, 0.2, 0.95, 0.15), 0xc4a777);
    });
    item(TABLE_AT.clone().add(new THREE.Vector3(-0.6 * M, 0, 1.0 * M)), 0, (add) => {
      add(cyl(0.025, 0.6, 0, 0, 0), WOOD);
      add(cyl(0.2, 0.05, 0, 0.6, 0), LIGHT_WOOD);
      for (const a of [0, 2.1, 4.2]) add(box(0.03, 0.6, 0.03, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15), WOOD);
    });
    item(TABLE_AT.clone().add(new THREE.Vector3(0.7 * M, 0, 1.0 * M)), 0, (add) => {
      add(cyl(0.2, 0.05, 0, 0.6, 0), LIGHT_WOOD);
      for (const a of [0.5, 2.6, 4.7]) add(box(0.03, 0.6, 0.03, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15), WOOD);
    });

    // A tall bookcase at the back left, full of books and a few jars.
    // 1.3 m wide: from -103 to -77, a little gap from the sofa (it overlapped at first).
    item(new THREE.Vector3(-90, FLOOR_Y, BACK + 0.25 * M), 0, (add) => {
      add(box(1.3, 2.2, 0.06, 0, 0, -0.17), WOOD);
      for (const x of [-0.65, 0.65]) add(box(0.06, 2.2, 0.4, x, 0, 0), WOOD);
      const rnd = seeded(37);
      const books = [0x6e4d39, 0x8b8680, 0xb0854a, 0x5e4b3c, 0xd8c7a0, 0x6c7556, 0x7a5638];
      for (let shelf = 0; shelf < 5; shelf++) {
        const y = shelf * 0.5;
        add(box(1.3, 0.05, 0.4, 0, y, 0), WOOD);
        if (shelf === 4) continue;
        let x = -0.58;
        while (x < 0.5) {
          const w = 0.06 + rnd() * 0.08;
          add(box(w, 0.28 + rnd() * 0.12, 0.28, x + w / 2, y + 0.05, 0), books[Math.floor(rnd() * books.length)]);
          x += w + 0.01;
        }
      }
    });

    // Plants in clay pots, a bit of life among the paint.
    // Out at the sides, never behind the board's middle, where a tall plant would compete with the tiles.
    for (const [x, z, seed] of [[-98, BACK + 1.6 * M, 3], [98, BACK + 1.7 * M, 5]]) {
      item(new THREE.Vector3(x, FLOOR_Y, z), seed, (add) => {
        add(cyl(0.22, 0.4, 0, 0, 0, 0.28), POT);
        const rnd = seeded(seed);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const leaf = new THREE.SphereGeometry(0.22, 8, 6).scale(0.5, 1.8, 0.25);
          leaf.rotateZ(0.5 + rnd() * 0.4);
          leaf.rotateY(a);
          leaf.translate(Math.cos(a) * 0.18, 0.75 + rnd() * 0.3, -Math.sin(a) * 0.18);
          add(leaf, LEAF);
        }
      });
    }

    // A stepladder leaning by the right wall.
    item(new THREE.Vector3(94, FLOOR_Y, BACK + 0.35 * M), 0, (add) => {
      for (const x of [-0.25, 0.25]) {
        const rail = new THREE.BoxGeometry(0.05, 2.0, 0.06).translate(0, 1.0, 0).rotateX(-0.2).translate(x, 0, 0.1);
        add(rail, LIGHT_WOOD);
      }
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.5, 0.04, 0.08).translate(0, 0.3 + i * 0.36, 0.1 - (0.3 + i * 0.36) * 0.2), LIGHT_WOOD);
    });

    // Far back by the wall, high on screen: light haze like the windows', or it fades away up there.
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, this.hazed(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.0, 0.18, 0.9, 0.995, true));
    mesh.renderOrder = -8;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Small flecks of paint drifting through the lamplight. */
  private makeFlecks(): THREE.Points {
    const rnd = seeded(83);
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(FLECKS * 3);
    const colors = new Float32Array(FLECKS * 3);
    const color = new THREE.Color();
    for (let i = 0; i < FLECKS; i++) {
      color.set(MESS[Math.floor(rnd() * 6)]);
      colors.set([color.r, color.g, color.b], i * 3);
      this.fleckDrift.push({ phase: rnd() * 6.28, fall: 0.08 + rnd() * 0.12 });
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ size: 0.12, map: softDot(), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    points.frustumCulled = false;
    return points;
  }
}

/** A geometry in one color, as vertex colors, ready to merge with others (no uv needed). */
function tinted(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const plain = g.index ? g.toNonIndexed() : g;
  plain.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const colors = new Float32Array(plain.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return plain;
}

/** A pendant lamp: a cord rising out of view, a dark metal shade, a warm glowing bulb and a soft halo. */
function makeLamp(): THREE.Object3D {
  const pivot = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 30, 6), new THREE.MeshBasicMaterial({ color: 0x2a211b }));
  cord.position.y = 15;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 1.0, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd9c8a4, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }),
  );
  shade.position.y = 0.1;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a6 }));
  bulb.position.y = -0.35;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffc977, transparent: true, opacity: 0.45, depthWrite: false }));
  halo.scale.setScalar(3.4);
  halo.position.y = -0.4;
  pivot.add(cord, shade, bulb, halo);
  // Small next to a tile: a lamp this close must never look bigger than the pieces on the board.
  pivot.scale.setScalar(0.45);
  return pivot;
}

/** Warm plaster: a soft mottle above a dark wood wainscot near the floor. */
function plasterTexture(height: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5a3f2e');
  g.addColorStop(0.55, '#a07a58');
  g.addColorStop(0.86, '#b88f69');
  g.addColorStop(0.87, '#4a3122');
  g.addColorStop(1, '#3a261a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const rnd = seeded(5);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,235,210' : '60,40,25'}, 0.05)`;
    ctx.beginPath();
    ctx.arc(rnd() * 256, rnd() * 220, 10 + rnd() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  void height;
  return tex;
}

/** A tall window: dusk sky behind mullions, deep blue above, amber at the sill. */
function windowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#34477e');
  g.addColorStop(0.5, '#b0809a');
  g.addColorStop(1, '#ffc27a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#2a1d15';
  ctx.fillRect(0, 0, 256, 8);
  ctx.fillRect(0, 248, 256, 8);
  ctx.fillRect(0, 0, 8, 256);
  ctx.fillRect(248, 0, 8, 256);
  ctx.fillRect(124, 0, 8, 256);
  for (const y of [64, 128, 192]) ctx.fillRect(0, y - 3, 256, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Four abstract paintings in one texture, each in a dark frame: big blots and strokes of color. */
let atlas: THREE.CanvasTexture | null = null;
function paintingAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const [c, ctx] = canvas(512);
  const rnd = seeded(97);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  for (let p = 0; p < 4; p++) {
    const [x0, y0] = [(p % 2) * 256, Math.floor(p / 2) * 256];
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(x0, y0, 256, 256);
    ctx.fillStyle = ['#efe4cc', '#e9dcc0', '#f1e8d6', '#e2d3b4'][p];
    ctx.fillRect(x0 + 14, y0 + 14, 228, 228);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 14, y0 + 14, 228, 228);
    ctx.clip();
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = hex(MESS[Math.floor(rnd() * 6)]);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(x0 + 30 + rnd() * 196, y0 + 30 + rnd() * 196, 14 + rnd() * 50, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = hex(MESS[Math.floor(rnd() * 6)]);
      ctx.lineWidth = 6 + rnd() * 12;
      ctx.beginPath();
      ctx.moveTo(x0 + 20 + rnd() * 216, y0 + 20 + rnd() * 216);
      ctx.quadraticCurveTo(x0 + rnd() * 256, y0 + rnd() * 256, x0 + 20 + rnd() * 216, y0 + 20 + rnd() * 216);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

/** Warm floorboards with soft pools of lamplight. */
function floorboardTexture(size: number): THREE.CanvasTexture {
  const px = 1024;
  const [c, ctx] = canvas(px);
  ctx.fillStyle = '#6b4a30';
  ctx.fillRect(0, 0, px, px);
  const rnd = seeded(11);
  const boards = 48;
  for (let i = 0; i < boards; i++) {
    const y = (i / boards) * px;
    ctx.fillStyle = `rgb(${95 + rnd() * 25}, ${64 + rnd() * 18}, ${40 + rnd() * 12})`;
    ctx.fillRect(0, y, px, px / boards - 2);
  }
  // Paint splats, painted into the boards rather than laid on top as hundreds of layers (fill-rate:
  // they cost the laptop's GPU more than the rest of the floor). Not on the furniture, as before.
  const splat = seeded(53);
  const toPx = (u: number) => ((u + size / 2) / size) * px;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  for (let i = 0; i < SPLATS; i++) {
    const r = 30 + splat() * (WALL_DISTANCE - 36);
    const a = splat() * Math.PI * 2;
    const s = 2.4 + splat() * 4.5;
    const stretch = 0.6 + splat() * 0.6;
    const color = MESS[Math.floor(splat() * MESS.length)];
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    if (!clearOfFurniture(x, z)) continue;
    ctx.fillStyle = hex(color);
    ctx.beginPath();
    ctx.ellipse(toPx(x), toPx(z), (s / size) * px, ((s * stretch) / size) * px, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lamplight pools: warm and soft.
  for (const [x, y] of [[360, 380], [660, 400], [300, 680], [720, 660], [512, 512]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 180);
    g.addColorStop(0, 'rgba(255, 205, 130, 0.45)');
    g.addColorStop(1, 'rgba(255, 205, 130, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  void size;
  return tex;
}
