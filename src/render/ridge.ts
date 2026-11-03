import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, intoTheSky, noise2, seeded } from './scenery';

/** Frost Isle's life: one long snowy ridge behind the board, the reindeer that walk its crest, and the old mine's cable towers. */

const ROCK = 0x6c6ca8;
const SNOW = 0xf2e3e6;

/**
 * The ridge, in units that scale with the level. It runs right around the board, because the camera can look from any side, but only
 * the far part shows: the camera looks down at about 48 degrees, so that part sits near the top of the screen, against the sky.
 */
const CREST_RADIUS = 38;
const INNER_FALL = 11;
const OUTER_FALL = 30;
const CREST_DROP = 30;
/** How low the crest stands below the board: a fixed amount, plus this much per unit of the level's scale. */
const CREST_BELOW = 15;
const CREST_BELOW_SCALED = 9;
/** The side of the ridge that faces away from the camera fades out, by how far round from straight behind the board it is. */
const FAR_FADE: [number, number] = [0.12, 0.5];

/** How far below the crest its slopes thin away. */
const SLOPE_FADE: [number, number] = [2.5, 9];

const lumps = noise2(29);
const peaks = noise2(41);

/** Where the crest runs at an angle around the board: never quite a circle, and rising and falling a little. */
export function crestPoint(a: number): THREE.Vector3 {
  const r = CREST_RADIUS * (1 + 0.04 * Math.sin(a * 2 + 1) + 0.025 * Math.sin(a * 5));
  return new THREE.Vector3(Math.cos(a) * r, 0.9 * Math.sin(a * 3 + 0.7), Math.sin(a) * r);
}

/** Height of the ridge's surface, across it (`d`, negative toward the board) and along it (angle `a`). */
function ridgeHeight(a: number, d: number): number {
  const crest = crestPoint(a).y;
  const [cx, sz] = [Math.cos(a) * 3, Math.sin(a) * 3];
  const fall = d < 0 ? (-d / INNER_FALL) ** 2 : (d / OUTER_FALL) ** 1.6;
  // A flat path along the crest, with soft rolling ground either side.
  const off = THREE.MathUtils.smoothstep(Math.abs(d), 1.5, 5);
  const roll = (fbm(lumps, cx + d * 0.08 + 9, sz + d * 0.08 + 9, 3) - 0.5) * 9 * off;
  // Soft summits stand on the far side of the path, so the skyline isn't one even line.
  const behind = THREE.MathUtils.smoothstep(d, 3, 11) * (1 - THREE.MathUtils.smoothstep(d, 14, OUTER_FALL));
  const rise = Math.max(fbm(peaks, cx * 1.7 + 4, sz * 1.7 + 4, 2) - 0.46, 0) * 34 * behind;
  return crest - fall * CREST_DROP + roll + rise;
}

function ridgeGeometry(): THREE.BufferGeometry {
  const ACROSS = 34;
  const ALONG = 340;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const [rock, snow] = [new THREE.Color(ROCK), new THREE.Color(SNOW)];
  const color = new THREE.Color();
  for (let i = 0; i <= ALONG; i++) {
    const a = (i / ALONG) * Math.PI * 2;
    const crest = Math.hypot(crestPoint(a).x, crestPoint(a).z);
    for (let j = 0; j <= ACROSS; j++) {
      const d = -INNER_FALL + (j / ACROSS) * (INNER_FALL + OUTER_FALL);
      const y = ridgeHeight(a, d);
      positions.push(Math.cos(a) * (crest + d), y, Math.sin(a) * (crest + d));
      // The same ragged snow line as the ridges around it.
      const line = -11 + 4 * (fbm(lumps, Math.cos(a) * 6 + d * 0.3, Math.sin(a) * 6, 2) - 0.5) * 2;
      color.copy(rock).lerp(snow, THREE.MathUtils.smoothstep(y, line - 1, line + 1.5));
      colors.push(color.r, color.g, color.b);
    }
  }
  const row = ACROSS + 1;
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < ACROSS; j++) {
      const [p, q, r, t] = [i * row + j, i * row + j + 1, (i + 1) * row + j, (i + 1) * row + j + 1];
      index.push(p, r, q, q, r, t);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  return geom;
}

