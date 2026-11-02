import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Scenery, intoTheSky, seeded } from './scenery';

/** The haze the treetops fade into, close to the page's sky gradient just above them. */
const HAZE = 0xcfe8dc;
/** Pale blue-greens: rich moss on the board has to stand out against these. */
const CANOPY_COLORS = [0xa3cdac, 0xb2d6b2, 0x94c2a1, 0xc0dfbb];
const LEAF_COLORS = [0xa8c95a, 0xc9c65a, 0x8fbd55];

/** Treetops: how many, how far out, and how far down. Far below, they read as a forest rather than as boulders. */
const TREES = 1100;
const NEAR_TREES = 220;
const CANOPY_RADIUS = 135;
const CANOPY_TOP = -24;

/** Motion, kept apart so it can be turned down. If it runs slowly, cut sway, then leaves, then cloud shadows, then pollen. */
const SWAY = 0.06;
const CLOUD_SHADE = 0.16;
const LEAVES = 3;
const POLLEN = 80;

/** The shade in the gaps between crowns. */
const FOREST_DEPTHS = 0x86b394;

const INTO_THE_SKY = intoTheSky(0.3, 0.92);

interface Leaf {
  mesh: THREE.Mesh;
  phase: number;
  fall: number;
}

/**
 * First Glade's surroundings: a sea of treetops below the board, leaves and pollen around it.
 * The big clouds are behind the canvas, in the page (`#sky`), so they hold still when the view turns.
 */
export class ForestScenery implements Scenery {
  readonly group = new THREE.Group();
  private uniforms = {
    uTime: { value: 0 },
    uHeight: { value: 1 },
    uSway: { value: SWAY },
    uShade: { value: CLOUD_SHADE },
    uHaze: { value: new THREE.Color(HAZE) },
  };
  private leaves: Leaf[] = [];
  private pollen: THREE.Points;
  private drift: { phase: number; speed: number }[] = [];
  /** Half the width of the board, which the leaves and pollen keep around. */
  private spread = 6;

  constructor() {
    this.group.add(...this.makeCanopy());
    this.makeLeaves();
    this.pollen = this.makePollen();
    this.group.add(this.pollen);
  }

