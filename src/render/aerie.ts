import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from './scenery';

/** Windy Peaks' landmarks: four different wind-carved rock structures, two with a nest, and the birds that fly between them. */

const ROCK_LIGHT = new THREE.Color(0xa9adb3);
const ROCK_DARK = new THREE.Color(0x6a6f77);
const HEATHER = [0xd98cc0, 0xc979b4, 0xe6a6cf, 0xb868a8];
// Weathered, greyer than fresh wood, so a nest belongs to this stone.
const STICKS = [0x7d6a55, 0x64513f, 0x8f7c63, 0x4f4033];
const HAZE = 0xe2e7ea;

/** The arch's size in its own units: span between its feet, height of its crown, and how far its legs run down. */
const SPAN = 8;
const RISE = 5.4;
const LEG_DROP = 9;
const NEST_RADIUS = 0.82;
/** How high a nest's rim stands above its base. */
const NEST_RIM = 0.48;
/** The birds' size against everything else. */
const BIRD_SIZE = 0.85;
const EGG_RADIUS = 0.25;
/** Where eggs lie in a nest, and how each leans. */
const EGG_SPOTS = [[-0.27, 0.1, 0.42], [0.27, 0.13, -0.42], [0.01, -0.28, 0.12]];

function colored(geom: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const plain = geom.index ? geom.toNonIndexed() : geom;
  plain.deleteAttribute('uv');
  const count = plain.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return plain;
}

type Point = [number, number, number];

/** The spires' layered bands, slightly tilted, with a little break-up so they don't look ruled. */
function rockColor(x: number, y: number, z: number, color: THREE.Color): THREE.Color {
  const strata = y * 5.2 + x * 0.32 + 0.6 * Math.sin(x * 1.3 + z * 1.7);
  const bands = 0.5 + 0.3 * Math.sin(strata) + 0.2 * Math.sin(strata * 2.7 + 1.3);
  return color.copy(ROCK_DARK).lerp(ROCK_LIGHT, THREE.MathUtils.smoothstep(bands, 0.25, 0.75));
}

/** Rock swept along a curve: a lumpy ring carried from u = 0 to 1, with ledges across it, like the spires around it. */
function sweep(curve: (u: number) => Point, thick: (u: number) => number, seed: number, depth = 1.15, along = 110): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const [phaseA, phaseB] = [rnd() * 6.28, rnd() * 6.28];
  const AROUND = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i <= along; i++) {
    const u = i / along;
    const [cx, cy, cz] = curve(u);
    const [ax, ay] = curve(Math.max(u - 0.004, 0));
    const [bx, by] = curve(Math.min(u + 0.004, 1));
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const [nx, ny] = [(by - ay) / len, -(bx - ax) / len];
    const base = thick(u);
    for (let j = 0; j <= AROUND; j++) {
      const a = (j / AROUND) * Math.PI * 2;
      // Barely turning along its length, since a twist would look like a root. Mostly ledges, across it.
      const lobes = 0.1 * Math.sin(a * 3 + phaseA + u * 2) + 0.06 * Math.sin(a * 5 + phaseB - u * 3);
      // Uneven ledges: evenly spaced ones look like a stack of tires.
      const ledges = 0.055 * Math.sin(u * 37 + 3 * Math.sin(u * 9 + phaseA) + phaseB) + 0.03 * Math.sin(u * 83 + 4 * Math.sin(u * 13 + phaseB) + a) + 0.02 * Math.sin(u * 190 + a * 2);
      const r = base * (1 + lobes + ledges);
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      const [x, y, z] = [cx + nx * cos * r, cy + ny * cos * r, cz + sin * r * depth];
      positions.push(x, y, z);
      rockColor(x, y, z, color);
      colors.push(color.r, color.g, color.b);
    }
  }
  const row = AROUND + 1;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < AROUND; j++) {
      const [a, b, c, d] = [i * row + j, i * row + j + 1, (i + 1) * row + j, (i + 1) * row + j + 1];
      index.push(a, b, c, b, d, c);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  return geom.toNonIndexed();
}

