import * as THREE from 'three';

/** How many motes can be in the air at once, how long each lives, and its size. */
const MOTES = 240;
const LIFE = 1.05;
const SIZE = 0.2;

/**
 * Glittering motes for flips: each one is born somewhere, drifts, twinkles and fades by itself. All in one
 * draw call and in world coordinates, so they stay where they were left while the camera turns over.
 */
export class Stardust {
  readonly points: THREE.Points;
  private next = 0;
  private uniforms = { uTime: { value: 0 }, uScale: { value: 1 }, uLife: { value: LIFE }, uSize: { value: SIZE } };

  constructor() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    geom.setAttribute('aDrift', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    // Born long ago, so nothing shows until the first flip.
    geom.setAttribute('aBorn', new THREE.BufferAttribute(new Float32Array(MOTES).fill(-1000), 1));
    this.points = new THREE.Points(
      geom,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute vec3 aDrift;
          attribute float aBorn;
          uniform float uTime;
          uniform float uScale;
          uniform float uLife;
          uniform float uSize;
          varying float vFade;
          void main() {
            float age = uTime - aBorn;
            float life = clamp(age / uLife, 0.0, 1.0);
            // Slows as it goes, and twinkles, each at its own pace.
            vec3 at = position + aDrift * (1.0 - (1.0 - life) * (1.0 - life)) * uLife;
            float twinkle = 0.65 + 0.35 * sin(age * 19.0 + aBorn * 53.0 + position.x * 7.0);
            vFade = (age < 0.0 ? 0.0 : (1.0 - life)) * twinkle;
            vec4 view = modelViewMatrix * vec4(at, 1.0);
            gl_PointSize = uSize * (1.0 - life * 0.5) * uScale / -view.z;
            gl_Position = projectionMatrix * view;
          }`,
        fragmentShader: `
          varying float vFade;
          void main() {
            float round = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(vec3(0.86, 0.8, 1.0), round * vFade);
          }`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Release a mote at a point, drifting at a velocity. */
  emit(x: number, y: number, z: number, dx: number, dy: number, dz: number, born: number): void {
    const { position, aDrift, aBorn } = this.points.geometry.attributes;
    const i = this.next;
    this.next = (i + 1) % MOTES;
    position.setXYZ(i, x, y, z);
    aDrift.setXYZ(i, dx, dy, dz);
    aBorn.setX(i, born);
    position.needsUpdate = aDrift.needsUpdate = aBorn.needsUpdate = true;
  }

  update(seconds: number, canvasHeight: number, fov: number): void {
    this.uniforms.uTime.value = seconds;
    this.uniforms.uScale.value = canvasHeight / (2 * Math.tan((fov * Math.PI) / 360));
  }
}
