import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, intoTheSky, noise2, seeded } from './scenery';

/** First Glade's landmarks and small life: grassy hills crowned with old trees around the board, and butterflies beyond its edges. */

const BARK = [0x4f3a2c, 0x6b5240, 0x86694f];
/** Pale, like the canopy around them, so the rich moss on the board still stands out. */
const LEAF_SHADE = 0x6f9f86;
const LEAF_MID = 0x98c5a0;
const LEAF_LIT = 0xc9e4b8;
const GRASS = [0x86b57a, 0xa5cc8c, 0xc5e0a4];
const FOREST_DEPTHS = 0x86b394;

/** Sizes in a tree's own units. */
const TRUNK_LENGTH = 12;
const TRUNK_RADIUS = 3.1;
/** How much a limb narrows along its length. A fork starts at about the width its parent ends at, so joints don't step. */
const TAPER = 0.38;

/** How finely a tree is built. Only the great tree behind the opening view gets the finest, so all eight groves cost about what one did. */
interface Quality {
  depth: number;
  segments: number;
  sides: number;
  padAround: number;
  padDown: number;
  /** Extra smaller pads around each big one. */
  extraPads: number;
  padSize: number;
}
const FINE: Quality = { depth: 3, segments: 11, sides: 12, padAround: 14, padDown: 9, extraPads: 3, padSize: 1 };
const MEDIUM: Quality = { depth: 3, segments: 7, sides: 8, padAround: 14, padDown: 9, extraPads: 2, padSize: 1.1 };
const SIMPLE: Quality = { depth: 2, segments: 7, sides: 8, padAround: 14, padDown: 9, extraPads: 2, padSize: 1.55 };

const barkNoise = noise2(83);

/** One limb: a ring swept along a wandering path, tapering, with knots and furrows in its surface. Grows its children, and leaf pads at its tips. */
function growBranch(
  parts: THREE.BufferGeometry[],
  tips: THREE.Vector3[],
  rnd: () => number,
  start: THREE.Vector3,
  heading: THREE.Vector3,
  length: number,
  radius: number,
  depth: number,
  quality: Quality,
): void {
  const { segments, sides } = quality;
  const isTrunk = depth === quality.depth;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const [dark, mid, light] = BARK.map((c) => new THREE.Color(c));
  const color = new THREE.Color();
  const at = start.clone();
  const dir = heading.clone().normalize();
  // Carried along the limb and kept square to it. Worked out afresh from a near-vertical heading, it flips, twisting the limb into spikes.
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const across = new THREE.Vector3();
  const spots: THREE.Vector3[] = [];
  const wobble = new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2);
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    side.addScaledVector(dir, -side.dot(dir)).normalize();
    across.crossVectors(dir, side).normalize();
    // The foot of the trunk flares out into roots; everything else just narrows.
    const flare = isTrunk ? 1 + 1.3 * Math.max(1 - u * 3.2, 0) ** 2 : 1;
    const r = radius * (1 - u * TAPER) * flare;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      // Buttresses at the foot, furrows running along the limb, and an occasional knot.
      const roots = isTrunk ? 0.26 * Math.max(1 - u * 2.4, 0) * Math.sin(a * 5 + 1) : 0;
      const furrows = 0.07 * Math.sin(a * 7 + u * 3 + start.x);
      const knots = 0.16 * (fbm(barkNoise, a * 1.4 + start.x, u * 6 + start.y, 2) - 0.5) * 2;
      const rr = r * (1 + roots + furrows + knots);
      positions.push(
        at.x + (side.x * Math.cos(a) + across.x * Math.sin(a)) * rr,
        at.y + (side.y * Math.cos(a) + across.y * Math.sin(a)) * rr,
        at.z + (side.z * Math.cos(a) + across.z * Math.sin(a)) * rr,
      );
      const tone = 0.5 + 0.5 * Math.sin(a * 7 + u * 3 + start.x) + (knots / 0.16) * 0.4;
      color.copy(dark).lerp(mid, THREE.MathUtils.smoothstep(tone, 0.1, 0.6)).lerp(light, THREE.MathUtils.smoothstep(tone, 0.7, 1.2));
      colors.push(color.r, color.g, color.b);
    }
    spots.push(at.clone());
    if (i < segments) {
      // Wander, as old limbs do, with a slow pull toward the light.
      const t = u * Math.PI * 2 + start.x;
      dir.addScaledVector(wobble, 0.09 * Math.sin(t * 1.3)).add(new THREE.Vector3(0, 0.022, 0)).normalize();
      at.addScaledVector(dir, length / segments);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const [p, q, r, t] = [i * row + j, i * row + j + 1, (i + 1) * row + j, (i + 1) * row + j + 1];
      index.push(p, r, q, q, r, t);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  parts.push(geom);

  if (depth === 0) {
    tips.push(at.clone());
    return;
  }
  // The trunk parts into several great limbs reaching out; later forks are narrower.
  const children = isTrunk ? 5 : 2 + Math.floor(rnd() * 2);
  const turn = rnd() * 6.28;
  for (let c = 0; c < children; c++) {
    const a = turn + (c / children) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const out = new THREE.Vector3(Math.cos(a), isTrunk ? 0.42 : 0.3 + rnd() * 0.3, Math.sin(a));
    const next = dir.clone().multiplyScalar(isTrunk ? 0.35 : 0.75).add(out).normalize();
    const from = spots[isTrunk ? segments - 1 - (c % 3) : segments - (c % 2) * 2];
    growBranch(parts, tips, rnd, from, next, length * (isTrunk ? 0.72 : 0.68) * (0.85 + rnd() * 0.3), radius * (1 - TAPER) * (isTrunk ? 0.86 : 0.92), depth - 1, quality);
  }
}

