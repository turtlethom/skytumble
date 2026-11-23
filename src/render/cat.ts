import * as THREE from 'three';

/**
 * Splatter Studio's cat (look session 2026-11-20: the world's mascot, capped at four tries, then a
 * simpler blocky cat). A black-and-white tuxedo cat lying in a loaf, head up, tail wrapped round its side:
 * black and white keeps it clear of every paint and switch color. Try 3 (2026-11-22, "softer, rounder"):
 * the body is one smooth loaf with a fuller rump and thighs, instead of an egg; smooth flattened ears; a
 * tapered tail lying along the body with a white tip; a white blaze up the face and bigger eyes, so the
 * face reads from the board. Its tail tip flicks, its head turns slowly to look about, an ear twitches
 * now and then, and it breathes. Built at about 6 units long, facing +x; the caller scales it.
 */
export class StudioCat {
  readonly group = new THREE.Group();
  private head = new THREE.Group();
  private ears: THREE.Object3D[] = [];
  private body = new THREE.Group();
  private tail: THREE.Mesh;
  private tailRest: Float32Array;
  /** Per tail vertex: how far along the tail (0 at the rump, 1 at the tip). */
  private tailAlong: Float32Array;
  private tailTip: THREE.Mesh;
  private tipRest: THREE.Vector3;

