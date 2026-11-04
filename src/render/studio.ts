import * as THREE from 'three';
import { Scenery, SceneryTiles, canvas } from './scenery';

/** How far below the board the shadow falls, how dark it is, and how soft, in tiles. */
const DROP = 7;
const OPACITY = 0.45;
const BLUR_TILES = 0.7;
const PX_PER_TILE = 24;
/** Room around the board for the blur to fade out, in tiles. */
const MARGIN = 4;

/**
 * The Tutorial's surroundings: the board's soft shadow on an unseen floor, which has no edge and no
 * horizon. The floor's color itself is the page behind the canvas.
 */
export class StudioScenery implements Scenery {
  readonly group = new THREE.Group();
  private material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: OPACITY, depthWrite: false });
  private mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);

  constructor() {
    this.mesh.rotation.x = -Math.PI / 2;
    this.group.add(this.mesh);
  }

  place(_center: THREE.Vector3, _viewSize: number, tiles: SceneryTiles): void {
    this.mesh.visible = tiles.solid.length > 0;
    if (!this.mesh.visible) return;
    const xs = tiles.solid.map((t) => t.x);
    const zs = tiles.solid.map((t) => t.z);
    const [minX, minZ] = [Math.min(...xs) - 0.5 - MARGIN, Math.min(...zs) - 0.5 - MARGIN];
    const [width, depth] = [Math.max(...xs) + 0.5 + MARGIN - minX, Math.max(...zs) + 0.5 + MARGIN - minZ];

    const size = Math.ceil(Math.max(width, depth) * PX_PER_TILE);
    const [c, ctx] = canvas(size);
    ctx.filter = `blur(${BLUR_TILES * PX_PER_TILE}px)`;
    ctx.fillStyle = '#fff';
    for (const { x, z } of tiles.solid) ctx.fillRect((x - 0.5 - minX) * PX_PER_TILE, (z - 0.5 - minZ) * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);

    this.material.alphaMap?.dispose();
    this.material.alphaMap = null;
    this.material.map?.dispose();
    this.material.map = new THREE.CanvasTexture(c);
    this.material.needsUpdate = true;

    const side = size / PX_PER_TILE;
    this.mesh.scale.set(side, side, 1);
    this.mesh.position.set(minX + side / 2, -DROP, minZ + side / 2);
  }

  update(): void {}
}