/** Shader lines that thin a lit material away on the sides of the ridge that aren't behind the board. */
function farFade(
  mat: THREE.Material,
  center: THREE.IUniform,
  key: string,
  extra: (shader: THREE.WebGLProgramParametersWithUniforms) => void = () => {},
  range: [number, number] = FAR_FADE,
): void {
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCenter = center;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;\nuniform vec3 uCenter;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float behindBoard = dot(normalize(vWorld.xz - uCenter.xz), normalize(uCenter.xz - cameraPosition.xz));
        gl_FragColor.a *= smoothstep(${range[0].toFixed(2)}, ${range[1].toFixed(2)}, behindBoard);
        if (gl_FragColor.a < 0.01) discard;`,
      );
    extra(shader);
  };
  mat.customProgramCacheKey = () => key;
}

// ---------------------------------------------------------------------------
// Reindeer: one mesh with every part, walked in the vertex shader, so a herd is a single draw.

/** Parts of a reindeer, stored per vertex. Feet at y = 0, walking along +x, about 1.2 long and 1.5 tall to the antler tips. */
const BODY = 0;
const LEGS = [1, 2, 3, 4];
const HEAD = 5;
const SHADOW = 6;

function tagged(geom: THREE.BufferGeometry, part: number, pivot: [number, number], knee = 0): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  const pivots = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pivots.set([pivot[0], pivot[1], knee], i * 3);
  g.setAttribute('aPivot', new THREE.BufferAttribute(pivots, 3));
  return g;
}

/** A tapered limb between two points. */
function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides = 7): THREE.BufferGeometry {
  const len = from.distanceTo(to);
  const geom = new THREE.CylinderGeometry(r1, r0, len, sides);
  geom.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  geom.applyQuaternion(q);
  geom.translate(from.x, from.y, from.z);
  return geom;
}

/** A soft-ended blob: a sphere stretched to `scale`, at a point. */
function blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt = 0): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, 16, 11);
  geom.scale(sx, sy, sz);
  geom.rotateZ(tilt);
  geom.translate(x, y, z);
  return geom;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function reindeerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // One smooth barrel from rump to chest, turned on a lathe along the body and flattened, deep at the chest.
  const outline = [[0, -0.46], [0.07, -0.44], [0.125, -0.35], [0.14, -0.15], [0.135, 0.05], [0.16, 0.22], [0.15, 0.33], [0.09, 0.41], [0, 0.44]]
    .map(([r, y]) => v3(r, y, 0));
  const barrel = new THREE.LatheGeometry(new THREE.CatmullRomCurve3(outline).getPoints(26).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y)), 16);
  barrel.rotateZ(-Math.PI / 2);
  barrel.scale(1, 1, 0.74);
  barrel.translate(0, 0.74, 0);
  parts.push(tagged(barrel, BODY, [0, 0]));
  // The shaggy mane under the neck, and a short tail.
  parts.push(tagged(blob(0.39, 0.66, 0, 0.075, 0.13, 0.065, -0.45), BODY, [0, 0]));
  parts.push(tagged(blob(-0.47, 0.78, 0, 0.05, 0.03, 0.03, 0.6), BODY, [0, 0]));

  // Neck and head, which nod together from the shoulders.
  const neckBase: [number, number] = [0.36, 0.8];
  parts.push(tagged(limb(v3(0.32, 0.76, 0), v3(0.58, 1.02, 0), 0.105, 0.058, 10), HEAD, neckBase));
  parts.push(tagged(blob(0.63, 1.04, 0, 0.1, 0.058, 0.052, -0.42), HEAD, neckBase));
  parts.push(tagged(blob(0.73, 0.985, 0, 0.055, 0.036, 0.036, -0.42), HEAD, neckBase));
  for (const side of [-1, 1]) {
    parts.push(tagged(blob(0.54, 1.095, side * 0.06, 0.042, 0.017, 0.016, 0.5), HEAD, neckBase));
    // Antlers: a main beam sweeping up and back, with tines off its front.
    const points = [v3(0.58, 1.08, side * 0.025), v3(0.53, 1.2, side * 0.08), v3(0.44, 1.3, side * 0.12), v3(0.39, 1.42, side * 0.12), v3(0.42, 1.51, side * 0.09)];
    points.slice(1).forEach((p, i) => parts.push(tagged(limb(points[i], p, 0.02 - i * 0.003, 0.015 - i * 0.003, 5), HEAD, neckBase)));
    const tines: [THREE.Vector3, THREE.Vector3][] = [
      [points[1], v3(0.65, 1.25, side * 0.07)],
      [points[2], v3(0.54, 1.38, side * 0.14)],
      [points[3], v3(0.5, 1.46, side * 0.16)],
    ];
    for (const [from, to] of tines) parts.push(tagged(limb(from, to, 0.012, 0.004, 4), HEAD, neckBase));
  }

  // Legs, in walking order: hind left, fore left, hind right, fore right. Each has a hip and a knee.
  const legs: [number, number, number, boolean][] = [
    [LEGS[0], -0.32, 1, true],
    [LEGS[1], 0.27, 1, false],
    [LEGS[2], -0.32, -1, true],
    [LEGS[3], 0.27, -1, false],
  ];
  for (const [part, x, side, hind] of legs) {
    const z = side * 0.075;
    const hip: [number, number] = [x, 0.72];
    const kneeY = hind ? 0.38 : 0.34;
    // Hind legs have a thick thigh and a hock that juts backward; forelegs run nearly straight.
    const knee = v3(x + (hind ? -0.07 : 0.01), kneeY, z);
    const top = v3(x + (hind ? 0.03 : 0), 0.76, z);
    parts.push(tagged(limb(top, knee, hind ? 0.085 : 0.062, 0.027, 8), part, hip, kneeY));
    const foot = v3(x + (hind ? -0.015 : 0.015), 0.04, z);
    parts.push(tagged(limb(knee, foot, 0.027, 0.02, 6), part, hip, kneeY));
    // Broad hooves, as reindeer have for walking on snow.
    parts.push(tagged(blob(foot.x + 0.012, 0.03, z, 0.046, 0.03, 0.038), part, hip, kneeY));
  }

  // A soft patch of shade on the snow.
  const shade = new THREE.CircleGeometry(1, 20);
  shade.rotateX(-Math.PI / 2);
  shade.scale(0.5, 1, 0.15);
  shade.translate(0, 0.012, 0);
  parts.push(tagged(shade, SHADOW, [0, 0]));
  return mergeGeometries(parts)!;
}

const reindeerVertex = `
  attribute float aPart;
  attribute vec3 aPivot;
  attribute float aPhase;
  uniform float uTime;
  uniform float uStride;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vWorld;
  varying float vPart;

  vec2 turn(vec2 p, vec2 about, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    p -= about;
    return about + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    vPart = aPart;
    vec3 p = position;
    vec3 n = normal;
    float cycle = (uTime * uStride + aPhase) * 6.2832;
    if (aPart > 0.5 && aPart < 4.5) {
      // A four-beat walk: hind left, fore left, hind right, fore right, each a quarter of a stride apart.
      float leg = cycle - (aPart - 1.0) * 1.5708;
      float swing = sin(leg);
      // The knee folds as the leg comes forward, off the ground.
      float fold = max(cos(leg), 0.0);
      fold = fold * fold * 0.95;
      if (position.y < aPivot.z) {
        p.xy = turn(p.xy, vec2(aPivot.x - 0.03, aPivot.z), -fold);
      }
      p.xy = turn(p.xy, aPivot.xy, 0.34 * swing + fold * 0.3);
      n.xy = turn(n.xy, vec2(0.0), 0.34 * swing);
    }
    float bob = sin(cycle * 2.0) * 0.012;
    if (aPart < 0.5) p.y += bob;
    if (aPart > 4.5 && aPart < 5.5) {
      // The head nods with the stride, and turns a little now and then.
      p.xy = turn(p.xy, aPivot.xy, sin(cycle * 2.0 + 0.6) * 0.045);
      p.y += bob;
    }
    vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const reindeerFragment = `
  uniform vec3 uDark;
  uniform vec3 uWarm;
  uniform vec3 uSun;
  uniform vec3 uShade;
  uniform vec3 uCenter;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vWorld;
  varying float vPart;
  void main() {
    // Thinning away where the ridge does, far out to the sides.
    float fade = smoothstep(FADE_FROM, FADE_TO, dot(normalize(vWorld.xz - uCenter.xz), normalize(uCenter.xz - cameraPosition.xz)));
    if (fade < 0.01) discard;
    if (vPart > 5.5) {
      gl_FragColor = vec4(uShade, 0.3 * fade);
      #include <colorspace_fragment>
      return;
    }
    vec3 n = normalize(vNormalW);
    // A dark silhouette, lit only along the edge that faces the low dawn sun.
    float rim = pow(1.0 - max(dot(n, normalize(vViewW)), 0.0), 2.4);
    float sunSide = smoothstep(-0.25, 0.7, dot(n, uSun));
    vec3 color = mix(uDark, uWarm, rim * sunSide);
    color += uDark * 0.5 * max(n.y, 0.0);
    gl_FragColor = vec4(color, fade);
    #include <colorspace_fragment>
  }`.replace('FADE_FROM', FAR_FADE[0].toFixed(2)).replace('FADE_TO', FAR_FADE[1].toFixed(2));

/** A herd in one draw. Set each animal's place with `setAt`, and advance it with `uniforms.uTime`. */
export function makeHerd(count: number): { mesh: THREE.InstancedMesh; uniforms: Record<string, THREE.IUniform> } {
  const geom = reindeerGeometry();
  const rnd = seeded(61);
  geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, () => rnd()), 1));
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uStride: { value: 0.48 },
    uDark: { value: new THREE.Color(0x3a2c33) },
    uWarm: { value: new THREE.Color(0xffc48f) },
    uSun: { value: new THREE.Vector3(-0.7, 0.35, 0.62).normalize() },
    uShade: { value: new THREE.Color(0x8f8db8) },
    uCenter: { value: new THREE.Vector3() },
  };
  const mesh = new THREE.InstancedMesh(
    geom,
    new THREE.ShaderMaterial({ uniforms, vertexShader: reindeerVertex, fragmentShader: reindeerFragment, transparent: true }),
    count,
  );
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// The old mine: rusted lattice towers and slack cable.

