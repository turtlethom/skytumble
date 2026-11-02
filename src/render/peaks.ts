import * as THREE from 'three';
import { Scenery, SceneryTiles, cloudTexture, intoTheSky, seeded, softDot } from './scenery';

/** The bright pale haze everything far below sinks into: it's what keeps this world of grey stone from feeling heavy. */
const HAZE = 0xe2e7ea;
const ROCK_LIGHT = 0xa9adb3;
const ROCK_DARK = 0x6a6f77;
const CLOUD = 0xffffff;
const BANNER_COLORS = [0xc4503c, 0xf6f2e8, 0x3f78ab];

/** Spires: how many, how far out, and where they stand. Their tops stop far under the board. */
const SPIRES = 150;
const SPIRE_SHAPES = 3;
const FIELD_RADIUS = 165;
const SPIRE_BASE = -95;
const SPIRE_TOP_NEAR = -40;
const SPIRE_TOP_FAR = -24;
const CLOUD_LEVELS = [-62, -50];

/** Motion, kept apart so it can be turned down. If it runs slowly, cut grit, then banners, then depth clouds, then gusts. */
const GRIT = 90;
const BANNERS = 10;
const CLOUD_SPEED = 0.04;
const GUSTS = 12;
const GUST_SECONDS = 1.7;
/** A gust fades out this close to a pad, so it can't be mistaken for that pad's own wind streaks. */
const PAD_CLEARANCE = 1.3;
/** The wind blows this way in the world, along +x. */
const WIND = 1.5;

interface Gust {
  mesh: THREE.Mesh;
  /** When its next pass begins, in seconds. */
  at: number;
  z: number;
  y: number;
  from: number;
  length: number;
}

