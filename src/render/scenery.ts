import * as THREE from 'three';

/** A world's surroundings: what's around and below the board. Decoration only, never rules. */
export interface Scenery {
  readonly group: THREE.Group;
  /** Center it on a level. `ice` lists the level's ice tiles, for scenery that plays on them. */
  place(center: THREE.Vector3, viewSize: number, ice: { x: number; z: number }[]): void;
  update(seconds: number, dt: number, canvasHeight: number): void;
}

/**
 * Shader lines for distant things: up the screen means farther away, so a surface sinks into the
 * haze (`uHaze`), then thins out into the page's sky behind the canvas. Needs `uHeight` and `uHaze`.
 */
export function intoTheSky(hazeNear: number, hazeFar: number, hazeTo = 0.76, fadeFrom = 0.7, fadeTo = 0.9): string {
  return `
  float up = gl_FragCoord.y / uHeight;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, mix(${hazeNear.toFixed(3)}, ${hazeFar.toFixed(3)}, smoothstep(0.0, ${hazeTo.toFixed(3)}, up)));
  gl_FragColor.a *= 1.0 - smoothstep(${fadeFrom.toFixed(3)}, ${fadeTo.toFixed(3)}, up);`;
}

/** A small repeatable random sequence, so a world looks the same on every visit. */
export function seeded(seed: number): () => number {
  let s = seed * 7919;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