  constructor() {
    const black = new THREE.MeshStandardMaterial({ color: 0x1f1d1c, roughness: 0.85 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd99a94, roughness: 0.8 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xbfd64e, roughness: 0.25, emissive: 0x2f3608 });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });
    const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ball = new THREE.SphereGeometry(1, 24, 16);
    const blob = (mat: THREE.Material, [x, y, z]: number[], [sx, sy, sz]: number[], parent: THREE.Object3D) => {
      const m = new THREE.Mesh(ball, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };

    // The loaf: one smooth body, fuller at the rump and flatter underneath (overlapping parts showed
    // creases from the board), thighs folded at the sides, a white bib, and white front paws tucked in front.
    const loaf = new THREE.SphereGeometry(1, 40, 24);
    const lp = loaf.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < lp.count; k++) {
      const u = lp.getX(k);
      const rump = Math.exp(-(((u + 0.5) / 0.38) ** 2));
      const h = 1.12 + 0.14 * rump;
      const w = 1.2 + 0.18 * rump;
      const y = lp.getY(k);
      lp.setXYZ(k, u * 2.5 - 0.1, (y < 0 ? y * 0.85 : y) * h + 1.12, lp.getZ(k) * w);
    }
    loaf.computeVertexNormals();
    this.body.add(new THREE.Mesh(loaf, black));
    for (const z of [-1, 1]) blob(black, [-1.15, 0.72, z * 1.02], [1.1, 0.72, 0.5], this.body);
    blob(white, [1.98, 1.0, 0], [0.62, 0.86, 0.85], this.body);
    for (const z of [-0.4, 0.4]) blob(white, [2.4, 0.25, z], [0.46, 0.24, 0.34], this.group);

    // The head: round with full cheeks, a white muzzle, chin and blaze, smooth ears, big green eyes.
    blob(black, [0, 0, 0], [0.95, 0.86, 1], this.head);
    for (const z of [-1, 1]) blob(black, [0.3, -0.32, z * 0.45], [0.55, 0.45, 0.5], this.head);
    for (const z of [-1, 1]) blob(white, [0.8, -0.34, z * 0.2], [0.26, 0.22, 0.27], this.head);
    blob(white, [0.72, -0.56, 0], [0.22, 0.14, 0.24], this.head);
    blob(white, [0.84, -0.08, 0], [0.18, 0.32, 0.26], this.head);
    blob(white, [0.83, 0.26, 0], [0.16, 0.32, 0.12], this.head);
    blob(pink, [1.06, -0.13, 0], [0.08, 0.06, 0.1], this.head);
    for (const z of [-1, 1]) {
      const e = blob(eye, [0.8, 0.14, z * 0.37], [0.13, 0.17, 0.2], this.head);
      e.rotation.y = -z * 0.35;
      blob(pupil, [0.91, 0.14, z * 0.39], [0.04, 0.13, 0.05], this.head);
      blob(glint, [0.92, 0.2, z * 0.34], [0.025, 0.025, 0.025], this.head);
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.47, 0.9, 20), black);
      outer.scale.set(0.6, 1, 1);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.62, 20), pink);
      inner.scale.set(0.35, 1, 1);
      inner.position.set(0.14, -0.08, 0);
      ear.add(outer, inner);
      ear.position.set(0.05, 0.84, z * 0.5);
      ear.rotation.set(z * 0.38, 0, -0.12);
      this.ears.push(ear);
      this.head.add(ear);
    }
    this.head.position.set(2.2, 2.32, 0);

    // The tail: one tapered tube from under the rump, round the back and forward along its left side (the one the sofa turns to the board),
    // lying on the cushion, with a white tip. Only the last part moves (see update).
    const curve = new THREE.CatmullRomCurve3(
      [
        [-2.1, 0.55, -0.35],
        [-2.65, 0.3, -0.75],
        [-2.3, 0.22, -1.45],
        [-1.0, 0.2, -1.72],
        [0.5, 0.2, -1.65],
        [1.55, 0.26, -1.3],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const rings = 48;
    const sides = 12;
    const geom = new THREE.TubeGeometry(curve, rings, 1, sides, false);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    this.tailAlong = new Float32Array(pos.count);
    const center = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      curve.getPointAt(t, center);
      const radius = 0.3 - 0.13 * t;
      for (let j = 0; j <= sides; j++) {
        const k = i * (sides + 1) + j;
        v.fromBufferAttribute(pos, k).sub(center).multiplyScalar(radius).add(center);
        pos.setXYZ(k, v.x, v.y, v.z);
        this.tailAlong[k] = t;
      }
    }
    geom.computeVertexNormals();
    this.tailRest = Float32Array.from(pos.array as Float32Array);
    this.tail = new THREE.Mesh(geom, black);
    this.tipRest = curve.getPointAt(1);
    this.tailTip = new THREE.Mesh(ball, white);
    this.tailTip.scale.set(0.3, 0.2, 0.22);
    this.tailTip.position.copy(this.tipRest);

    this.group.add(this.body, this.head, this.tail, this.tailTip);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** How far the tail's last part is lifted and swung, for a point `along` the tail (0..1). */
  private flick(along: number, seconds: number): [number, number] {
    const k = Math.max(0, (along - 0.62) / 0.38);
    const w = k * k;
    return [w * 0.28 * Math.max(0, Math.sin(seconds * 1.7)), w * 0.32 * Math.sin(seconds * 2.2)];
  }

  update(seconds: number): void {
    // Breathing.
    const breath = 1 + 0.025 * Math.sin(seconds * 1.6);
    this.body.scale.set(1, breath, breath);
    // The head looks about slowly, and now and then tips a little.
    this.head.rotation.y = 0.5 * Math.sin(seconds * 0.23) + 0.2 * Math.sin(seconds * 0.61);
    this.head.rotation.z = 0.08 * Math.sin(seconds * 0.4);
    // The tail tip lifts and sways; the rest of the tail lies still.
    const pos = this.tail.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let k = 0; k < pos.count; k++) {
      const [up, side] = this.flick(this.tailAlong[k], seconds);
      arr[k * 3] = this.tailRest[k * 3] + side * 0.5;
      arr[k * 3 + 1] = this.tailRest[k * 3 + 1] + up;
      arr[k * 3 + 2] = this.tailRest[k * 3 + 2] - side;
    }
    pos.needsUpdate = true;
    const [up, side] = this.flick(1, seconds);
    this.tailTip.position.set(this.tipRest.x + side * 0.5, this.tipRest.y + up, this.tipRest.z - side);
    // An ear twitch every few seconds.
    const twitch = Math.max(0, Math.sin(seconds * 0.9) - 0.96) * 12;
    this.ears[0].rotation.z = -0.12 - twitch * 0.5;
  }
}