/** Windy Peaks' surroundings: weathered grey spires in pale haze, racing cloud below, gusts, banners and grit. */
export class PeaksScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = {
    uTime: { value: 0 },
    uHeight: { value: 1 },
    uHaze: { value: new THREE.Color(HAZE) },
    uLight: { value: new THREE.Color(ROCK_LIGHT) },
    uDark: { value: new THREE.Color(ROCK_DARK) },
  };
  private clouds: THREE.CanvasTexture[] = [];
  private grit: THREE.Points;
  private gritDrift: { phase: number; speed: number }[] = [];
  private gusts: Gust[] = [];
  private pads: { x: number; z: number }[] = [];
  private spread = 6;

  constructor() {
    this.group.add(this.makeHazeFloor(), ...this.makeSpires(), ...this.makeClouds());
    this.grit = this.makeGrit();
    this.group.add(this.grit);
    this.makeGusts();
  }

  place(center: THREE.Vector3, viewSize: number, { pads }: SceneryTiles): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.7;
    this.pads = pads.map((c) => ({ x: c.x - center.x, z: c.z - center.z }));
    const pos = this.grit.geometry.attributes.position;
    const rnd = seeded(17);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (rnd() * 2 - 1) * this.spread * 1.4, rnd() * 7 - 1.5, (rnd() * 2 - 1) * this.spread * 1.4);
    }
    pos.needsUpdate = true;
    this.gusts.forEach((g, i) => {
      g.mesh.visible = false;
      g.at = this.uniforms.uTime.value + 1.4 + i * 0.3;
    });
  }

  update(seconds: number, dt: number, canvasHeight: number): void {
    this.uniforms.uTime.value = seconds;
    this.uniforms.uHeight.value = canvasHeight;

    // Racing along the wind, the nearer sheet faster.
    this.clouds.forEach((tex, i) => {
      tex.offset.x = -seconds * CLOUD_SPEED * (i ? 1.4 : 1);
    });

    const pos = this.grit.geometry.attributes.position;
    const edge = this.spread * 1.4;
    for (let i = 0; i < pos.count; i++) {
      const { phase, speed } = this.gritDrift[i];
      let x = pos.getX(i) + speed * WIND * dt;
      const y = pos.getY(i) + Math.sin(seconds * 0.6 + phase) * 0.12 * dt;
      if (x > edge) x = -edge;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;

    for (const g of this.gusts) {
      const t = (seconds - g.at) / GUST_SECONDS;
      if (t < 0) continue;
      if (t >= 1) {
        g.mesh.visible = false;
        g.at = seconds + 0.2 + Math.random() * 1.5;
        g.z = (Math.random() * 2 - 1) * this.spread * 1.3;
        g.y = 0.4 + Math.random() * 2.4;
        g.from = -this.spread * 1.4 - Math.random() * 3;
        g.length = 3 + Math.random() * 4.5;
        continue;
      }
      const x = g.from + t * (this.spread * 2.8 + 6);
      g.mesh.visible = true;
      g.mesh.position.set(x, g.y, g.z);
      g.mesh.scale.x = g.length;
      const clear = this.padDistance(x, g.z, g.length / 2);
      const fade = THREE.MathUtils.smoothstep(clear, PAD_CLEARANCE * 0.6, PAD_CLEARANCE);
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(t * Math.PI) * 0.9 * fade;
    }
  }

  /** How far the streak's nearest point is from any pad, measured on the ground. */
  private padDistance(x: number, z: number, half: number): number {
    let best = Infinity;
    for (const p of this.pads) {
      const dx = Math.max(Math.abs(p.x - x) - half, 0);
      best = Math.min(best, Math.hypot(dx, p.z - z));
    }
    return best;
  }

  private makeHazeFloor(): THREE.Mesh {
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfc5cb, transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.3, 0.92)}`);
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FIELD_RADIUS * 1.25, 48), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -70;
    floor.renderOrder = -6;
    floor.frustumCulled = false;
    return floor;
  }

  /** Instanced pillars, with a depth-only pass first so the fade into the sky never shows one through another. */
  private makeSpires(): THREE.Object3D[] {
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
          '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;\nuniform vec3 uLight;\nuniform vec3 uDark;\nvarying vec3 vLocal;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Layers of rock: soft bands of two widths, slightly tilted so they don't look ruled.
          float strata = vLocal.y * 34.0 + vLocal.x * 2.5;
          float bands = 0.5 + 0.3 * sin(strata) + 0.2 * sin(strata * 2.7 + 1.3);
          diffuseColor.rgb = mix(uDark, uLight, smoothstep(0.25, 0.75, bands));`,
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          // Down a pillar is into the depths: only the tops stand clear of the haze.
          gl_FragColor.rgb = mix(uHaze, gl_FragColor.rgb, smoothstep(0.5, 0.92, vLocal.y) * 0.8 + 0.2);
          ${intoTheSky(0.06, 0.86)}`,
        );
    };

    const rnd = seeded(29);
    const perShape = Math.floor(SPIRES / SPIRE_SHAPES);
    const meshes = Array.from({ length: SPIRE_SHAPES }, (_, shape) => new THREE.InstancedMesh(spireGeometry(shape), mat, perShape));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const count = perShape * SPIRE_SHAPES;
    const bannerTops: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      // None directly under the board's middle, where a pillar would sit behind the gaps at its largest.
      const r = 12 + (FIELD_RADIUS - 12) * ((i + 0.5) / count) ** 0.7;
      const a = i * GOLDEN;
      const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
      const reach = (r - 12) / (FIELD_RADIUS - 12);
      const top = THREE.MathUtils.lerp(SPIRE_TOP_NEAR, SPIRE_TOP_FAR, reach) - rnd() * 9;
      const width = 6 + rnd() * 5 + reach * 11;
      m.compose(
        new THREE.Vector3(x, SPIRE_BASE, z),
        q.setFromAxisAngle(up, rnd() * 6.28),
        new THREE.Vector3(width, top - SPIRE_BASE, width * (0.75 + rnd() * 0.4)),
      );
      meshes[i % SPIRE_SHAPES].setMatrixAt(Math.floor(i / SPIRE_SHAPES), m);
      if (bannerTops.length < BANNERS && reach > 0.32 && reach < 0.72 && i % 3 === 0) bannerTops.push(new THREE.Vector3(x, top, z));
    }
    const parts: THREE.Object3D[] = this.makeBanners(bannerTops);
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

  /** Long pennants on poles atop far spires, streaming along the wind. They ripple in the shader. */
  private makeBanners(tops: THREE.Vector3[]): THREE.Object3D[] {
    const cloth = new THREE.PlaneGeometry(1, 1, 10, 1);
    cloth.translate(0.5, 0, 0);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // Tapers to a point, and the ripple grows toward the free end.
          transformed.y *= 1.0 - position.x * 0.85;
          float ripple = sin(position.x * 9.0 - uTime * 3.0 + instanceMatrix[3].x) * position.x;
          transformed.y += ripple * 0.12;
          transformed.z += ripple * 0.3;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.1, 0.8)}`);
    };
    const banners = new THREE.InstancedMesh(cloth, mat, tops.length);
    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.16, 1, 5);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x8c7660, transparent: true });
    poleMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.1, 0.8)}`);
    };
    const poles = new THREE.InstancedMesh(poleGeometry, poleMat, tops.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    tops.forEach((top, i) => {
      const height = 7;
      m.compose(new THREE.Vector3(top.x, top.y + height / 2 - 0.5, top.z), q, new THREE.Vector3(1, height, 1));
      poles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(top.x, top.y + height - 1.2, top.z), q, new THREE.Vector3(12, 2.8, 1));
      banners.setMatrixAt(i, m);
      banners.setColorAt(i, color.set(BANNER_COLORS[i % BANNER_COLORS.length]));
    });
    banners.frustumCulled = poles.frustumCulled = false;
    banners.renderOrder = poles.renderOrder = -3;
    return [poles, banners];
  }

  /** Two sheets of streaked cloud racing between the spires. */
  private makeClouds(): THREE.Mesh[] {
    return CLOUD_LEVELS.map((y, i) => {
      const tex = cloudTexture(41 + i * 17);
      // Squeezed across the wind, so the puffs stretch out into streaks along it.
      tex.repeat.set(1.3, i ? 6 : 4.5);
      this.clouds.push(tex);
      const mat = new THREE.MeshBasicMaterial({ color: CLOUD, map: tex, transparent: true, depthWrite: false, opacity: i ? 0.55 : 0.8 });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
          .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${intoTheSky(0.2, 0.85)}`);
      };
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_RADIUS * 2.6, FIELD_RADIUS * 2.6), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      plane.renderOrder = -2 + i * 0.5;
      plane.frustumCulled = false;
      return plane;
    });
  }

  private makeGrit(): THREE.Points {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(GRIT * 3), 3));
    const rnd = seeded(13);
    for (let i = 0; i < GRIT; i++) this.gritDrift.push({ phase: rnd() * 6.28, speed: 0.6 + rnd() * 0.9 });
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ color: 0xf2f4f6, map: softDot(), size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    points.frustumCulled = false;
    return points;
  }

  /** Thin flat white streaks tapered at both ends. They fade near pads, so they can't pass for a pad's own wind lines. */
  private makeGusts(): void {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.quadraticCurveTo(0, 0.05, 0.5, 0);
    shape.quadraticCurveTo(0, -0.05, -0.5, 0);
    const geom = new THREE.ShapeGeometry(shape, 8);
    geom.rotateX(-Math.PI / 2);
    for (let i = 0; i < GUSTS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.gusts.push({ mesh, at: 0, z: 0, y: 1, from: -10, length: 3 });
    }
  }
}