const RUST = [0x7b4a32, 0x5c3a2a, 0x8d5a3c];

/** A leaning rusted lattice tower, base at y = 0, about 7 tall with a crossarm and two pulley wheels. */
export function towerGeometry(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const add = (geom: THREE.BufferGeometry, tint?: number) => {
    const g = geom.index ? geom.toNonIndexed() : geom;
    g.deleteAttribute('uv');
    color.set(tint ?? RUST[Math.floor(rnd() * RUST.length)]);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };
  const HEIGHT = 7;
  const at = (x: number, z: number, y: number) => {
    const w = 1 - (y / HEIGHT) * 0.72;
    return v3(x * w, y, z * w);
  };
  const corners: [number, number][] = [[-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]];
  for (const [x, z] of corners) add(limb(at(x, z, 0), at(x, z, HEIGHT), 0.07, 0.045, 5));
  const LEVELS = 6;
  for (let l = 0; l < LEVELS; l++) {
    const [y0, y1] = [(l / LEVELS) * HEIGHT, ((l + 1) / LEVELS) * HEIGHT];
    corners.forEach(([x, z], i) => {
      const [nx, nz] = corners[(i + 1) % 4];
      add(limb(at(x, z, y1), at(nx, nz, y1), 0.03, 0.03, 4));
      // Zigzag bracing, with one missing here and there: this has stood a long time.
      if (rnd() > 0.1) add(limb(at(x, z, l % 2 ? y0 : y1), at(nx, nz, l % 2 ? y1 : y0), 0.022, 0.022, 4));
    });
  }
  add(limb(v3(-1.5, HEIGHT, 0), v3(1.5, HEIGHT, 0), 0.075, 0.075, 5));
  for (const x of [-1.5, 1.5]) {
    const wheel = new THREE.CylinderGeometry(0.21, 0.21, 0.1, 14);
    wheel.rotateX(Math.PI / 2);
    wheel.translate(x, HEIGHT - 0.14, 0);
    add(wheel, 0x4a2f24);
  }
  // Snow caught on the crossarm.
  const snow = new THREE.BoxGeometry(2.7, 0.06, 0.15);
  snow.translate(0, HEIGHT + 0.08, 0);
  add(snow, SNOW);
  const merged = mergeGeometries(parts)!;
  // It leans, a little differently each time.
  merged.rotateZ((rnd() - 0.5) * 0.14);
  merged.rotateX((rnd() - 0.5) * 0.1);
  return merged;
}