/** Two legs running down, joined by a curve. `span` is between the feet, `rise` the crown's height, `lean` shifts the crown sideways. */
function archCurve(span: number, rise: number, lean: number): (u: number) => Point {
  const LEG = 0.22;
  return (u) => {
    if (u < LEG) {
      const k = u / LEG;
      return [-span / 2 - (1 - k) * 0.9, -LEG_DROP * (1 - k), 0];
    }
    if (u > 1 - LEG) {
      const k = (u - (1 - LEG)) / LEG;
      return [span / 2 + k * 0.9, -LEG_DROP * k, 0];
    }
    const a = Math.PI * (1 - (u - LEG) / (1 - 2 * LEG));
    return [(Math.cos(a) * span) / 2 + Math.sin(a) * lean, Math.sin(a) ** 0.82 * rise, 0];
  };
}

/** A straight pillar with a slight lean, narrowing upward and closing over at its top. */
function pillar(x: number, z: number, height: number, width: number, seed: number): THREE.BufferGeometry {
  const lean = (seed % 2 ? 1 : -1) * 0.3;
  return sweep(
    (u) => [x + Math.sin(u * 2.2) * lean, -LEG_DROP + (height + LEG_DROP) * u, z],
    (u) => width * (0.72 + (1 - u) * 0.75) * Math.min(1, Math.sqrt(Math.max(1 - u, 0) / 0.035)),
    seed,
    1.05,
    70,
  );
}

/** A rounded rock ledge, the seat for a nest, so it grows out of the stone instead of balancing on top. */
function ledge(at: THREE.Vector3, radius: number, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const [a, b] = [rnd() * 6.28, rnd() * 6.28];
  const geom = new THREE.IcosahedronGeometry(radius, 4);
  const { position } = geom.attributes;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let v = 0; v < position.count; v++) {
    const [x, y, z] = [position.getX(v), position.getY(v), position.getZ(v)];
    const lump = 1 + 0.12 * Math.sin(x * 4 + a) * Math.cos(z * 4 + b) + 0.06 * Math.sin(y * 9 + a);
    position.setXYZ(v, at.x + x * lump, at.y + y * 0.42 * lump, at.z + z * lump);
    rockColor(position.getX(v), position.getY(v), position.getZ(v), color);
    colors.set([color.r, color.g, color.b], v * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.deleteAttribute('uv');
  geom.computeVertexNormals();
  return geom;
}

/** Tufts of heather on upward-facing rock, in drifts, plus a little around each nest, outside its rim. */
function heatherGeometry(rock: THREE.BufferGeometry, nests: THREE.Vector3[], seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const { position, normal } = rock.attributes;
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const blob = new THREE.IcosahedronGeometry(1, 0);
  const tuft = (x: number, y: number, z: number) => {
    const size = 0.045 + rnd() * 0.06;
    const t = blob.clone();
    t.scale(size * 1.25, size * 0.8, size * 1.25);
    t.translate(x, y + size * 0.4, z);
    parts.push(colored(t, color.set(HEATHER[Math.floor(rnd() * HEATHER.length)])));
  };
  const drift = (x: number, z: number) => Math.sin(x * 1.1 + 2 + seed) * Math.cos(z * 1.9) + Math.sin(x * 2.3 - z);
  for (let tries = 0; tries < 14000 && parts.length < 400; tries++) {
    const v = Math.floor(rnd() * position.count);
    const [x, y, z] = [position.getX(v), position.getY(v), position.getZ(v)];
    if (normal.getY(v) < 0.5 || y < -3.5 || drift(x, z) < 0.05) continue;
    // Never inside a nest, or on the ledge right under it.
    if (nests.some((n) => Math.hypot(x - n.x, z - n.z) < NEST_RADIUS * 1.2 && y > n.y - 0.6)) continue;
    tuft(x + (rnd() - 0.5) * 0.26, y, z + (rnd() - 0.5) * 0.26);
  }
  for (const nest of nests) {
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const r = NEST_RADIUS * (1.25 + rnd() * 0.35);
      tuft(nest.x + Math.cos(a) * r, nest.y - 0.1 + rnd() * 0.1, nest.z + Math.sin(a) * r);
    }
  }
  return mergeGeometries(parts)!;
}