/** A weathered pillar, one unit wide and high: ledges and hollows down its length, and a rounded top. */
function spireGeometry(shape: number): THREE.BufferGeometry {
  const SEGMENTS = 14;
  const RINGS = 24;
  const positions: number[] = [];
  const index: number[] = [];
  for (let ring = 0; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    // Only the top rounds off: it closes over the last few rings.
    const cap = t > 0.93 ? Math.sqrt(Math.max(1 - ((t - 0.93) / 0.07) ** 2, 0)) : 1;
    const flare = 1 + (1 - t) ** 2 * 0.5;
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const a = (seg / SEGMENTS) * Math.PI * 2;
      const lobes = 0.13 * Math.sin(a * (2 + shape) + shape * 2 + t * 3) + 0.06 * Math.sin(a * 5 + t * 8);
      const ledges = 0.1 * Math.sin(t * (17 + shape * 3) + shape) + 0.06 * Math.sin(t * 41 + a);
      const radius = 0.5 * flare * cap * (1 + lobes + ledges);
      positions.push(Math.cos(a) * radius, t, Math.sin(a) * radius);
    }
  }
  const row = SEGMENTS + 1;
  for (let ring = 0; ring < RINGS; ring++) {
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const [a, b, c, d] = [ring * row + seg, ring * row + seg + 1, (ring + 1) * row + seg, (ring + 1) * row + seg + 1];
      index.push(a, c, b, b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  return geom;
}