/** A slack cable hanging between two points. */
export function cableGeometry(from: THREE.Vector3, to: THREE.Vector3, sag: number, radius = 0.03): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = from.clone().lerp(to, t);
    p.y -= sag * 4 * t * (1 - t);
    points.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, radius, 5, false);
}

// ---------------------------------------------------------------------------
// The whole of it, around a level.

/** Evenly spaced groups, so one is nearly always crossing behind the board. */
const GROUPS = 4;
const GROUP = 3;
const REINDEER_SIZE = 1.5;
/** How fast each group walks, in radians a second around the ridge, and how far apart its animals are. */
const WALK_TURN = 0.02;
const ANIMAL_GAP = 0.062;
/** Cable towers along the far edge of the path, and their size against the rest. */
const TOWERS = 14;
const TOWER_SIZE = 0.42;
const TOWER_BEHIND = 3.4;
/** The cable line fades sooner than the ridge: further out it would run across the level's text at the top of the screen. */
const LINE_FADE: [number, number] = [0.72, 0.92];
const LINE_HAZE = 0.28;

/** One long snowy ridge around the board, with reindeer on its crest and the old cable line behind them. */
export class FrostRidge {
  readonly group = new THREE.Group();
  private center = { value: new THREE.Vector3() };
  private herd = makeHerd(GROUP * GROUPS);
  private dummy = new THREE.Object3D();

