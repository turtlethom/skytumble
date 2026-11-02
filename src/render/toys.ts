import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas } from './scenery';

/** Toybox's toys: rounded shapes in shiny plastic, built from code. Decoration only, never rules. */

const RED = 0xd8443c;
const BLUE = 0x2f7ed0;
const YELLOW = 0xf4bd2c;
const GREEN = 0x3bab68;
const ORANGE = 0xee8a32;
const PURPLE = 0x8d62c4;
const IVORY = 0xf0e6cf;

const plasticCache = new Map<number, THREE.MeshStandardMaterial>();

/** Shiny molded plastic in one color, shared by everything that color. */
function plastic(color: number): THREE.MeshStandardMaterial {
  let mat = plasticCache.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.22 });
    plasticCache.set(color, mat);
  }
  return mat;
}

function part(geom: THREE.BufferGeometry, mat: THREE.Material, y: number, x = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A building-set brick: rounded, with pegs on top that would fit the floor's holes. */
function brick(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = plastic(color);
  g.add(part(new RoundedBoxGeometry(w, h, d, 4, 0.07), mat, h / 2));
  const peg = new THREE.CylinderGeometry(0.11, 0.12, 0.09, 20);
  const [nx, nz] = [Math.max(1, Math.round(w / 0.5)), Math.max(1, Math.round(d / 0.5))];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      g.add(part(peg, mat, h + 0.04, ((i + 0.5) / nx - 0.5) * w, ((j + 0.5) / nz - 0.5) * d));
    }
  }
  return g;
}

/** A tower of bricks stacked slightly off true, as a child would, under a pointed roof. */
export function makeTower(): THREE.Group {
  const g = new THREE.Group();
  const layers: [number, number, number, number, number][] = [
    [1.7, 0.6, 1.7, RED, 0],
    [1.3, 0.55, 1.3, BLUE, 0.2],
    [1.05, 0.55, 1.05, YELLOW, -0.14],
    [1.3, 0.5, 1.3, GREEN, 0.3],
  ];
  let y = 0;
  for (const [w, h, d, color, turn] of layers) {
    const piece = brick(w, h, d, color);
    piece.position.y = y;
    piece.rotation.y = turn;
    g.add(piece);
    y += h;
  }
  g.add(part(new THREE.ConeGeometry(0.6, 0.95, 36), plastic(RED), y + 0.53));
  g.add(part(new THREE.SphereGeometry(0.15, 24, 16), plastic(IVORY), y + 1.04));
  return g;
}

/** The stacking toy: a post on a base with rings narrowing upward and a ball on top. */
export function makeRingStack(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.LatheGeometry(
    [[0, 0], [0.86, 0], [0.92, 0.05], [0.92, 0.13], [0.84, 0.2], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)),
    48,
  );
  g.add(part(base, plastic(IVORY), 0));
  g.add(part(new THREE.CylinderGeometry(0.13, 0.13, 2.2, 20), plastic(IVORY), 1.2));
  let y = 0.2;
  const rings: [number, number][] = [[0.66, RED], [0.58, ORANGE], [0.5, YELLOW], [0.42, GREEN], [0.34, BLUE]];
  for (const [outer, color] of rings) {
    const tube = 0.2;
    const ring = part(new THREE.TorusGeometry(outer - tube + 0.02, tube, 22, 56), plastic(color), y + tube);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    y += tube * 2;
  }
  g.add(part(new THREE.SphereGeometry(0.27, 28, 20), plastic(PURPLE), y + 0.22));
  return g;
}

/** A top's paint: bright wedges around its upper face that blur when it spins, over a solid handle. */
function topPaint(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512);
  const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const wedges = [RED, YELLOW, BLUE, IVORY];
  const count = 12;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = css(wedges[i % wedges.length]);
    ctx.fillRect((i / count) * 512, 0, 512 / count + 1, 512);
  }
  // v runs up the profile, and canvas y runs down: the top of the canvas is the handle end.
  ctx.fillStyle = css(RED);
  ctx.fillRect(0, 0, 512, 512 * 0.3);
  ctx.fillStyle = css(IVORY);
  ctx.fillRect(0, 512 * 0.3, 512, 512 * 0.04);
  ctx.fillStyle = css(BLUE);
  ctx.fillRect(0, 512 * 0.78, 512, 512 * 0.22);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** A spinning top, turned on a lathe, leaning a little. `spinner` is what turns. */
export function makeTop(): THREE.Group {
  const profile = [
    [0, 0], [0.04, 0.05], [0.09, 0.2], [0.26, 0.48], [0.56, 0.84], [0.8, 1.2], [0.84, 1.4],
    [0.74, 1.58], [0.46, 1.74], [0.2, 1.86], [0.15, 2.0], [0.14, 2.5], [0.21, 2.58], [0.21, 2.72], [0.12, 2.8], [0, 2.82],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(profile, false, 'catmullrom', 0.25);
  const points = curve.getSpacedPoints(80).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const body = part(
    new THREE.LatheGeometry(points, 72),
    new THREE.MeshStandardMaterial({ map: topPaint(), roughness: 0.2 }),
    0,
  );
  const spinner = new THREE.Group();
  spinner.add(body);
  const g = new THREE.Group();
  spinner.rotation.z = 0.22;
  g.add(spinner);
  g.userData.spinner = spinner;
  return g;
}

/** The three toys up close, for approving the plastic before building the sea of piles from them. */
export function makeToySamples(center: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const tower = makeTower();
  tower.position.set(center.x - 3.6, 0, center.z);
  const rings = makeRingStack();
  rings.position.set(center.x, 0, center.z);
  const top = makeTop();
  top.position.set(center.x + 3.4, 0, center.z);
  g.add(tower, rings, top);
  return g;
}

/**
 * What shiny plastic reflects: a sunset dome with soft bright patches, so the board's tops and
 * rounded edges catch a sheen from every camera angle. Drawn once, then filtered by the renderer.
 */
export function plasticEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, '#c6b2ea');
  sky.addColorStop(0.3, '#eec3d6');
  sky.addColorStop(0.49, '#ffd9b0');
  sky.addColorStop(0.53, '#a78aa2');
  sky.addColorStop(1, '#6d5a70');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size);
  // One soft patch per camera position, high enough to show on rounded edges.
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    const [px, py, r] = [x * size, size * 0.26, size * 0.1];
    const glow = ctx.createRadialGradient(px, py, 0, px, py, r);
    glow.addColorStop(0, 'rgba(255, 247, 235, 0.95)');
    glow.addColorStop(1, 'rgba(255, 247, 235, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const dome = new THREE.CanvasTexture(c);
  dome.mapping = THREE.EquirectangularReflectionMapping;
  dome.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(dome).texture;
  pmrem.dispose();
  dome.dispose();
  return env;
}