  /** Center the scenery on a level. */
  place(center: THREE.Vector3, viewSize: number): void {
    this.group.position.set(center.x, 0, center.z);
    this.spread = viewSize * 0.65;
    this.leaves.forEach((leaf, i) => this.dropLeaf(leaf, 9 - (i / this.leaves.length) * 13));
    const pos = this.pollen.geometry.attributes.position;
    const rnd = seeded(5);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, (rnd() * 2 - 1) * this.spread * 1.3, rnd() * 6 - 1, (rnd() * 2 - 1) * this.spread * 1.3);
    }
    pos.needsUpdate = true;
  }

  update(seconds: number, dt: number, canvasHeight: number): void {
    this.uniforms.uTime.value = seconds;
    this.uniforms.uHeight.value = canvasHeight;

    for (const leaf of this.leaves) {
      const m = leaf.mesh;
      m.position.y -= leaf.fall * dt;
      m.position.x += (0.18 + Math.sin(seconds * 0.7 + leaf.phase) * 0.5) * dt;
      m.position.z += Math.cos(seconds * 0.5 + leaf.phase) * 0.3 * dt;
      m.rotation.x = Math.sin(seconds * 0.9 + leaf.phase) * 0.9;
      m.rotation.z += dt * 0.5;
      if (m.position.y < -5) this.dropLeaf(leaf, 9);
    }

    const pos = this.pollen.geometry.attributes.position;
    const edge = this.spread * 1.3;
    for (let i = 0; i < pos.count; i++) {
      const { phase, speed } = this.drift[i];
      let x = pos.getX(i) + Math.sin(seconds * 0.2 + phase) * speed * dt;
      let y = pos.getY(i) + Math.cos(seconds * 0.17 + phase) * speed * 0.5 * dt + 0.02 * dt;
      if (Math.abs(x) > edge) x = -Math.sign(x) * edge;
      if (y > 5) y = -1;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }

  private dropLeaf(leaf: Leaf, y: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * this.spread;
    leaf.mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  /**
   * One instanced crown per treetop. Sway, cloud shadows and haze all run in the shader, so motion costs
   * little. A depth-only pass goes first, so each pixel of the fade into the sky shows exactly one crown.
   */
  private makeCanopy(): THREE.Object3D[] {
    const sway = (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec2 vGround;\nvarying float vLift;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec2 root = instanceMatrix[3].xz;
          float phase = root.x * 0.31 + root.y * 0.23;
          // Only the crown moves: the sway grows with height.
          transformed.xz += vec2(sin(uTime * 0.55 + phase), cos(uTime * 0.43 + phase * 1.3)) * uSway * position.y;
          vGround = root;
          vLift = position.y;`,
        );
    };

    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
    depthOnly.polygonOffset = true;
    depthOnly.polygonOffsetFactor = 1;
    depthOnly.polygonOffsetUnits = 1;
    depthOnly.onBeforeCompile = sway;

    const mat = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      sway(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uHeight;\nuniform float uShade;\nuniform vec3 uHaze;\nvarying vec2 vGround;\nvarying float vLift;',
        )
        .replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
          // Shaded where crowns meet, sunlit on top: this is what makes them read as soft and round.
          gl_FragColor.rgb *= mix(0.62, 1.08, smoothstep(0.0, 0.85, vLift));
          // Slow patches of shade, as if big clouds were passing overhead.
          float passing = 0.5 + 0.5 * sin(vGround.x * 0.09 + uTime * 0.05) * sin(vGround.y * 0.11 - uTime * 0.04 + 1.7);
          gl_FragColor.rgb *= 1.0 - uShade * smoothstep(0.35, 0.8, passing);
          ${INTO_THE_SKY}`,
        );
    };

    // The forest floor's shade, seen in any gap between crowns, so the sky never shows through from below.
    const floorMat = new THREE.MeshBasicMaterial({ color: FOREST_DEPTHS, transparent: true, depthWrite: false });
    floorMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHeight;\nuniform vec3 uHaze;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${INTO_THE_SKY}`);
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(CANOPY_RADIUS * 1.2, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CANOPY_TOP - 12;
    floor.renderOrder = -3;
    floor.frustumCulled = false;

    // Crowns close under the board fill much of the screen, so they get finer shapes than distant ones.
    const near = new THREE.InstancedMesh(crownGeometry(16, 5), mat, NEAR_TREES);
    const far = new THREE.InstancedMesh(crownGeometry(9, 3), mat, TREES - NEAR_TREES);
    const rnd = seeded(11);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < TREES; i++) {
      // Packed under the board and sparser, but larger, toward the distance where each is only a few pixels.
      const r = CANOPY_RADIUS * ((i + 0.5) / TREES) ** 0.62;
      const a = i * GOLDEN;
      const [x, z] = [Math.cos(a) * r + (rnd() - 0.5) * 2, Math.sin(a) * r + (rnd() - 0.5) * 2];
      const size = (2.6 + rnd() * 1.6) * (1 + r * 0.012);
      const rise = size * (0.8 + rnd() * 0.3);
      // A slow roll in the height, so it looks like a forest over hills and not a flat carpet.
      const roll = Math.sin(x * 0.07 + 1) * Math.cos(z * 0.06) * 4;
      m.compose(new THREE.Vector3(x, CANOPY_TOP - rise - 4 + roll - rnd() * 2.5, z), q.setFromAxisAngle(UP, rnd() * 6.28), new THREE.Vector3(size, rise, size));
      const [crowns, slot] = i < NEAR_TREES ? [near, i] : [far, i - NEAR_TREES];
      crowns.setMatrixAt(slot, m);
      crowns.setColorAt(slot, color.set(CANOPY_COLORS[Math.floor(rnd() * CANOPY_COLORS.length)]));
    }
    const parts: THREE.Object3D[] = [floor];
    for (const crowns of [near, far]) {
      const depth = new THREE.InstancedMesh(crowns.geometry, depthOnly, crowns.count);
      depth.instanceMatrix = crowns.instanceMatrix;
      // Seen from every side and faded by screen position, so it's never fully off screen.
      crowns.frustumCulled = depth.frustumCulled = false;
      // First among the see-through things, so a retracted bridge's ghost shows the treetops behind it.
      depth.renderOrder = -2;
      crowns.renderOrder = -1;
      parts.push(depth, crowns);
    }
    return parts;
  }

  private makeLeaves(): void {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.bezierCurveTo(0.42, -0.2, 0.34, 0.25, 0, 0.5);
    shape.bezierCurveTo(-0.34, 0.25, -0.42, -0.2, 0, -0.5);
    const geom = new THREE.ShapeGeometry(shape, 6);
    for (let i = 0; i < LEAVES; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: LEAF_COLORS[i % LEAF_COLORS.length], side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.scale.setScalar(0.3);
      mesh.rotation.y = i * 2;
      this.group.add(mesh);
      this.leaves.push({ mesh, phase: i * 2.1, fall: 0.5 + i * 0.09 });
    }
  }

  private makePollen(): THREE.Points {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(POLLEN * 3), 3));
    const rnd = seeded(3);
    for (let i = 0; i < POLLEN; i++) this.drift.push({ phase: rnd() * 6.28, speed: 0.1 + rnd() * 0.2 });
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    const points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        color: 0xfff3b8,
        map: new THREE.CanvasTexture(canvas),
        size: 0.16,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    return points;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** A rounded treetop: a tall central dome with lower lobes around it, about one unit high. */
function crownGeometry(segments: number, rings: number): THREE.BufferGeometry {
  const lobe = (radius: number, x: number, z: number, height: number) => {
    const dome = new THREE.SphereGeometry(radius, segments, rings, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, height / radius, 1);
    dome.translate(x, 0, z);
    return dome;
  };
  return mergeGeometries([lobe(0.62, 0, 0, 1), lobe(0.5, 0.55, 0.1, 0.72), lobe(0.46, -0.32, 0.5, 0.66), lobe(0.48, -0.25, -0.5, 0.7)])!;
}
