import * as THREE from 'three';
import { Scenery, SceneryTiles, canvas, seeded, softDot } from './scenery';

/**
 * Starfall's two landmarks fill the space behind the board, as every world's surroundings do: the
 * home world under the ground floor, the moon over the ceiling. Both are huge, with a curved edge near the top
 * of the screen, and painted darker than the grass, so a gap always reads as a darker hole.
 */
const RADIUS = 240;
/** How far their nearest points stand from the board's two floors: past the camera on any size of level. */
const WORLD_DEPTH = 55;
const MOON_HEIGHT = 59;
const CAP = 1024;
/** Slow enough to notice only if you look for it. */
const WORLD_TURN = 0.004;
const CLOUD_TURN = 0.007;
const MOON_TURN = 0.0012;
/** Towns gathered into a few regions on the land. If it runs slowly, nothing here moves enough to matter. */
const CITIES = 46;
const LIGHTS_PER_CITY = 14;

/** Smooth random values over a plane. */
function noise2(seed: number): (x: number, y: number) => number {
  const size = 256;
  const rnd = seeded(seed);
  const table = Float32Array.from({ length: size * size }, () => rnd());
  const at = (x: number, y: number) => table[((y & 255) << 8) | (x & 255)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const [ix, iy] = [Math.floor(x), Math.floor(y)];
    const [u, v] = [ease(x - ix), ease(y - iy)];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
    return top + (bottom - top) * v;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let [sum, amp, total] = [0, 0.5, 0];
  for (let i = 0; i < octaves; i++) {
    sum += n(x, y) * amp;
    total += amp;
    amp *= 0.5;
    x = x * 2.03 + 17;
    y = y * 2.03 + 9;
  }
  return sum / total;
}

const step = (t: number, lo: number, hi: number) => THREE.MathUtils.smoothstep(t, lo, hi);
const blend = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** Fill a texture pixel by pixel, in coordinates running −1 to 1 across the cap of the sphere. Colors are 0–255, with alpha. */
function capTexture(paint: (x: number, y: number) => number[], size = CAP): [THREE.CanvasTexture, CanvasRenderingContext2D] {
  const [c, ctx] = canvas(size);
  const image = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [r, g, b, a = 255] = paint((px / size) * 2 - 1, (py / size) * 2 - 1);
      const i = (py * size + px) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return [tex, ctx];
}

/** How high the land stands at a spot on the home world; above COAST it's land. */
const COAST = 0.51;
function worldHeight(): (x: number, y: number) => number {
  const land = noise2(11);
  return (x, y) => fbm(land, x * 7 + 4, y * 7 + 4, 4);
}

/** A picture-book globe: deep dusky seas with a paler shore, and land in two soft greens. Flat shapes, clean edges. */
function worldSurface(): THREE.CanvasTexture {
  const height = worldHeight();
  const tone = noise2(23);
  const [deep, shore, low, high] = [[27, 58, 112], [38, 84, 136], [44, 104, 90], [66, 128, 100]];
  return capTexture((x, y) => {
    const h = height(x, y);
    const sea = blend(deep, shore, step(h, COAST - 0.05, COAST - 0.04));
    const ground = blend(low, high, step(fbm(tone, x * 12 + 2, y * 12, 2), 0.5, 0.53));
    return blend(sea, ground, step(h, COAST - 0.004, COAST + 0.004));
  })[0];
}

/** Soft swirls of pale cloud, on a clear layer that turns a little faster than the ground. */
function worldClouds(): THREE.CanvasTexture {
  const cloud = noise2(53);
  const warp = noise2(71);
  return capTexture((x, y) => {
    // Warped so the clouds swirl instead of lying in blobs.
    const w = fbm(warp, x * 5, y * 5, 2) * 1.6;
    const c = fbm(cloud, x * 9 + w, y * 9 - w, 3);
    return [150, 170, 208, step(c, 0.6, 0.66) * 175];
  }, CAP / 2)[0];
}

/** Small warm lights on the land. */
function worldLights(): THREE.Points {
  const height = worldHeight();
  const rnd = seeded(97);
  const points: number[] = [];
  for (let city = 0; city < CITIES; city++) {
    let [x, y] = [0, 0];
    for (let tries = 0; tries < 40; tries++) {
      [x, y] = [(rnd() * 2 - 1) * 0.8, (rnd() * 2 - 1) * 0.8];
      if (Math.hypot(x, y) < 0.85 && height(x, y) > COAST + 0.03) break;
    }
    for (let i = 0; i < LIGHTS_PER_CITY; i++) {
      const spread = 0.008 + rnd() * rnd() * 0.05;
      const [px, py] = [x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread];
      const top = Math.sqrt(Math.max(1 - px * px - py * py, 0));
      points.push(px * RADIUS, top * RADIUS * 1.001, py * RADIUS);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const lights = new THREE.Points(
    geom,
    new THREE.PointsMaterial({ color: 0xffd28a, map: softDot(), size: 3.2, sizeAttenuation: false, transparent: true, depthWrite: false }),
  );
  lights.frustumCulled = false;
  return lights;
}

/** A picture-book moon: muted silver, soft darker seas, and round craters with a lit rim. */
function moonSurface(): THREE.CanvasTexture {
  const seas = noise2(7);
  const grain = noise2(19);
  const [ground, sea] = [[104, 110, 136], [84, 90, 116]];
  const [tex, ctx] = capTexture((x, y) => {
    const base = blend(ground, sea, step(fbm(seas, x * 2.2 + 3, y * 2.2, 4), 0.5, 0.56));
    const speck = (fbm(grain, x * 26, y * 26, 2) - 0.5) * 12;
    return base.map((v) => v + speck);
  });
  const rnd = seeded(83);
  for (let i = 0; i < 170; i++) {
    const r = (4 + rnd() ** 3 * 26) * (CAP / 1024);
    const [cx, cy] = [rnd() * CAP, rnd() * CAP];
    ctx.fillStyle = 'rgba(124, 130, 156, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
    ctx.fill();
    const bowl = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
    bowl.addColorStop(0, 'rgb(88, 94, 120)');
    bowl.addColorStop(1, 'rgb(72, 78, 104)');
    ctx.fillStyle = bowl;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.needsUpdate = true;
  return tex;
}

/** A dome of the sphere, for the side the board faces, with its texture laid straight onto it from that side. */
function dome(side: 1 | -1, scale = 1): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(RADIUS * scale, 128, 48, 0, Math.PI * 2, side > 0 ? 0 : Math.PI / 2, Math.PI / 2);
  const { position, uv } = geom.attributes;
  for (let v = 0; v < uv.count; v++) {
    uv.setXY(v, position.getX(v) / (RADIUS * scale) / 2 + 0.5, 0.5 - position.getZ(v) / (RADIUS * scale) / 2);
  }
  return geom;
}

/** The soft glow around a sphere's edge, inside and out: `scale` slightly above its size, additive. */
function glow(color: number, strength: number, side: 1 | -1): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        // Seen from inside: strongest right at the sphere's edge, fading out into space.
        float edge = pow(max(dot(-normalize(vNormalW), normalize(vViewW)), 0.0), 3.0);
        gl_FragColor = vec4(uColor, edge * uStrength);
      }`,
  });
  const mesh = new THREE.Mesh(dome(side, 1.09), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

/** Starfall's surroundings: the home world below you on the ground floor, the moon that pulls you up above you on the ceiling. */
export class StarfallScenery implements Scenery {
  readonly group = new THREE.Group();
  private world: THREE.Mesh;
  private clouds: THREE.Mesh;
  private moon: THREE.Mesh;

  constructor() {
    const worldAt = -(WORLD_DEPTH + RADIUS);
    const moonAt = MOON_HEIGHT + RADIUS;

    this.world = new THREE.Mesh(dome(1), new THREE.MeshBasicMaterial({ map: worldSurface() }));
    this.world.add(worldLights());
    this.clouds = new THREE.Mesh(dome(1, 1.004), new THREE.MeshBasicMaterial({ map: worldClouds(), transparent: true, depthWrite: false }));
    this.moon = new THREE.Mesh(dome(-1), new THREE.MeshBasicMaterial({ map: moonSurface() }));
    const air = glow(0x7fb6ff, 0.7, 1);
    const shine = glow(0xc9d2ee, 0.42, -1);
    this.world.position.y = this.clouds.position.y = air.position.y = worldAt;
    this.moon.position.y = shine.position.y = moonAt;
    for (const mesh of [this.world, this.clouds, this.moon]) mesh.frustumCulled = false;
    this.group.add(this.world, this.clouds, this.moon, air, shine);
  }

  place(center: THREE.Vector3, _viewSize: number, _tiles: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
  }

  update(seconds: number, _dt: number, _canvasHeight: number): void {
    this.world.rotation.y = seconds * WORLD_TURN;
    this.clouds.rotation.y = seconds * CLOUD_TURN;
    this.moon.rotation.y = seconds * MOON_TURN;
  }
}