  constructor(uniforms: { uHeight: { value: number }; uHaze: { value: THREE.Color } }) {
    this.herd.uniforms.uCenter = this.center;
    const ridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    farFade(ridgeMat, this.center, 'frost-ridge', (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vDrop;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDrop = -position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;\nvarying float vDrop;')
        .replace(
          'float behindBoard',
          `// Sinking into the same rose haze as the ridges around it, with only the top standing clear.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 0.08 + 0.3 * smoothstep(1.0, 8.0, vDrop));
          // Its slopes thin away a little below the crest, so the ridges you know still fill the view under it.
          gl_FragColor.a *= 1.0 - smoothstep(SLOPE_FADE_FROM, SLOPE_FADE_TO, vDrop);
          ${intoTheSky(0.02, 0.2, 0.76, 0.9, 1.02)}
          float behindBoard`.replace('SLOPE_FADE_FROM', SLOPE_FADE[0].toFixed(1)).replace('SLOPE_FADE_TO', SLOPE_FADE[1].toFixed(1)),
        );
    });
    const ridge = new THREE.Mesh(ridgeGeometry(), ridgeMat);
    ridge.frustumCulled = false;
    // After the cloud, since it blends over it as it thins.
    ridge.renderOrder = -2.4;

    // The old cable line: towers just behind the path, each carrying a slack cable on to the next.
    const towerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // In a little of the haze, so the line stays in the distance.
    const hazed = (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHaze;')
        .replace('float behindBoard', `gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, ${LINE_HAZE.toFixed(2)});\nfloat behindBoard`);
    };
    farFade(towerMat, this.center, 'frost-towers', hazed, LINE_FADE);
    const towers = new THREE.InstancedMesh(towerGeometry(5), towerMat, TOWERS);
    towers.frustumCulled = false;
    const tops: THREE.Vector3[] = [];
    const place = new THREE.Object3D();
    for (let i = 0; i < TOWERS; i++) {
      const a = (i / TOWERS) * Math.PI * 2 + 0.2;
      const crest = crestPoint(a);
      const radial = Math.hypot(crest.x, crest.z);
      const r = radial + TOWER_BEHIND;
      place.position.set(Math.cos(a) * r, ridgeHeight(a, TOWER_BEHIND) - 0.2, Math.sin(a) * r);
      // The crossarm lies across the ridge, with a wheel over each cable.
      place.rotation.y = -a;
      place.scale.setScalar(TOWER_SIZE);
      place.updateMatrix();
      towers.setMatrixAt(i, place.matrix);
      tops.push(new THREE.Vector3(0, 7 - 0.05, 0).applyMatrix4(place.matrix));
    }
    const cables = tops.map((from, i) => cableGeometry(from, tops[(i + 1) % TOWERS], 1.3, 0.04));
    const cableMat = new THREE.MeshLambertMaterial({ color: 0x4a3a3c });
    farFade(cableMat, this.center, 'frost-cables', hazed, LINE_FADE);
    const cable = new THREE.Mesh(mergeGeometries(cables)!, cableMat);
    cable.frustumCulled = false;

    this.herd.mesh.renderOrder = 0;
    this.group.add(ridge, towers, cable, this.herd.mesh);
  }