/** A pad of foliage: a flattened lumpy dome, dark underneath and sunlit on top, in layers like a very old tree's crown. */
function leafPad(x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, around: number, down: number): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, around, down);
  geom.deleteAttribute('uv');
  const { position } = geom.attributes;
  for (let v = 0; v < position.count; v++) {
    const [px, py, pz] = [position.getX(v), position.getY(v), position.getZ(v)];
    const clumps = 0.13 * Math.sin(px * 6 + seed) * Math.sin(py * 5 + seed * 2) * Math.sin(pz * 6 - seed) + 0.05 * Math.sin(px * 15 + pz * 13 + seed);
    const k = 1 + clumps;
    position.setXYZ(v, px * k, py * k, pz * k);
  }
  geom.scale(sx, sy, sz);
  geom.computeVertexNormals();
  geom.translate(x, y, z);
  const { normal } = geom.attributes;
  const colors = new Float32Array(position.count * 3);
  const [shade, mid, lit] = [LEAF_SHADE, LEAF_MID, LEAF_LIT].map((c) => new THREE.Color(c));
  const color = new THREE.Color();
  const dapple = seeded(Math.floor(seed * 100) + 3);
  for (let v = 0; v < position.count; v++) {
    const up = normal.getY(v) + (dapple() - 0.5) * 0.22;
    color.copy(shade).lerp(mid, THREE.MathUtils.smoothstep(up, -0.35, 0.3)).lerp(lit, THREE.MathUtils.smoothstep(up, 0.45, 1));
    colors.set([color.r, color.g, color.b], v * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

/** One tree on its own, foot at the origin. */
function treeGeometry(seed: number, quality: Quality): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  growBranch(parts, tips, rnd, new THREE.Vector3(), new THREE.Vector3(0.05, 1, 0.02), TRUNK_LENGTH, TRUNK_RADIUS, quality.depth, quality);
  const { padAround: around, padDown: down, extraPads, padSize } = quality;
  // A few overlapping pads over each branch end, smaller than the crown's limbs are long, so they read as foliage and not as single shapes.
  tips.forEach((tip, i) => {
    const size = (2.5 + rnd() * 1.1) * padSize;
    parts.push(leafPad(tip.x, tip.y + 0.4, tip.z, size, size * 0.52, size, i * 1.7, around, down));
    for (let k = 0; k < extraPads; k++) {
      const a = rnd() * 6.28;
      const r = size * (0.7 + rnd() * 0.4);
      const small = size * (0.5 + rnd() * 0.25);
      parts.push(leafPad(tip.x + Math.cos(a) * r, tip.y - 0.4 + rnd() * 1.2, tip.z + Math.sin(a) * r, small, small * 0.55, small, i * 2.3 + k + 1, around, down));
    }
  });
  return mergeGeometries(parts)!;
}

/** Across and back from the hill's top, how big, its own shape, and how finely it's built. */
type TreeSpot = [number, number, number, number, Quality];

interface Grove {
  /** Where the hill's top stands, relative to the board's middle. */
  x: number;
  z: number;
  radius: number;
  height: number;
  /** How much canopy to take away around it: treetops in front would otherwise hide its top. */
  clearing: number;
  trees: TreeSpot[];
}

/**
 * Hills placed in the world, not scaled with the level, as the canopy is. The camera's steep angle puts a spot about 31 from the board's
 * middle just behind the board, so the four nearest are what you see behind it in each view; the others stand off to the sides.
 */
export const GROVES: Grove[] = [
  // Behind the board at a level's starting view: the great tree and three companions.
  { x: 0, z: -31, radius: 18, height: 9, clearing: 10, trees: [[0, 0, 0.5, 37, FINE], [-7.5, 0.5, 0.3, 53, MEDIUM], [7, -1.5, 0.27, 71, MEDIUM], [2.5, -7, 0.24, 19, MEDIUM]] },
  { x: 31, z: 2, radius: 16, height: 8, clearing: 9, trees: [[0, 1, 0.45, 11, MEDIUM], [-6, -3, 0.34, 23, SIMPLE], [5, 4, 0.3, 29, SIMPLE]] },
  { x: -2, z: 31, radius: 20, height: 8.5, clearing: 11, trees: [[3, 0, 0.38, 41, MEDIUM], [-6, 2, 0.35, 47, SIMPLE], [8, -4, 0.3, 59, SIMPLE], [-1, -7, 0.26, 61, SIMPLE]] },
  { x: -31, z: -3, radius: 15, height: 9.5, clearing: 8.5, trees: [[0, 0, 0.48, 67, MEDIUM], [5.5, 2, 0.28, 73, SIMPLE]] },
  // Smaller ones further out, at the sides of the view.
  { x: 34, z: -33, radius: 12, height: 7, clearing: 7, trees: [[0, 0, 0.38, 79, SIMPLE], [-4, 3, 0.28, 83, SIMPLE]] },
  { x: 36, z: 35, radius: 11, height: 6.5, clearing: 6.5, trees: [[1, 0, 0.42, 89, SIMPLE]] },
  { x: -35, z: 34, radius: 13, height: 7.5, clearing: 7.5, trees: [[-2, 0, 0.36, 97, SIMPLE], [3, -2, 0.32, 101, SIMPLE]] },
  { x: -33, z: -36, radius: 10, height: 6, clearing: 6, trees: [[0, 0, 0.4, 103, SIMPLE]] },
];

/** The canopy's slow roll, so a hill rises the same amount above the treetops wherever it is. */
export function canopyRoll(x: number, z: number): number {
  return Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06) * 4;
}