/** A nest of weathered sticks around a dark hollow, low and messy. Its base sits at y = 0, sunk into its ledge. */
function nestGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  for (let i = 0; i < 210; i++) {
    const a = rnd() * Math.PI * 2;
    const height = rnd();
    const ring = NEST_RADIUS * (0.66 + height * 0.4) + (rnd() - 0.5) * 0.14;
    const length = 0.55 + rnd() * 0.6;
    const stick = new THREE.CylinderGeometry(0.02 + rnd() * 0.02, 0.03 + rnd() * 0.02, length, 5);
    // Roughly around the rim, with a few poking out, the way real nests are messy.
    const along = new THREE.Vector3(-Math.sin(a), (rnd() - 0.5) * 0.5, Math.cos(a))
      .addScaledVector(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), (rnd() - 0.5) * 0.7)
      .normalize();
    q.setFromUnitVectors(up, along);
    m.compose(new THREE.Vector3(Math.cos(a) * ring, 0.05 + height * NEST_RIM, Math.sin(a) * ring), q, new THREE.Vector3(1, 1, 1));
    stick.applyMatrix4(m);
    parts.push(colored(stick, color.set(STICKS[Math.floor(rnd() * STICKS.length)])));
  }
  // The hollow: a dark floor inside the rim, so you can't see through to the sky.
  const floor = new THREE.CircleGeometry(NEST_RADIUS * 0.88, 22);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, NEST_RIM * 0.55, 0);
  parts.push(colored(floor, color.set(0x2a2018)));
  return mergeGeometries(parts)!;
}