  place(center: THREE.Vector3, viewSize: number): void {
    const scale = viewSize / 14;
    this.center.value.copy(center).setY(0);
    this.group.scale.setScalar(scale);
    this.group.position.y = -CREST_BELOW - CREST_BELOW_SCALED * scale;
  }

  update(seconds: number): void {
    this.herd.uniforms.uTime.value = seconds;
    const { dummy, herd } = this;
    for (let g = 0; g < GROUPS; g++) {
      for (let i = 0; i < GROUP; i++) {
        const a = seconds * WALK_TURN + (g * Math.PI * 2) / GROUPS - i * ANIMAL_GAP;
        const here = crestPoint(a);
        const ahead = crestPoint(a + 0.02);
        dummy.position.copy(here);
        dummy.rotation.y = -Math.atan2(ahead.z - here.z, ahead.x - here.x);
        dummy.scale.setScalar(REINDEER_SIZE);
        dummy.updateMatrix();
        herd.mesh.setMatrixAt(g * GROUP + i, dummy.matrix);
      }
    }
    herd.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** `?sheet=frost&summit`: a reindeer walking big and at real size, up close on a strip of floor. */
export class ReindeerCloseUp {
  readonly group = new THREE.Group();
  private herd = makeHerd(2);
  private dummy = new THREE.Object3D();

  constructor(private center: THREE.Vector3) {
    this.herd.uniforms.uCenter = { value: center.clone().setZ(center.z + 400) };
    this.group.add(this.herd.mesh);
  }

  update(seconds: number): void {
    this.herd.uniforms.uTime.value = seconds;
    const { center, dummy, herd } = this;
    // Walking along the floor, wrapping off the ends of it.
    const span = 13;
    dummy.position.set(center.x + ((seconds * 0.85) % span) - span / 2, 0, center.z + 1);
    dummy.scale.setScalar(2);
    dummy.updateMatrix();
    herd.mesh.setMatrixAt(0, dummy.matrix);
    dummy.position.set(center.x + span / 2 - ((seconds * 0.5) % span), 0, center.z - 0.8);
    dummy.rotation.y = Math.PI;
    dummy.scale.setScalar(0.95);
    dummy.updateMatrix();
    dummy.rotation.y = 0;
    herd.mesh.setMatrixAt(1, dummy.matrix);
    herd.mesh.instanceMatrix.needsUpdate = true;
  }
}
