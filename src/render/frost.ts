import * as THREE from 'three';
import { FrostRidge } from './ridge';
import { Scenery, SceneryTiles, canvas, cloudTexture, intoTheSky, seeded, softDot } from './scenery';

/** The rose-lilac haze everything far below sinks into. */
const HAZE = 0xe3cde3;
const ROCK = 0x6c6ca8;
const SNOW_CAP = 0xf6e4e6;
const CLOUD = 0xfff0ea;

/** Summits: how many, how far out, and where they stand. Their tops stop far under the board. */
const SUMMITS = 126;
const SUMMIT_SHAPES = 3;
const FIELD_RADIUS = 175;
const SUMMIT_BASE = -66;
const SUMMIT_TOP_NEAR = -40;
const SUMMIT_TOP_FAR = -24;
const CLOUD_LEVELS = [-56, -51];

/** Motion, kept apart so it can be turned down. If it runs slowly, cut spindrift, then cloud, then flakes, with reindeer and sparkles last. */
const SPINDRIFT = 8;
const CLOUD_SPEED = 0.0035;
const FLAKES = 18;
const SPARKLES = 10;

const SPARKLE_MS = 0.9;
const VEIL_SECONDS = 11;

interface Sparkle {
  sprite: THREE.Sprite;
  /** When its next twinkle begins, in seconds. */
  at: number;
}

interface Veil {
  sprite: THREE.Sprite;
  home: THREE.Vector3;
  phase: number;
}

