import * as THREE from 'three';

/**
 * Splatter Studio's cat (look session 2026-11-20: the world's mascot, capped at four tries, then a
 * simpler blocky cat). A black-and-white tuxedo cat lying in a loaf, head up, tail curled round: black and
 * white keeps it clear of every paint and switch color. Its tail tip flicks, its head turns slowly to look
 * about, an ear twitches now and then, and it breathes. Built at about 6 units long; the caller scales it.
 */
export class StudioCat {
  readonly group = new THREE.Group();
  private head = new THREE.Group();
  private tail: THREE.Object3D[] = [];
  private ears: THREE.Object3D[] = [];
  private body: THREE.Mesh;

  constructor() {
    const black = new THREE.MeshStandardMaterial({ color: 0x1f1d1c, roughness: 0.85 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd99a94, roughness: 0.8 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xc9d65a, roughness: 0.3, emissive: 0x2a2f08 });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });

    // The loaf: a long rounded body, with a white chest and front paws tucked in front.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), black);
    this.body.scale.set(2.4, 1.25, 1.35);
    this.body.position.set(0, 1.2, 0);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), white);
    chest.scale.set(0.9, 1.0, 1.05);
    chest.position.set(1.75, 1.15, 0);
    const pawGeom = new THREE.SphereGeometry(0.42, 12, 8);
    const paws = [-0.45, 0.45].map((z) => {
      const p = new THREE.Mesh(pawGeom, white);
      p.scale.set(1.3, 0.7, 1);
      p.position.set(2.35, 0.3, z);
      return p;
    });

    // The head: round, with a white muzzle and chin, pointed ears with pink insides, green eyes.
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), black);
    skull.scale.set(0.95, 0.88, 1);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), white);
    muzzle.scale.set(0.75, 0.6, 1);
    muzzle.position.set(0.72, -0.28, 0);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), pink);
    nose.position.set(1.08, -0.1, 0);
    this.head.add(skull, muzzle, nose);
    for (const z of [-0.38, 0.38]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eye);
      e.position.set(0.78, 0.18, z);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), pupil);
      p.scale.set(0.5, 1.4, 1);
      p.position.set(0.92, 0.18, z * 1.02);
      this.head.add(e, p);
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.7, 4), black);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), pink);
      inner.position.set(0.08, -0.05, 0);
      ear.add(outer, inner);
      ear.position.set(0.05, 0.85, z * 1.25);
      ear.rotation.set(z * 0.5, 0, -0.15);
      this.ears.push(ear);
      this.head.add(ear);
    }
    this.head.position.set(2.2, 2.35, 0);

    // The tail: a chain of shrinking segments curling round the side, white at the tip.
    const segments = 9;
    let parent: THREE.Object3D = this.group;
    const base = new THREE.Group();
    base.position.set(-2.2, 0.55, 0);
    this.group.add(base);
    parent = base;
    for (let i = 0; i < segments; i++) {
      const r = 0.36 - i * 0.022;
      const seg = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), i >= segments - 2 ? white : black);
      ball.scale.set(1.6, 1, 1);
      ball.position.x = r * 0.8;
      seg.add(ball);
      seg.position.x = i ? r * 1.5 : 0;
      // Curl it round toward the front, along the body's side.
      seg.rotation.y = i ? 0.3 : Math.PI * 0.75;
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }

    this.group.add(this.body, chest, ...paws, this.head);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  update(seconds: number): void {
    // Breathing.
    const breath = 1 + 0.025 * Math.sin(seconds * 1.6);
    this.body.scale.set(2.4, 1.25 * breath, 1.35 * breath);
    // The head looks about slowly, and now and then tips a little.
    this.head.rotation.y = 0.5 * Math.sin(seconds * 0.23) + 0.2 * Math.sin(seconds * 0.61);
    this.head.rotation.z = 0.08 * Math.sin(seconds * 0.4);
    // The tail tip flicks; the base barely moves.
    this.tail.forEach((seg, i) => {
      const k = i / this.tail.length;
      seg.rotation.z = Math.sin(seconds * 2.2 - i * 0.6) * 0.18 * k * k;
    });
    // An ear twitch every few seconds.
    const twitch = Math.max(0, Math.sin(seconds * 0.9) - 0.96) * 12;
    this.ears[0].rotation.z = -0.15 - twitch * 0.5;
  }
}