/** A little of the world's bright haze over everything. `uFade` thins it away between two heights, sinking its legs out of sight. */
function rockMaterial(haze: number, fade: THREE.Vector2): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  const tint = new THREE.Color(HAZE);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = { value: fade };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;\nuniform vec2 uFade;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${tint.r.toFixed(3)}, ${tint.g.toFixed(3)}, ${tint.b.toFixed(3)}), ${haze.toFixed(3)});
        gl_FragColor.a *= 1.0 - smoothstep(uFade.x, uFade.y, -vWorldY);`,
      );
  };
  mat.customProgramCacheKey = () => `aerie-${haze}`;
  return mat;
}

/** An arch's thickness: `crown` at its thinnest, swelling toward its feet. */
const archThick = (crown: number) => (u: number) => {
  const fromCrown = Math.abs(u - 0.5) * 2;
  return crown + fromCrown ** 2.2 * 0.8 + Math.max(0, fromCrown - 0.56) * 1.1;
};

/** The four structures around the board: three arches of different proportions and a family of pillars, two with a nest. */
type StructureKind = 'arch' | 'stacks' | 'stout' | 'tall';

function structureParts(kind: StructureKind, seed: number): { rock: THREE.BufferGeometry[]; nests: THREE.Vector3[] } {
  switch (kind) {
    case 'arch': {
      // A lopsided arch, its nest tucked on the shoulder rather than crowning the top.
      const curve = archCurve(SPAN, RISE, 0.45);
      const thick = archThick(0.64);
      const [x, y] = curve(0.37);
      const nest = new THREE.Vector3(x - 0.15, y + 0.86, -0.1);
      return { rock: [sweep(curve, thick, seed), ledge(new THREE.Vector3(nest.x, nest.y - 0.2, nest.z), NEST_RADIUS * 1.45, seed + 3)], nests: [nest] };
    }
    case 'stacks': {
      // A family of three pillars, their nest on the shortest, at the front.
      const nest = new THREE.Vector3(2.15, 3.95, -0.7);
      return {
        rock: [
          pillar(-2.2, 0.5, 7.2, 0.95, seed),
          pillar(0.2, 0, 5.2, 1.1, seed + 1),
          pillar(2.2, -0.7, 3.2, 1.05, seed + 2),
          ledge(new THREE.Vector3(nest.x, nest.y - 0.3, nest.z), NEST_RADIUS * 1.5, seed + 3),
        ],
        nests: [nest],
      };
    }
    case 'stout': {
      // A low, wide arch, heavier than the others, with a stub of rock beside it. No nest.
      const curve = archCurve(SPAN + 0.8, RISE - 1.5, 0.35);
      return { rock: [sweep(curve, archThick(0.86), seed, 1.3), pillar(6, 0.5, 1.5, 0.75, seed + 1)], nests: [] };
    }
    case 'tall': {
      // A tall, narrow arch leaning the other way. No nest.
      return { rock: [sweep(archCurve(SPAN - 2, RISE + 2, -0.9), archThick(0.6), seed)], nests: [] };
    }
  }
}

/** One rock structure with its heather and any nest. `userData.fade` sets the two depths its legs thin away between. */
export function makeStructure(kind: StructureKind, seed: number, haze = 0): THREE.Group {
  const g = new THREE.Group();
  const fade = new THREE.Vector2(1e4, 2e4);
  const material = rockMaterial(haze, fade);
  const { rock, nests } = structureParts(kind, seed);
  const merged = mergeGeometries(rock.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  const shape = new THREE.Mesh(mergeGeometries([merged, heatherGeometry(merged, nests, seed + 7)])!, material);
  shape.castShadow = shape.receiveShadow = true;
  g.add(shape);
  nests.forEach((at, i) => {
    const nest = new THREE.Mesh(nestGeometry(seed + 11 + i), material);
    nest.position.set(at.x, at.y - 0.12, at.z);
    nest.castShadow = nest.receiveShadow = true;
    const eggMaterial = new THREE.MeshLambertMaterial({ color: 0xe6e3d8, transparent: true });
    // Big enough to fill the hollow, leaning together: three in one nest, two in the other.
    const clutch = EGG_SPOTS.slice(0, i === 0 && kind === 'arch' ? 3 : 2);
    for (const [x, z, turn] of clutch) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(EGG_RADIUS, 16, 12), eggMaterial);
      egg.scale.set(1, 1.28, 1);
      egg.rotation.set(turn * 0.6, 0, turn);
      egg.position.set(x, NEST_RIM * 0.55 + EGG_RADIUS * 0.95, z);
      nest.add(egg);
    }
    g.add(nest);
  });
  merged.computeBoundingBox();
  g.userData.top = merged.boundingBox!.max.y;
  g.userData.fade = fade;
  return g;
}

const sharedParts = new Map<string, unknown>();

/** One copy of a part for every bird, so a flock costs little more than one. */
function shared<T>(key: string, make: () => T): T {
  if (!sharedParts.has(key)) sharedParts.set(key, make());
  return sharedParts.get(key) as T;
}

/** A flat wing panel with its span along +z from the origin: `sweep` carries its tip backward. One-sided shapes, shown from both sides. */
function wingPanel(rootChord: number, tipChord: number, length: number, sweep: number, pointed: boolean): THREE.BufferGeometry {
  return shared(`wing-${rootChord}-${tipChord}-${length}-${sweep}-${pointed}`, () => buildWingPanel(rootChord, tipChord, length, sweep, pointed));
}

function buildWingPanel(rootChord: number, tipChord: number, length: number, sweep: number, pointed: boolean): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(rootChord * 0.45, 0);
  s.bezierCurveTo(rootChord * 0.5, length * 0.5, tipChord * 0.5 - sweep, length * 0.8, tipChord * 0.4 - sweep, length);
  if (pointed) s.lineTo(-tipChord * 0.5 - sweep, length * 1.04);
  else s.lineTo(-tipChord * 0.6 - sweep, length);
  s.bezierCurveTo(-tipChord * 0.7 - sweep * 0.7, length * 0.6, -rootChord * 0.55, length * 0.3, -rootChord * 0.55, 0);
  s.closePath();
  const geom = new THREE.ShapeGeometry(s, 10);
  geom.rotateX(Math.PI / 2);
  return geom;
}

const BIRD = { body: 0xf3f3ef, wing: 0xbfc4cc, tip: 0xc9683c, beak: 0xe9a23b, eye: 0x20222a };

/** A storybook seabird, long and slim, flying along +x. Call `flap(seconds)` to beat its wings. About 1.7 from wing tip to wing tip. */
export function makeBird(): THREE.Group {
  const g = new THREE.Group();
  const soft = (color: number) => shared(`soft-${color}`, () => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  // One smooth shape from tail to head, turned on a lathe along the bird's length.
  const shape = shared('body', () => {
    const profile = [[0, -0.5], [0.03, -0.42], [0.075, -0.26], [0.125, -0.08], [0.14, 0.06], [0.115, 0.2], [0.095, 0.28], [0.098, 0.36], [0.07, 0.44], [0, 0.48]]
      .map(([r, y]) => new THREE.Vector3(r, y, 0));
    const outline = new THREE.CatmullRomCurve3(profile).getPoints(40).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
    const geom = new THREE.LatheGeometry(outline, 24);
    geom.rotateZ(-Math.PI / 2);
    geom.scale(1, 0.92, 0.9);
    geom.computeVertexNormals();
    return geom;
  });
  g.add(new THREE.Mesh(shape, shared('bodyMat', () => new THREE.MeshLambertMaterial({ color: BIRD.body }))));
  const beak = new THREE.Mesh(shared('beak', () => new THREE.ConeGeometry(0.032, 0.14, 10)), soft(BIRD.beak));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.53, -0.004, 0);
  g.add(beak);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(shared('eye', () => new THREE.SphereGeometry(0.015, 10, 8)), soft(BIRD.eye));
    eye.position.set(0.39, 0.03, side * 0.08);
    g.add(eye);
  }
  const tail = new THREE.Mesh(wingPanel(0.11, 0.2, 0.2, 0, false), soft(BIRD.wing));
  tail.rotation.y = Math.PI / 2;
  tail.position.set(-0.38, 0.015, 0);
  g.add(tail);

  const joints: { inner: THREE.Group; outer: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const inner = new THREE.Group();
    inner.position.set(0.1, 0.05, side * 0.07);
    const mirror = new THREE.Group();
    mirror.scale.z = side;
    inner.add(mirror);
    mirror.add(new THREE.Mesh(wingPanel(0.3, 0.25, 0.4, 0.05, false), soft(BIRD.wing)));
    const outer = new THREE.Group();
    outer.position.set(-0.05, 0, 0.4);
    outer.add(new THREE.Mesh(wingPanel(0.25, 0.09, 0.32, 0.17, false), soft(BIRD.wing)));
    // The warm accent: wing tips that look dipped in rust. Just above the wing, so it never flickers.
    const tip = new THREE.Mesh(wingPanel(0.12, 0.07, 0.12, 0.08, true), soft(BIRD.tip));
    tip.position.set(-0.14, 0.004, 0.235);
    outer.add(tip);
    mirror.add(outer);
    g.add(inner);
    joints.push({ inner, outer, side });
  }
  g.userData.flap = (seconds: number) => {
    // Long glides with a few slow beats, as big seabirds fly.
    const strength = 0.25 + 0.75 * Math.max(0, Math.sin(seconds * 0.8));
    const beat = Math.sin(seconds * 5.4) * strength;
    for (const { inner, outer, side } of joints) {
      inner.rotation.x = -side * (0.12 + beat * 0.34);
      outer.rotation.x = -(-0.1 + Math.sin(seconds * 5.4 - 0.8) * strength * 0.3);
    }
  };
  (g.userData.flap as (s: number) => void)(0.3);
  g.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh));
  return g;
}

/** The structures around the board, by side. Nests on opposite sides, so turning the view alternates nest and open rock. */
const SIDES: StructureKind[] = ['stacks', 'tall', 'arch', 'stout'];

/** `?sheet=peaks&aerie`: all four structures in a row, with birds, for approving before the rest is built. */
export function makeAerieCloseUp(center: THREE.Vector3): { group: THREE.Group; birds: THREE.Group[] } {
  const group = new THREE.Group();
  const row: StructureKind[] = ['arch', 'stout', 'stacks', 'tall'];
  row.forEach((kind, i) => {
    const s = makeStructure(kind, 3 + i * 9);
    s.scale.setScalar(0.5);
    s.position.set(center.x - 7.4 + i * 5, -2.7, center.z - 7);
    group.add(s);
  });
  const big = makeBird();
  big.scale.setScalar(2.2);
  big.position.set(center.x + 3.4, 1.6, center.z + 0.2);
  big.rotation.y = 0.35;
  const real = makeBird();
  real.scale.setScalar(BIRD_SIZE);
  real.position.set(center.x - 0.8, 1.2, center.z + 1.2);
  real.rotation.y = 2.4;
  group.add(big, real);
  return { group, birds: [big, real] };
}

/**
 * Flock timing: how long between flights, and how long a crossing takes. A flight runs from past one screen edge to past
 * the other, far enough that even the last bird is off screen at both ends, since a bird vanishing in view kills the mood.
 * `FLIGHT_BAND` is how high up the screen it crosses, as a share of the distance from the middle to the top.
 */
const FLIGHT_GAP = [20, 30];
const FIRST_FLIGHT = 5;
const CROSSING_SECONDS = [9, 12];
const OFF_SCREEN = 1.6;
const FLIGHT_BAND = [0.42, 0.72];
const FLOCK = 5;
const FLOCK_BIRD_SIZE = 1.1;
/** Birds fly under the board's level, so they never cover a tile. */
const FLIGHT_Y = -5.5;

/**
 * The four structures around the board, and the flock. Only the structure behind the board shows: at the
 * screen's edges the others would be cut-off pieces, and nearer, so larger. They fade as the view turns.
 */
export class AerieRing {
  readonly group = new THREE.Group();
  private structures: { group: THREE.Group; mats: THREE.Material[]; alpha: number }[] = [];
  private center = new THREE.Vector3();
  private birds: THREE.Group[] = [];
  private flockGroup = new THREE.Group();
  private path: [THREE.Vector3, THREE.Vector3, THREE.Vector3] | null = null;
  private pathStart = 0;
  private pathSeconds = 1;
  private nextFlight = 0;
  private fresh = true;
  private away = new THREE.Vector2();
  private out = new THREE.Vector2();

  constructor() {
    SIDES.forEach((kind, i) => {
      const s = makeStructure(kind, 3 + i * 9, 0.24);
      s.rotation.y = (i * Math.PI) / 2;
      const mats: THREE.Material[] = [];
      s.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && !mats.includes(mat)) mats.push(mat);
      });
      this.structures.push({ group: s, mats, alpha: 1 });
      this.group.add(s);
    });
    for (let i = 0; i < FLOCK; i++) {
      const bird = makeBird();
      bird.scale.setScalar(FLOCK_BIRD_SIZE);
      bird.traverse((o) => (o.castShadow = false));
      this.birds.push(bird);
      this.flockGroup.add(bird);
    }
    this.flockGroup.visible = false;
    this.group.add(this.flockGroup);
  }

  /** Stand them around a level: directly behind the board in each camera view, the top near the top of the screen. */
  place(center: THREE.Vector3, viewSize: number): void {
    this.center.copy(center);
    const out = viewSize * 1.3;
    const scale = viewSize * 0.13;
    const crown = -7.5;
    this.structures.forEach(({ group: s }, i) => {
      const a = (i * Math.PI) / 2;
      const y = crown - (s.userData.top as number) * scale;
      s.scale.setScalar(scale);
      s.position.set(Math.sin(a) * out, y, Math.cos(a) * out);
      // Its legs thin away well before they'd reach the corners of the screen.
      (s.userData.fade as THREE.Vector2).set(-(y + 4), -(y - 4));
    });
    this.flockGroup.visible = false;
    this.path = null;
    this.fresh = true;
  }

  update(seconds: number, camera: THREE.Camera): void {
    this.away.set(this.center.x - camera.position.x, this.center.z - camera.position.z).normalize();
    for (const s of this.structures) {
      const facing = this.out.set(s.group.position.x, s.group.position.z).normalize().dot(this.away);
      const alpha = THREE.MathUtils.smoothstep(facing, 0.3, 0.85);
      s.group.visible = alpha > 0.005;
      if (alpha !== s.alpha) {
        s.alpha = alpha;
        for (const mat of s.mats) mat.opacity = alpha;
      }
    }
    if (this.fresh) {
      this.fresh = false;
      this.nextFlight = seconds + FIRST_FLIGHT;
    }
    if (!this.path && seconds >= this.nextFlight) this.launch(seconds, camera);
    if (this.path) this.fly(seconds);
  }

  /** Cross the whole backdrop behind the board as the view stands now, from either side, drifting up or down a little on the way. */
  private launch(seconds: number, camera: THREE.Camera): void {
    const side = Math.random() < 0.5 ? 1 : -1;
    const [lo, hi] = FLIGHT_BAND;
    const [startY, endY] = [lo + Math.random() * (hi - lo), lo + Math.random() * (hi - lo)];
    const at = (x: number, y: number) => {
      // Where this spot on the screen meets the height the birds fly at, relative to the board.
      const ray = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position);
      const point = camera.position.clone().addScaledVector(ray, (FLIGHT_Y - camera.position.y) / ray.y);
      return point.sub(this.center).setY(FLIGHT_Y);
    };
    this.path = [at(side * OFF_SCREEN, startY), at(0, (startY + endY) / 2 + 0.08), at(-side * OFF_SCREEN, endY)];
    this.pathStart = seconds;
    this.pathSeconds = CROSSING_SECONDS[0] + Math.random() * (CROSSING_SECONDS[1] - CROSSING_SECONDS[0]);
    this.flockGroup.visible = true;
  }

  private fly(seconds: number): void {
    const [a, b, c] = this.path!;
    const t = (seconds - this.pathStart) / this.pathSeconds;
    if (t >= 1) {
      this.path = null;
      this.flockGroup.visible = false;
      this.nextFlight = seconds + FLIGHT_GAP[0] + Math.random() * (FLIGHT_GAP[1] - FLIGHT_GAP[0]);
      return;
    }
    const [u, v, w] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];
    const [px, py, pz] = [u * a.x + v * b.x + w * c.x, u * a.y + v * b.y + w * c.y, u * a.z + v * b.z + w * c.z];
    let [dx, dz] = [2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x), 2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z)];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.birds.forEach((bird, i) => {
      const rank = Math.ceil(i / 2);
      const wing = i % 2 ? 1 : -1;
      const back = rank * 1.7;
      const across = rank * wing * 1.9;
      // Each drifts a little in place, so it isn't a rigid stamp.
      const drift = Math.sin(seconds * 0.9 + i * 2.1) * 0.22;
      bird.position.set(px - dx * back - dz * across + drift * dz, py - rank * 0.25 + drift * 0.6, pz - dz * back + dx * across - drift * dx);
      bird.rotation.y = -Math.atan2(dz, dx);
      (bird.userData.flap as (s: number) => void)(seconds + i * 0.73);
    });
  }
}