/** Frost Isle's surroundings: soft snow-capped ridges in a sea of cloud, reindeer on a long ridge behind the board, flakes, sparkles and spindrift. */
export class FrostScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = {
    uHeight: { value: 1 },
    uHaze: { value: new THREE.Color(HAZE) },
    uRock: { value: new THREE.Color(ROCK) },
    uSnow: { value: new THREE.Color(SNOW_CAP) },
  };
  private clouds: THREE.CanvasTexture[] = [];
  private flakes: THREE.Points;
  private flakeDrift: { phase: number; speed: number }[] = [];
  private sparkles: Sparkle[] = [];
  private veils: Veil[] = [];
  private ice: { x: number; z: number }[] = [];
  private spread = 6;
  private seconds = 0;
  readonly ridge: FrostRidge;

  constructor() {
    this.group.add(this.makeHazeFloor(), ...this.makeSummits(), ...this.makeClouds());
    this.flakes = this.makeFlakes();
    this.group.add(this.flakes);
    this.makeSparkles();
    this.ridge = new FrostRidge(this.uniforms);
    this.group.add(this.ridge.group);
  }

  place(center: THREE.Vector3, viewSize: number, { ice }: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.7;
    this.ridge.place(center, viewSize);
    this.ice = ice.map((c) => ({ x: c.x - center.x, z: c.z - center.z }));
    // Sparkles wait for the island to finish rising.
    this.sparkles.forEach((s, i) => {
      s.sprite.visible = false;
      s.at = this.seconds + 1.4 + i * 0.5;
    });
    const pos = this.flakes.geometry.attributes.position;
    const rnd = seeded(9);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (rnd() * 2 - 1) * this.spread * 1.3, rnd() * 14 - 6, (rnd() * 2 - 1) * this.spread * 1.3);
    }
    pos.needsUpdate = true;
  }

  update(seconds: number, dt: number, canvasHeight: number): void {
    this.seconds = seconds;
    this.uniforms.uHeight.value = canvasHeight;
    this.ridge.update(seconds);

    // Two layers crossing slowly in different directions, so the cloud seems to churn.
    this.clouds.forEach((tex, i) => {
      tex.offset.x = seconds * CLOUD_SPEED * (i ? 1 : -0.7);
      tex.offset.y = seconds * CLOUD_SPEED * (i ? 0.4 : 0.6);
    });

    const pos = this.flakes.geometry.attributes.position;
    const edge = this.spread * 1.3;
    for (let i = 0; i < pos.count; i++) {
      const { phase, speed } = this.flakeDrift[i];
      let y = pos.getY(i) - speed * dt;
      let x = pos.getX(i) + (0.12 + Math.sin(seconds * 0.5 + phase) * 0.28) * dt;
      const z = pos.getZ(i) + Math.cos(seconds * 0.4 + phase) * 0.18 * dt;
      if (y < -6) y = 8;
      if (x > edge) x = -edge;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;

    for (const s of this.sparkles) {
      const t = (seconds - s.at) / SPARKLE_MS;
      if (t < 0 || !this.ice.length) continue;
      if (t >= 1) {
        s.sprite.visible = false;
        s.at = seconds + 0.6 + Math.random() * 3.5;
        const cell = this.ice[Math.floor(Math.random() * this.ice.length)];
        s.sprite.position.set(cell.x + (Math.random() - 0.5) * 0.7, 0.08, cell.z + (Math.random() - 0.5) * 0.7);
        continue;
      }
      s.sprite.visible = s.sprite.position.lengthSq() > 0;
      const size = Math.sin(t * Math.PI) * 0.34;
      s.sprite.scale.setScalar(Math.max(size, 0.001));
      s.sprite.material.rotation = t * 0.8;
    }

    for (const v of this.veils) {
      const t = ((seconds / VEIL_SECONDS + v.phase) % 1 + 1) % 1;
      v.sprite.position.set(v.home.x + t * 14, v.home.y + t * 1.5, v.home.z);
      v.sprite.material.opacity = Math.sin(t * Math.PI) * 0.5;
    }
  }

  /** Far below everything, so a gap in the cloud shows haze and never the page behind. */
  private makeHazeFloor(): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ color: 0xbba6cd, transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.2, 0.88)}`);
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FIELD_RADIUS * 1.2, 48), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = SUMMIT_BASE - 2;
    floor.renderOrder = -6;
    floor.frustumCulled = false;
    return floor;
  }

  /** Instanced ridges, with a depth-only pass first so the fade into the sky never shows one through another. */
  private makeSummits(): THREE.Object3D[] {
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
    depthOnly.polygonOffset = true;
    depthOnly.polygonOffsetFactor = 1;
    depthOnly.polygonOffsetUnits = 1;

    const mat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;\nuniform vec3 uRock;\nuniform vec3 uSnow;\nvarying vec3 vLocal;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // A snow line with a ragged edge, lower on some sides than others.
          float line = 0.66 + 0.05 * sin(vLocal.x * 17.0) * sin(vLocal.z * 15.0) + 0.04 * sin(vLocal.x * 5.0 + vLocal.z * 6.0);
          diffuseColor.rgb = mix(uRock, uSnow, smoothstep(line - 0.015, line + 0.03, vLocal.y));`,
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          // The lower slopes sink into the haze, whatever the distance.
          gl_FragColor.rgb = mix(uHaze, gl_FragColor.rgb, smoothstep(0.1, 0.5, vLocal.y) * 0.7 + 0.3);
          ${intoTheSky(0.18, 0.85)}`,
        );
    };

    const rnd = seeded(23);
    const meshes = Array.from({ length: SUMMIT_SHAPES }, (_, shape) => {
      const count = Math.floor(SUMMITS / SUMMIT_SHAPES);
      return new THREE.InstancedMesh(ridgeGeometry(shape), mat, count);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const count = meshes[0].count * SUMMIT_SHAPES;
    for (let i = 0; i < count; i++) {
      // None directly under the board's middle, where they'd sit behind the gaps at their largest.
      const r = 14 + (FIELD_RADIUS - 14) * ((i + 0.5) / count) ** 0.72;
      const a = i * GOLDEN;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      const reach = (r - 14) / (FIELD_RADIUS - 14);
      const top = THREE.MathUtils.lerp(SUMMIT_TOP_NEAR, SUMMIT_TOP_FAR, reach) - rnd() * 8;
      const width = 30 + rnd() * 16 + reach * 34;
      m.compose(
        new THREE.Vector3(x, SUMMIT_BASE, z),
        q.setFromAxisAngle(up, rnd() * 6.28),
        new THREE.Vector3(width, top - SUMMIT_BASE, width * (0.65 + rnd() * 0.5)),
      );
      meshes[i % SUMMIT_SHAPES].setMatrixAt(Math.floor(i / SUMMIT_SHAPES), m);
      // Spindrift blows off some of the middle-distance summits.
      if (this.veils.length < SPINDRIFT && reach > 0.15 && reach < 0.6 && i % 7 === 0) {
        this.addVeil(new THREE.Vector3(x, top + 1, z));
      }
    }
    const parts: THREE.Object3D[] = this.veils.map((v) => v.sprite);
    for (const mesh of meshes) {
      const depth = new THREE.InstancedMesh(mesh.geometry, depthOnly, mesh.count);
      depth.instanceMatrix = mesh.instanceMatrix;
      mesh.frustumCulled = depth.frustumCulled = false;
      depth.renderOrder = -5;
      mesh.renderOrder = -4;
      parts.push(depth, mesh);
    }
    return parts;
  }

  /** Two slowly crossing sheets of soft cloud that the summits poke through. */
  private makeClouds(): THREE.Mesh[] {
    return CLOUD_LEVELS.map((y, i) => {
      const tex = cloudTexture(31 + i * 13);
      tex.repeat.set(i ? 3.2 : 2.4, i ? 3.2 : 2.4);
      this.clouds.push(tex);
      const mat = new THREE.MeshBasicMaterial({ color: CLOUD, map: tex, transparent: true, depthWrite: false, opacity: i ? 0.6 : 0.85 });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
          .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.18, 0.8)}`);
      };
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_RADIUS * 2.6, FIELD_RADIUS * 2.6), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      plane.renderOrder = -3 + i * 0.5;
      plane.frustumCulled = false;
      return plane;
    });
  }

  private addVeil(home: THREE.Vector3): void {
    const mat = new THREE.SpriteMaterial({ map: veilTexture(), transparent: true, opacity: 0, depthWrite: false, color: 0xfff6f0 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(15, 3, 1);
    sprite.renderOrder = -2;
    this.veils.push({ sprite, home, phase: this.veils.length / SPINDRIFT });
  }

  private makeFlakes(): THREE.Points {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLAKES * 3), 3));
    const rnd = seeded(7);
    for (let i = 0; i < FLAKES; i++) this.flakeDrift.push({ phase: rnd() * 6.28, speed: 0.38 + rnd() * 0.3 });
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ color: 0xffffff, map: softDot(), size: 0.55, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    points.frustumCulled = false;
    return points;
  }

  private makeSparkles(): void {
    const map = starTexture();
    for (let i = 0; i < SPARKLES; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, color: 0xffffff }));
      sprite.visible = false;
      this.group.add(sprite);
      this.sparkles.push({ sprite, at: 0 });
    }
  }
}