const HILL_TOP = -25;
/** Below this far under a hill's top, it takes the shade of the forest floor, so it can't show as stray grass between crowns. */
const HILL_SHADE: [number, number] = [3, 5.5];
const HILL_EDGE_PAST_CLEARING = 3;

/** A soft grassy dome, sinking away under the treetops past its clearing. Height is relative to its top. */
function hillHeight(g: Grove, x: number, z: number): number {
  const r = Math.hypot(x, z * 1.1) / g.radius;
  const lump = 0.07 * Math.sin(x * 0.28 + g.x) * Math.cos(z * 0.31 + g.z) + 0.03 * Math.sin(x * 0.7 + z * 0.6 + g.z);
  // A second, offset swell, so no two hills have the same outline, and none is a perfect ball.
  const shoulder = 0.16 * Math.exp(-(((x - g.radius * 0.35 * Math.sin(g.x)) / (g.radius * 0.45)) ** 2) - ((z - g.radius * 0.3 * Math.cos(g.z)) / (g.radius * 0.5)) ** 2);
  const under = 12 * THREE.MathUtils.smoothstep(Math.hypot(x, z), g.clearing - 1.5, g.clearing + HILL_EDGE_PAST_CLEARING);
  return g.height * (Math.exp(-r * r * 2.6) - 1 + shoulder + lump * Math.max(1 - r, 0)) - under;
}

