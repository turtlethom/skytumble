import * as THREE from 'three';

export interface SceneryTiles {
  ice: { x: number; z: number }[];
  pads: { x: number; z: number }[];
}

/** A world's surroundings: what's around and below the board. Decoration only, never rules. */
export interface Scenery {
  readonly group: THREE.Group;
  /** Center it on a level. `tiles` lists tiles that scenery plays on or keeps clear of. */
  place(center: THREE.Vector3, viewSize: number, tiles: SceneryTiles): void;
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

export function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Soft puffs that wrap at the edges, so the sheet tiles and scrolls without a seam. */
export function cloudTexture(seed: number): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const rnd = seeded(seed);
  for (let i = 0; i < 42; i++) {
    const [x, y, r, alpha] = [rnd() * size, rnd() * size, 30 + rnd() * 70, 0.12 + rnd() * 0.24];
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const puff = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        puff.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = puff;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function softDot(): THREE.CanvasTexture {
  const size = 32;
  const [c, ctx] = canvas(size);
  const dot = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  dot.addColorStop(0, 'rgba(255, 255, 255, 1)');
  dot.addColorStop(0.55, 'rgba(255, 255, 255, 0.85)');
  dot.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = dot;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
