import * as THREE from 'three';
import { Scenery, SceneryTiles, canvas, fbm, noise2, seeded, softDot } from './scenery';

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

/** Motion, kept apart so it can be turned down. If it runs slowly, cut falling stars first, then the satellite, then the comet. */
const COMET_GAP = [20, 30];
const COMET_SECONDS = 5.5;
const COMET_LENGTH = 62;
const COMET_WIDTH = 5.5;
const SHOOTING_GAP = [3.5, 8];
const SHOOTING_SECONDS = 0.8;
const SHOOTING_LENGTH = 30;
const SHOOTING_WIDTH = 1.5;
/** How far off streaks fly: past the planet's edge, which they pass behind, and short of the stars. */
const STREAK_DISTANCE = 330;

/** The orbit: level with the gap between the floors, beyond the board's corners, so it never crosses a gap. */
const ORBIT_Y = 2;
const ORBIT_MARGIN = 5;
const ORBIT_TUBE = 0.045;
const SATELLITE_SPEED = 1.1;

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

/** A soft dot with a long fading tail, as one strip that faces the camera. Used for the comet and for falling stars. */
class Streak {
  readonly mesh: THREE.Mesh;
  private start = new THREE.Vector3();
  private end = new THREE.Vector3();
  private born = -1000;
  private duration = 1;
  private head = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private side = new THREE.Vector3();
  private toCamera = new THREE.Vector3();

  constructor(
    private length: number,
    private width: number,
    color: number,
  ) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
    geom.setIndex([0, 1, 2, 2, 1, 3]);
    this.mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ color, map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Over the far planet, under the board.
    this.mesh.renderOrder = -1;
  }

  /** Fly from one screen spot to another as seen right now, at a fixed distance. The path stays put if the view turns. */
  launch(seconds: number, duration: number, camera: THREE.Camera, from: [number, number], to: [number, number]): void {
    const at = ([x, y]: [number, number], out: THREE.Vector3) => {
      const ray = out.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
      return ray.multiplyScalar(STREAK_DISTANCE).add(camera.position);
    };
    at(from, this.start);
    at(to, this.end);
    this.born = seconds;
    this.duration = duration;
    this.mesh.visible = true;
  }

  update(seconds: number, camera: THREE.Camera): void {
    if (!this.mesh.visible) return;
    const t = (seconds - this.born) / this.duration;
    if (t >= 1 || t < 0) {
      this.mesh.visible = false;
      return;
    }
    this.head.lerpVectors(this.start, this.end, t);
    this.dir.subVectors(this.end, this.start).normalize();
    this.toCamera.subVectors(camera.position, this.head);
    this.side.crossVectors(this.dir, this.toCamera).normalize().multiplyScalar(this.width / 2);
    // The tail grows in behind the head as it sets off.
    const length = this.length * Math.min(t * 5, 1);
    const position = this.mesh.geometry.attributes.position;
    const tail = this.head.clone().addScaledVector(this.dir, -length);
    const lead = this.head.clone().addScaledVector(this.dir, this.width / 2);
    position.setXYZ(0, tail.x - this.side.x, tail.y - this.side.y, tail.z - this.side.z);
    position.setXYZ(1, tail.x + this.side.x, tail.y + this.side.y, tail.z + this.side.z);
    position.setXYZ(2, lead.x - this.side.x, lead.y - this.side.y, lead.z - this.side.z);
    position.setXYZ(3, lead.x + this.side.x, lead.y + this.side.y, lead.z + this.side.z);
    position.needsUpdate = true;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(t * 8, 1) * Math.min((1 - t) * 5, 1);
  }
}

let sharedStreak: THREE.CanvasTexture | null = null;

/** A tail fading in from nothing to a bright round head at the far end (u = 1). */
function streakTexture(): THREE.CanvasTexture {
  if (sharedStreak) return sharedStreak;
  const [w, h] = [256, 64];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  // The tail narrows toward its end, so a soft wedge rather than a bar.
  const fade = ctx.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(255, 255, 255, 0)');
  fade.addColorStop(0.75, 'rgba(255, 255, 255, 0.55)');
  fade.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
  ctx.fillStyle = fade;
  ctx.filter = 'blur(3px)';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w - h / 2, h * 0.18);
  ctx.lineTo(w - h / 2, h * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  const glow = ctx.createRadialGradient(w - h / 2, h / 2, 0, w - h / 2, h / 2, h / 2);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.4, 'rgba(255, 255, 255, 0.9)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(w - h, 0, h, h);
  sharedStreak = new THREE.CanvasTexture(c);
  sharedStreak.colorSpace = THREE.SRGBColorSpace;
  return sharedStreak;
}