function hillGeometry(g: Grove): THREE.BufferGeometry {
  const RINGS = 28;
  const AROUND = 56;
  const edge = g.clearing + HILL_EDGE_PAST_CLEARING;
  const positions: number[] = [0, hillHeight(g, 0, 0), 0];
  const index: number[] = [];
  for (let i = 1; i <= RINGS; i++) {
    const r = (edge * i) / RINGS;
    for (let j = 0; j < AROUND; j++) {
      const a = (j / AROUND) * Math.PI * 2;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      positions.push(x, hillHeight(g, x, z), z);
    }
  }
  for (let j = 0; j < AROUND; j++) index.push(0, 1 + (j + 1) % AROUND, 1 + j);
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < AROUND; j++) {
      const [a, b] = [1 + i * AROUND + j, 1 + i * AROUND + (j + 1) % AROUND];
      const [c, d] = [a + AROUND, b + AROUND];
      index.push(a, b, c, b, d, c);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  const { position, normal } = geom.attributes;
  const colors = new Float32Array(position.count * 3);
  const [shade, mid, lit] = GRASS.map((c) => new THREE.Color(c));
  const depths = new THREE.Color(FOREST_DEPTHS);
  const color = new THREE.Color();
  for (let v = 0; v < position.count; v++) {
    const dapple = fbm(barkNoise, position.getX(v) * 0.5 + g.x + 40, position.getZ(v) * 0.5 + g.z, 2) - 0.5;
    const up = normal.getY(v) + dapple * 0.5;
    color.copy(shade).lerp(mid, THREE.MathUtils.smoothstep(up, 0.55, 0.85)).lerp(lit, THREE.MathUtils.smoothstep(up, 0.9, 1.15));
    color.lerp(depths, THREE.MathUtils.smoothstep(-position.getY(v), HILL_SHADE[0], HILL_SHADE[1]));
    colors.set([color.r, color.g, color.b], v * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

/** One hill with its trees and bushes, in coordinates relative to the board's middle. */
function groveGeometry(g: Grove): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [hillGeometry(g)];
  for (const [x, z, size, seed, quality] of g.trees) {
    const tree = treeGeometry(seed, quality);
    tree.scale(size, size, size);
    tree.rotateY(seed);
    // Sunk in a little, so the roots grow out of the grass.
    tree.translate(x, hillHeight(g, x, z) - 0.25, z);
    parts.push(tree);
  }
  const rnd = seeded(Math.floor(g.x * 7 + g.z * 3) + 200);
  const bushes = Math.round(g.radius / 2.5);
  for (let i = 0; i < bushes; i++) {
    const a = rnd() * 6.28;
    const r = g.radius * (0.2 + rnd() * 0.24);
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    const size = 0.7 + rnd() * 0.6;
    parts.push(leafPad(x, hillHeight(g, x, z) + size * 0.2, z, size, size * 0.6, size, i * 3.1, 8, 5));
  }
  const merged = mergeGeometries(parts)!;
  merged.translate(g.x, HILL_TOP + canopyRoll(g.x, g.z), g.z);
  return merged;
}

/** Every grove, one mesh each, so the ones out of view aren't drawn. */
export function makeGroves(uniforms: Record<string, THREE.IUniform>): THREE.Group {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Only the crowns move, and very slowly, as the canopy around them does.
        float reach = max(position.y - ${(HILL_TOP + 4).toFixed(1)}, 0.0);
        transformed.xz += vec2(sin(uTime * 0.4 + position.x * 0.1), cos(uTime * 0.33 + position.z * 0.1)) * reach * 0.02;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.07, 0.2, 0.76, 0.93, 1.05)}`);
  };
  const group = new THREE.Group();
  for (const g of GROVES) {
    const mesh = new THREE.Mesh(groveGeometry(g), mat);
    mesh.renderOrder = -0.5;
    group.add(mesh);
  }
  return group;
}

/** A monarch's wing: orange cells between black veins, with a black border and white spots. Hinged at the texture's left edge. */
function wingTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(4, 118);
  ctx.bezierCurveTo(60, 8, 190, -10, 248, 34);
  ctx.bezierCurveTo(250, 80, 214, 118, 150, 128);
  ctx.bezierCurveTo(186, 158, 180, 222, 112, 246);
  ctx.bezierCurveTo(70, 252, 22, 200, 4, 138);
  ctx.closePath();
  ctx.fillStyle = '#17120f';
  ctx.fill();
  ctx.fillStyle = '#e8622a';
  ctx.beginPath();
  ctx.moveTo(12, 122);
  ctx.bezierCurveTo(64, 34, 150, 22, 214, 46);
  ctx.bezierCurveTo(206, 80, 180, 104, 132, 118);
  ctx.bezierCurveTo(158, 152, 150, 200, 110, 222);
  ctx.bezierCurveTo(76, 224, 36, 182, 12, 136);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#17120f';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  for (const [x, y, cx, cy] of [[214, 46, 120, 62], [190, 84, 120, 88], [132, 118, 80, 110], [150, 170, 84, 140], [110, 222, 70, 160], [60, 186, 46, 150]]) {
    ctx.beginPath();
    ctx.moveTo(10, 128);
    ctx.quadraticCurveTo(cx, cy, x, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff7ea';
  for (const [x, y, r] of [[232, 42, 6], [222, 66, 5], [206, 92, 5], [182, 112, 4], [166, 170, 4], [150, 208, 4], [120, 236, 4], [84, 228, 3]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** How big a wing is, how fast it beats, and how far past the board's bounds a butterfly's patch of air lies: more than it ever wanders. */
const WING = 0.36;
const FLAP_RATE = 19;
const WING_SWING = 0.85;
const OUT = 3;
const FLY_HEIGHT = 0.8;
/** Which side of the board each lives on, as an angle, so one is near whichever way you've turned. */
const HOMES = [0.1, 2.2, 4.3];

/** A few butterflies meandering in the air around the board, each over its own patch beyond the tiles. */
export class Butterflies {
  readonly group = new THREE.Group();
  private flies: { group: THREE.Group; hinges: THREE.Group[]; home: THREE.Vector3; phase: number }[] = [];
  private ahead = new THREE.Vector3();

  constructor() {
    // Spanning out along +z from the body at the origin, forewing leading toward +x.
    const wingGeometry = new THREE.PlaneGeometry(1, 1);
    wingGeometry.rotateX(-Math.PI / 2);
    wingGeometry.rotateY(Math.PI / 2);
    wingGeometry.translate(0, 0, 0.5);
    const wingMaterial = new THREE.MeshLambertMaterial({ map: wingTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const bodyGeometry = new THREE.CapsuleGeometry(0.035, 0.34, 3, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x17120f });
    HOMES.forEach((_, i) => {
      const group = new THREE.Group();
      const hinges = [1, -1].map((side) => {
        const hinge = new THREE.Group();
        hinge.scale.z = side;
        hinge.userData.side = side;
        hinge.add(new THREE.Mesh(wingGeometry, wingMaterial));
        group.add(hinge);
        return hinge;
      });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.rotation.z = Math.PI / 2;
      group.add(body);
      group.scale.setScalar(WING);
      this.flies.push({ group, hinges, home: new THREE.Vector3(), phase: i * 17.3 });
      this.group.add(group);
    });
  }

  /** Stand each on its patch of air, just outside a square around the whole board, relative to its middle. */
  place(viewSize: number): void {
    const reach = viewSize / 2 + OUT;
    this.flies.forEach((f, i) => {
      const [c, s] = [Math.cos(HOMES[i]), Math.sin(HOMES[i])];
      // Out to the square's edge in that direction, not a circle's, so a corner of the board is never under it.
      const k = reach / Math.max(Math.abs(c), Math.abs(s));
      f.home.set(c * k, FLY_HEIGHT, s * k);
    });
  }

  update(seconds: number): void {
    for (const f of this.flies) {
      const t = seconds + f.phase;
      // Meandering, with the little dips butterflies make as they beat.
      const at = (time: number, out: THREE.Vector3) =>
        out.set(Math.sin(time * 0.37) * 1.5 + Math.sin(time * 0.91) * 0.4, Math.sin(time * 0.6) * 0.3 + Math.sin(time * 2.3) * 0.09, Math.cos(time * 0.29) * 1.7).add(f.home);
      const here = at(t, f.group.position);
      const ahead = at(t + 0.05, this.ahead);
      f.group.rotation.y = -Math.atan2(ahead.z - here.z, ahead.x - here.x);
      // Quick deep beats from nearly closed to just past flat, easing off now and then into a short glide.
      const glide = 0.45 + 0.55 * Math.max(0, Math.sin(t * 0.8 + 1)) ** 0.4;
      const angle = 0.55 + Math.sin(t * FLAP_RATE) * WING_SWING * glide;
      for (const hinge of f.hinges) hinge.rotation.x = -hinge.userData.side * angle;
    }
  }
}
