import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Scenery, cloudTexture, fbm, noise2, seeded, softDot } from './scenery';

/**
 * The Hollow Deep's surroundings (look session 2026-11-24): the board spans a bottomless chasm. Cliff
 * walls of bare rock with crumbling stairs and ledges stand far back on all four sides, beyond the
 * camera, so a quarter turn never puts one in front of the board; they sink into black below. Mist rises
 * out of the void past the board's edges, and pale wisps wander far off along the cliffs, never near the
 * board (they must never be mistaken for its light switches). If it runs slowly, cut the mist first.
 */

/** Rock, lit from above with a breath of the teal dusk, and the black it sinks into. */
const ROCK = new THREE.Color(0x34403d);
const ROCK_LIT = new THREE.Color(0x5e726d);
const STEP = new THREE.Color(0x2e3634);
const VOID = new THREE.Color(0x000000);
/** Pale teal mist and wisps. */
const MIST = 0x9fd2c8;
const WISP = 0xd8fff4;

/**
 * The chasm: cliffs this far out from the board's middle, rising to about board level. Closer after the
 * user's look (was 62: "a bit too far"); a big board pushes them out (place), so they stay past the camera.
 */
const CLIFF_DISTANCE = 44;
const CLIFF_WIDTH = 200;
const CLIFF_TOP = 6;
const CLIFF_BOTTOM = -170;
/** Depth over which the rock fades to black. */
const FADE_FROM = -10;
const FADE_TO = -110;
/**
 * The camera looks steeply down, so the far cliffs fill the screen behind the board. The rock fades to
 * black by screen height instead: the walls show only in the top band, and the void opens behind and
 * below the board, where the dark tiles hang.
 */
const SCREEN_DARK = 0.4;
const SCREEN_LIT = 0.88;

/** Motion. Mist goes first if it runs slowly. */
const MIST_PUFFS = 26;
const MIST_RISE = 0.9;
const MIST_LIFE = 14;
const WISPS = 16;

interface Puff {
  sprite: THREE.Sprite;
  /** Seconds since it rose out of the void. */
  age: number;
  x: number;
  z: number;
}

interface Wisp {
  sprite: THREE.Sprite;
  glow: THREE.Sprite;
  side: number;
  along: number;
  y: number;
  speed: number;
  phase: number;
}