/** A faint glowing line that fades out on the side nearest the camera, where it would loom over the corners of the screen. */
function orbitMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uCenter: { value: new THREE.Vector3() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform vec3 uCenter;
      varying float vFar;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Positive past the middle of the ring, as seen from the camera.
        vec2 toCamera = normalize(cameraPosition.xz - uCenter.xz);
        vFar = -dot(world.xz - uCenter.xz, toCamera);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      varying float vFar;
      void main() {
        gl_FragColor = vec4(0.77, 0.82, 1.0, 0.42 * smoothstep(-3.0, 3.0, vFar));
      }`,
  });
}

/** A little storybook satellite: a gold body between two blue panels, on a short boom. */
function makeSatellite(): THREE.Group {
  const g = new THREE.Group();
  const add = (geom: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.5, 0.42, 0.42), 0xe9c46a);
  add(new THREE.BoxGeometry(1.5, 0.05, 0.05), 0xc9cee0);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.62, 0.035, 0.44), 0x4f7fe8, side * 0.86);
    add(new THREE.BoxGeometry(0.03, 0.04, 0.44), 0xa9c0f5, side * 0.86);
  }
  add(new THREE.ConeGeometry(0.16, 0.2, 14), 0xeef0f7, 0, 0.3);
  return g;
}

/** Starfall's surroundings: the home world below you on the ground floor, the moon that pulls you up above you on the ceiling. */
export class StarfallScenery implements Scenery {
  readonly group = new THREE.Group();
  private world: THREE.Mesh;
  private clouds: THREE.Mesh;
  private moon: THREE.Mesh;
  private comet = new Streak(COMET_LENGTH, COMET_WIDTH, 0xdcecff);
  private nextComet = 0;
  private shooting = [0, 1, 2].map(() => new Streak(SHOOTING_LENGTH, SHOOTING_WIDTH, 0xffffff));
  private nextShooting = 0;
  private orbit: THREE.Mesh;
  private orbitRadius = 16;
  private satellite = makeSatellite();
  private ready = false;

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
    this.orbit = new THREE.Mesh(new THREE.BufferGeometry(), orbitMaterial());
    this.orbit.rotation.x = Math.PI / 2;
    this.orbit.position.y = ORBIT_Y;
    this.group.add(this.world, this.clouds, this.moon, air, shine, this.orbit, this.satellite, this.comet.mesh, ...this.shooting.map((s) => s.mesh));
  }

  place(center: THREE.Vector3, viewSize: number, _tiles: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
    (this.orbit.material as THREE.ShaderMaterial).uniforms.uCenter.value.copy(center);
    this.orbitRadius = viewSize / 2 + ORBIT_MARGIN;
    this.orbit.geometry.dispose();
    this.orbit.geometry = new THREE.TorusGeometry(this.orbitRadius, ORBIT_TUBE, 6, 160);
    // A first comet soon after arriving, then one every so often. Falling stars stay where they were.
    this.ready = false;
  }

  update(seconds: number, _dt: number, _canvasHeight: number, camera: THREE.Camera): void {
    this.world.rotation.y = seconds * WORLD_TURN;
    this.clouds.rotation.y = seconds * CLOUD_TURN;
    this.moon.rotation.y = seconds * MOON_TURN;

    const a = (seconds * SATELLITE_SPEED) / this.orbitRadius;
    this.satellite.position.set(Math.cos(a) * this.orbitRadius, ORBIT_Y, Math.sin(a) * this.orbitRadius);
    this.satellite.rotation.y = -a;
    // It shrinks away on the side nearest the camera, where it would loom over the corners of the screen.
    const toCameraX = camera.position.x - this.group.position.x;
    const toCameraZ = camera.position.z - this.group.position.z;
    const far = -(this.satellite.position.x * toCameraX + this.satellite.position.z * toCameraZ) / Math.hypot(toCameraX, toCameraZ);
    this.satellite.scale.setScalar(Math.max(THREE.MathUtils.smoothstep(far, -3, 3), 0.001));

    if (!this.ready) {
      this.ready = true;
      this.nextComet = seconds + 6;
      this.nextShooting = seconds + 2;
    }
    if (seconds >= this.nextComet) {
      this.nextComet = seconds + COMET_GAP[0] + Math.random() * (COMET_GAP[1] - COMET_GAP[0]);
      // Across the open sky above the planet's edge, from either side, sinking behind it.
      const side = Math.random() < 0.5 ? 1 : -1;
      this.comet.launch(seconds, COMET_SECONDS, camera, [side * 1.2, 0.92], [side * -0.75, 0.42]);
    }
    if (seconds >= this.nextShooting) {
      this.nextShooting = seconds + SHOOTING_GAP[0] + Math.random() * (SHOOTING_GAP[1] - SHOOTING_GAP[0]);
      const free = this.shooting.find((s) => !s.mesh.visible);
      if (free) {
        const [x, side] = [Math.random() * 1.6 - 0.8, Math.random() < 0.5 ? 1 : -1];
        const y = 0.72 + Math.random() * 0.24;
        free.launch(seconds, SHOOTING_SECONDS, camera, [x, y], [x + side * 0.3, y - 0.2]);
      }
    }
    this.comet.update(seconds, camera);
    for (const s of this.shooting) s.update(seconds, camera);
  }
}