/** A soft ridge about one unit wide and high: rounded at the top, with spurs running down it. */
function ridgeGeometry(shape: number): THREE.BufferGeometry {
  const SEGMENTS = 48;
  const RINGS = 14;
  const positions: number[] = [];
  const index: number[] = [];
  for (let ring = 0; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const a = (seg / SEGMENTS) * Math.PI * 2;
      // Spurs widen the footprint and fade toward the summit, so the top stays soft and rounded.
      const spur = 0.26 * Math.sin(a * (3 + shape) + shape * 1.7) + 0.12 * Math.sin(a * (7 + shape * 2) + shape);
      const radius = 0.5 * t * (1 + spur * t);
      // Broad shoulders rising to a rounded top: soft, but still plainly a mountain.
      // Only the broad spurs lift the slopes: finer ones would pleat them like an umbrella.
      const lift = 0.05 * Math.sin(a * (3 + shape) + shape * 1.7);
      const height = (1 - t ** 1.25) ** 1.2 * (1 + lift * Math.sin(t * Math.PI));
      positions.push(Math.cos(a) * radius, height, Math.sin(a) * radius);
    }
  }
  const row = SEGMENTS + 1;
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const [a, b, c, d] = [ring * row + seg, ring * row + seg + 1, (ring + 1) * row + seg, (ring + 1) * row + seg + 1];
      index.push(a, b, c, b, d, c);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  return geom;
}

/** A long, faded streak: a veil of snow blown off a summit. */
let sharedVeil: THREE.CanvasTexture | null = null;
function veilTexture(): THREE.CanvasTexture {
  if (sharedVeil) return sharedVeil;
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.translate(size / 2, size / 2);
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  streak.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  sharedVeil = new THREE.CanvasTexture(c);
  return sharedVeil;
}

/** A thin four-pointed crystal glint. */
function starTexture(): THREE.CanvasTexture {
  const size = 64;
  const [c, ctx] = canvas(size);
  const mid = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 3 : mid;
    const a = (i / 8) * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](mid + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return new THREE.CanvasTexture(c);
}