export class HollowScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = { uHeight: { value: 1 } };
  private at = new THREE.Vector3();

  /** Vertex-colored rock that fades to black lower down the screen (see SCREEN_DARK). */
  private rockMaterial(dark = SCREEN_DARK, lit = SCREEN_LIT): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHeight = this.uniforms.uHeight;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uHeight;\nvoid main() {')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb *= smoothstep(${dark.toFixed(2)}, ${lit.toFixed(2)}, gl_FragCoord.y / uHeight);`);
    };
    return mat;
  }
  private puffs: Puff[] = [];
  private wisps: Wisp[] = [];
  private spread = 6;
  /** How far the cliffs are pushed out for this board, as a factor of CLIFF_DISTANCE. */
  private reach = 1;
  private walls: THREE.Mesh[] = [];
  /** Each wall's stairs, by side: only the far wall's show (see update). */
  private stairs: THREE.Mesh[] = [];

  constructor() {
    this.stairs = [0, 1, 2, 3].map((side) => this.makeStairs(side));
    this.walls = [this.makeCliffs(), ...this.stairs];
    this.group.add(...this.walls);
    this.makeMist();
    this.makeWisps();
  }

  place(center: THREE.Vector3, viewSize: number): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.5;
    // A big board's camera stands farther out: push the cliffs out with it, so none comes between.
    this.reach = Math.max(1, (viewSize * 0.9 + 26) / CLIFF_DISTANCE);
    for (const w of this.walls) {
      w.scale.set(this.reach, 1, this.reach);
      w.updateMatrix();
    }
    const rnd = seeded(5);
    this.puffs.forEach((p, i) => {
      this.respawn(p, rnd);
      // Spread their ages, so they don't all rise together.
      p.age = (i / this.puffs.length) * MIST_LIFE;
    });
  }

  update(seconds: number, dt: number, canvasHeight: number, camera: THREE.Camera): void {
    this.uniforms.uHeight.value = canvasHeight;
    // Stairs only on the wall across from the camera: on a side wall they come out beside the board,
    // where a step could pass for a tile (one sat by chasmlab-01's goal).
    const look = camera.getWorldPosition(this.at).sub(this.group.position);
    const far = Math.abs(look.x) > Math.abs(look.z) ? (look.x > 0 ? 3 : 1) : look.z > 0 ? 0 : 2;
    this.stairs.forEach((m, side) => (m.visible = side === far));
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age > MIST_LIFE) {
        this.respawn(p, Math.random);
        p.age = 0;
      }
      const t = p.age / MIST_LIFE;
      p.sprite.position.set(p.x, -14 + p.age * MIST_RISE, p.z);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.16;
      p.sprite.scale.setScalar(5 + t * 5);
    }
    for (const w of this.wisps) {
      w.along += w.speed * dt;
      if (w.along > 1) w.along -= 2;
      const [cx, cz] = this.onCliff(w.side, w.along * (CLIFF_WIDTH * 0.32), 14);
      const [x, z] = [cx * this.reach, cz * this.reach];
      const y = w.y + Math.sin(seconds * 0.6 + w.phase) * 1.5;
      w.sprite.position.set(x, y, z);
      w.glow.position.set(x, y, z);
      const flicker = 0.75 + Math.sin(seconds * 2.3 + w.phase * 3) * 0.15 + Math.sin(seconds * 5.1 + w.phase) * 0.1;
      (w.glow.material as THREE.SpriteMaterial).opacity = 0.35 * flicker;
    }
  }

  /** A point on cliff `side` (0 north, 1 east, 2 south, 3 west), `along` it, `out` toward the middle. */
  private onCliff(side: number, along: number, out: number): [number, number] {
    const d = CLIFF_DISTANCE - out;
    return [[along, -d], [d, along], [-along, d], [-d, -along]][side] as [number, number];
  }

  private respawn(p: Puff, rnd: () => number): void {
    // Just past the board's edges, all round: mist rises out of the void beside it, never over it.
    const a = rnd() * Math.PI * 2;
    const r = this.spread + 2 + rnd() * (this.spread + 6);
    p.x = Math.cos(a) * r;
    p.z = Math.sin(a) * r;
  }

  /**
   * Four rock walls facing the middle, rough with noise, with a few deep ledges, shaded by hand into
   * vertex colors (unlit, so the board's light never touches them) and sinking to black with depth.
   */
  private makeCliffs(): THREE.Mesh {
    const n = noise2(31);
    const light = new THREE.Vector3(-0.4, 0.8, 0.45).normalize();
    const parts: THREE.BufferGeometry[] = [];
    for (let side = 0; side < 4; side++) {
      const geo = new THREE.PlaneGeometry(CLIFF_WIDTH, CLIFF_TOP - CLIFF_BOTTOM, 90, 70);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const [u, v] = [pos.getX(i), pos.getY(i) + (CLIFF_TOP + CLIFF_BOTTOM) / 2];
        // Bulges and gullies, plus horizontal ledge bands that stick out.
        const rough = fbm(n, u * 0.05 + side * 40, v * 0.05, 4) * 14;
        const band = Math.max(0, Math.sin(v * 0.11 + fbm(n, u * 0.02, side * 9, 2) * 4)) ** 6 * 5;
        // The top edge is broken: jagged against the dusk.
        const top = v > CLIFF_TOP - 1 ? (fbm(n, u * 0.08, 99 + side, 3) - 0.5) * 16 : 0;
        pos.setXYZ(i, u, v + top, rough + band);
      }
      geo.computeVertexNormals();
      // Turn the wall to face the middle from its side.
      geo.rotateY([0, -Math.PI / 2, Math.PI, Math.PI / 2][side]);
      const [x, z] = this.onCliff(side, 0, 0);
      geo.translate(x, 0, z);
      geo.computeVertexNormals();
      parts.push(geo);
    }
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const normal = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      normal.fromBufferAttribute(nor, i);
      const lit = Math.max(0, normal.dot(light));
      const grain = fbm(n, pos.getX(i) * 0.2 + pos.getZ(i) * 0.2, y * 0.2, 2);
      c.copy(ROCK).lerp(ROCK_LIT, lit * 0.8).multiplyScalar(0.75 + grain * 0.5);
      const deep = THREE.MathUtils.smoothstep(y, FADE_TO, FADE_FROM);
      c.lerp(VOID, 1 - deep);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, this.rockMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /**
   * Crumbling stairways zigzagging down the cliff faces into the dark, with missing steps, and broken
   * ledges at the turns. One merged mesh, colored like the rock and fading the same way.
   */
  private makeStairs(side: number): THREE.Mesh {
    const rnd = seeded(77 + side * 13);
    const parts: THREE.BufferGeometry[] = [];
    const colors: number[] = [];
    const add = (g: THREE.BufferGeometry, y: number, shade: number) => {
      const deep = THREE.MathUtils.smoothstep(y, FADE_TO, FADE_FROM);
      const c = STEP.clone().multiplyScalar(shade).lerp(VOID, 1 - deep);
      const count = g.attributes.position.count;
      // Tops a little lighter than sides.
      const nor = g.attributes.normal;
      for (let i = 0; i < count; i++) {
        const k = nor.getY(i) > 0.5 ? 1.25 : 0.7;
        colors.push(c.r * k, c.g * k, c.b * k);
      }
      parts.push(g);
    };
    {
      for (let s = 0; s < 2; s++) {
        // Off the middle, where they'd come down beside the board.
        let along = (s ? 1 : -1) * (26 + rnd() * 24);
        let y = CLIFF_TOP - 4 - rnd() * 6;
        let dir = s ? 1 : -1;
        for (let flight = 0; flight < 3; flight++) {
          const steps = 10 + Math.floor(rnd() * 8);
          for (let k = 0; k < steps; k++) {
            along += dir * 1.35;
            y -= 0.9;
            // Crumbled: a gap now and then.
            if (rnd() < 0.15) continue;
            const g = new THREE.BoxGeometry(1.35, 0.5, 2.6);
            g.rotateY([0, -Math.PI / 2, Math.PI, Math.PI / 2][side]);
            const [x, z] = this.onCliff(side, along, 9 + rnd() * 0.6);
            g.translate(x, y, z);
            add(g, y, 0.85 + rnd() * 0.3);
          }
          // A landing at the turn, half broken away.
          const land = new THREE.BoxGeometry(4, 1, 4 + rnd() * 1.5);
          land.rotateY([0, -Math.PI / 2, Math.PI, Math.PI / 2][side]);
          const [x, z] = this.onCliff(side, along + dir * 1.5, 9.5);
          land.translate(x, y - 0.6, z);
          add(land, y, 0.8);
          dir = -dir;
          y -= 2;
        }
      }
    }
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, this.rockMaterial(0.55, 0.95));
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private makeMist(): void {
    const map = cloudTexture(61);
    for (let i = 0; i < MIST_PUFFS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: MIST, transparent: true, opacity: 0, depthWrite: false }));
      sprite.material.rotation = i * 1.7;
      this.group.add(sprite);
      this.puffs.push({ sprite, age: 0, x: 0, z: 0 });
    }
  }

  private makeWisps(): void {
    const dot = softDot();
    const rnd = seeded(13);
    for (let i = 0; i < WISPS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: WISP, transparent: true, depthWrite: false }));
      sprite.scale.setScalar(0.8);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: MIST, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(3.2);
      this.group.add(glow, sprite);
      this.wisps.push({ sprite, glow, side: i % 4, along: rnd() * 2 - 1, y: -6 - rnd() * 40, speed: (rnd() < 0.5 ? -1 : 1) * (0.01 + rnd() * 0.012), phase: rnd() * 10 });
    }
  }
}
