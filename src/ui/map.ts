// The campaign's sky map and the Labs, in two steps (the user's call, 2026-11-22): an overview of
// floating islands, one per world, joined by a dashed suggested path; opening one shows only that
// world, as a grid of level cards. Every level is open (soft order); the path and the "up next"
// marker only suggest an order.
import { Chapter, HandmadeLevel } from '../levels/format';
import { miniMap } from '../render/minimap';
import { esc } from './html';
import { Progress } from './progress';

/** The overview is laid out in a 160×90 box (16:9). Island centers by chapter id. */
/** Map width at which islands draw at their natural size; they scale with the map around it. */
const NATURAL_WIDTH = 1000;
const W = 160;
const H = 90;
// Six worlds in a zigzag, 26 apart, so the sixth fits inside the 160-wide box (it would have gone at 170).
const LAYOUT: Record<string, { x: number; y: number; theme: string }> = {
  glade: { x: 15, y: 30, theme: 'glade' },
  frost: { x: 41, y: 66, theme: 'frost' },
  wind: { x: 67, y: 30, theme: 'peaks' },
  star: { x: 93, y: 66, theme: 'night' },
  toy: { x: 119, y: 30, theme: 'toy' },
  paint: { x: 145, y: 66, theme: 'splatter' },
  lab: { x: 20, y: 16, theme: 'lab' },
  windlab: { x: 60, y: 16, theme: 'lab' },
  gravlab: { x: 100, y: 16, theme: 'lab' },
  shapelab: { x: 140, y: 16, theme: 'lab' },
  gladelab: { x: 20, y: 45, theme: 'lab' },
  frostlab: { x: 60, y: 45, theme: 'lab' },
  peakslab: { x: 100, y: 45, theme: 'lab' },
  starlab: { x: 140, y: 45, theme: 'lab' },
  toylab: { x: 20, y: 74, theme: 'lab' },
  splitlab: { x: 60, y: 74, theme: 'lab' },
  paintlab: { x: 100, y: 74, theme: 'lab' },
  chasmlab: { x: 140, y: 74, theme: 'lab' },
};

const SIGNATURE_LABEL: Record<string, string> = { walls: 'Hedges', ice: 'Ice & belts', pads: 'Launch pads', gravity: 'Gravity', shapes: 'Shapes' };

/** Level cards per row in a world's grid. */
export const CARD_COLUMNS = 5;

/** Overview keys: any arrow steps between islands. World keys: arrows move through the grid. */
const STEP: Record<string, number> = { ArrowLeft: -1, KeyA: -1, KeyH: -1, ArrowRight: 1, KeyD: 1, KeyL: 1 };
const ROW: Record<string, number> = { ArrowUp: -1, KeyW: -1, KeyK: -1, ArrowDown: 1, KeyS: 1, KeyJ: 1 };

function layoutOf(c: Chapter, i: number) {
  // Chapters without a hand-placed island line up along the bottom until they get one.
  return LAYOUT[c.id] ?? { x: 20 + ((i * 36) % 130), y: 74, theme: 'meadow' };
}

const solved = (p: Progress, h: HandmadeLevel) => p.best[`level:${h.id}`] !== undefined;
const title = (c: Chapter) => c.title.replace(/\s*\(.*\)$/, '');

/** The first unsolved level in these chapters; null once all are solved. */
export function firstUnsolved(chapters: Chapter[], p: Progress): HandmadeLevel | null {
  return chapters.flatMap((c) => c.levels).find((h) => !solved(p, h)) ?? null;
}

/**
 * Where a grid move lands: left and right step through the levels and wrap, up and down move a row
 * and stop at the edges (a short last row is reached from any column above it).
 */
export function gridStep(index: number, count: number, dx: number, dy: number, columns = CARD_COLUMNS): number {
  if (dx) return (index + dx + count) % count;
  const to = index + dy * columns;
  if (to < 0) return index;
  if (to >= count) return Math.floor(index / columns) < Math.floor((count - 1) / columns) ? count - 1 : index;
  return to;
}

export class SkyMap {
  private progress!: Progress;
  private current: string | null = null;
  private next: HandmadeLevel | null = null;
  /** The world being shown, or null for the overview of islands. */
  private world: number | null = null;
  /** The island picked on the overview. */
  private island = 0;
  /** The level picked in the world being shown, by its index in that world. */
  private picked = 0;
  private backLabel = 'Back';

  constructor(
    private root: HTMLElement,
    private chapters: Chapter[],
    /** The small label beside an island's name, if it has one. */
    private badgeFor: (c: Chapter) => string | null,
    /** Join the islands with the dashed path. */
    private trail: boolean,
    private onPlay: (id: string) => void,
    /** The player left this screen. */
    private onClose: () => void,
    /** The overview's heading. */
    private heading: string,
  ) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const level = el.closest<HTMLElement>('[data-level]');
      const island = el.closest<HTMLElement>('[data-island]');
      if (level) this.onPlay(level.dataset.level!);
      else if (island) this.openWorld(Number(island.dataset.island));
      else if (el.closest('[data-play]')) this.activate();
      else if (el.closest('[data-worlds]')) this.showOverview();
      else if (el.closest('[data-close]')) this.onClose();
    });
    // Islands are sized in px for legible text; scale them with the map so they neither crowd
    // a small window nor float lost in a big one.
    const canvas = root.querySelector<HTMLElement>('.sm-canvas')!;
    new ResizeObserver(() => {
      const s = Math.min(1.35, Math.max(0.7, canvas.clientWidth / NATURAL_WIDTH));
      canvas.style.setProperty('--s', s.toFixed(3));
    }).observe(canvas);
    // Hovering picks; clicking opens or plays.
    root.addEventListener('mouseover', (e) => {
      const el = e.target as HTMLElement;
      const level = el.closest<HTMLElement>('[data-level]');
      const island = el.closest<HTMLElement>('[data-island]');
      if (level && this.world !== null) this.pickLevel(this.chapters[this.world].levels.findIndex((h) => h.id === level.dataset.level));
      else if (island && this.world === null) this.pickIsland(Number(island.dataset.island));
    });
  }

  show(progress: Progress, current: string | null, backLabel: string): void {
    this.progress = progress;
    this.current = current;
    this.backLabel = backLabel;
    this.next = firstUnsolved(this.chapters, progress);
    this.root.classList.remove('hidden');
    // Opened from a level, it shows that level's world; from the menus, the overview, on the
    // world that's up next.
    const here = this.chapters.findIndex((c) => c.levels.some((h) => h.id === current));
    if (here >= 0) {
      const levels = this.chapters[here].levels;
      const level = levels.find((h) => h.id === current)!;
      // Open on the level you're playing until it's solved, then on what comes next in its world.
      const focus = solved(progress, level) ? (levels.find((h) => !solved(progress, h)) ?? level) : level;
      this.openWorld(here, levels.indexOf(focus));
    } else {
      const up = this.chapters.findIndex((c) => c.levels.includes(this.next!));
      this.island = up >= 0 ? up : 0;
      this.showOverview();
    }
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Esc: from a world back to the overview. Returns false on the overview, so the screen closes. */
  escape(): boolean {
    if (this.world === null) return false;
    this.showOverview();
    return true;
  }

  /** Handle a key while the map is open. Returns true if the map used it. */
  key(e: KeyboardEvent): boolean {
    if (this.world === null) {
      const d = STEP[e.code] ?? ROW[e.code];
      if (d) this.pickIsland(this.stepIsland(this.island, d));
      else if (e.code === 'Enter' || e.code === 'Space') this.openWorld(this.island);
      else return false;
      return true;
    }
    const count = this.chapters[this.world].levels.length;
    if (e.code in STEP) this.pickLevel(gridStep(this.picked, count, STEP[e.code], 0));
    else if (e.code in ROW) this.pickLevel(gridStep(this.picked, count, 0, ROW[e.code]));
    else if (e.code === 'Enter' || e.code === 'Space') this.activate();
    else if (e.code === 'Backspace') this.showOverview();
    else return false;
    return true;
  }

  // -------------------------------------------------------------------------

  private activate(): void {
    if (this.world === null) this.openWorld(this.island);
    else this.onPlay(this.chapters[this.world].levels[this.picked].id);
  }

  /** The next island with levels, `delta` along (worlds shown before their levels exist are skipped). */
  private stepIsland(from: number, delta: number): number {
    let at = from;
    do at = (at + delta + this.chapters.length) % this.chapters.length;
    while (!this.chapters[at].levels.length && at !== from);
    return at;
  }

  private showOverview(): void {
    if (this.world !== null) this.island = this.world;
    this.world = null;
    this.root.classList.remove('in-world');
    this.root.querySelector('.sm-canvas')!.innerHTML = this.paths() + this.chapters.map((c, i) => this.islandHtml(c, i)).join('');
    this.root.querySelector('.sm-grid')!.innerHTML = '';
    this.setHead(this.heading, false);
    this.pickIsland(this.island);
  }

  private openWorld(index: number, focus?: number): void {
    const c = this.chapters[index];
    if (!c?.levels.length) return;
    this.world = index;
    this.island = index;
    this.root.classList.add('in-world');
    const grid = this.root.querySelector<HTMLElement>('.sm-grid')!;
    grid.className = `sm-grid ${layoutOf(c, index).theme}`;
    grid.style.setProperty('--rows', String(Math.ceil(c.levels.length / CARD_COLUMNS)));
    grid.innerHTML = c.levels.map((h, n) => this.card(h, n)).join('');
    const p = this.progress;
    const done = c.levels.filter((h) => solved(p, h)).length;
    this.setHead(title(c), true, `${done}/${c.levels.length} solved`);
    const start = focus ?? Math.max(0, c.levels.findIndex((h) => !solved(p, h)));
    this.pickLevel(start);
  }

  private setHead(text: string, inWorld: boolean, note = ''): void {
    this.root.querySelector('.sm-head h2')!.innerHTML = `${esc(text)}${note ? ` <small>${esc(note)}</small>` : ''}`;
    this.root.querySelector('[data-worlds]')!.classList.toggle('hidden', !inWorld);
    // Esc goes back one step: to the overview from a world, out of the map from the overview.
    this.root.querySelector('[data-close-kbd]')!.classList.toggle('hidden', inWorld);
    this.root.querySelector('[data-back-label]')!.textContent = this.backLabel;
    this.root.querySelector('[data-keys]')!.innerHTML = inWorld
      ? '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> level · <kbd>Enter</kbd> play · <kbd>Esc</kbd> all worlds'
      : '<kbd>←</kbd><kbd>→</kbd> world · <kbd>Enter</kbd> open';
  }

  private pickIsland(index: number): void {
    if (index < 0) return;
    this.island = index;
    this.root.querySelectorAll<HTMLElement>('[data-island]').forEach((n) => n.classList.toggle('selected', Number(n.dataset.island) === index));
    this.root.querySelector('.sm-caption')!.innerHTML = this.worldCaption(this.chapters[index]);
  }

  private pickLevel(index: number): void {
    if (index < 0 || this.world === null) return;
    this.picked = index;
    const h = this.chapters[this.world].levels[index];
    this.root.querySelectorAll<HTMLElement>('[data-level]').forEach((n) => {
      const on = n.dataset.level === h.id;
      n.classList.toggle('selected', on);
      if (on) n.scrollIntoView({ block: 'nearest' });
    });
    this.root.querySelector('.sm-caption')!.innerHTML = this.levelCaption(h);
  }

  private paths(): string {
    if (!this.trail) return '';
    const pts = this.chapters.map((c, i) => layoutOf(c, i));
    const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) =>
      `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + bend} ${b.x} ${b.y}`;
    const trail = pts.slice(1).map((b, i) => `<path class="sm-trail" d="${curve(pts[i], b, 22)}"/>`);
    return `<svg class="sm-paths" viewBox="0 0 ${W} ${H}" aria-hidden="true">${trail.join('')}</svg>`;
  }

  /** An island on the overview: the world's name, badge and progress, with a dot per level. */
  private islandHtml(c: Chapter, i: number): string {
    const { x, y, theme } = layoutOf(c, i);
    const p = this.progress;
    const done = c.levels.filter((h) => solved(p, h)).length;
    const stars = c.levels.reduce((n, h) => n + (p.best[`level:${h.id}`] ?? 0), 0);
    const badge = this.badgeFor(c);
    const here = c.levels.some((h) => h.id === this.current);
    const dots = c.levels.map((h) => `<i class="${solved(p, h) ? 'solved' : ''}${h === this.next ? ' next' : ''}"></i>`).join('');
    return `
      <section class="sm-island ${theme}${c.levels.length ? '' : ' empty'}${here ? ' here' : ''}" data-island="${i}"
               style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;--delay:${-i * 1.7}s">
        <div class="sm-top">
          <header>
            <h3>${esc(title(c))}</h3>
            ${badge ? `<span class="sm-badge">${esc(badge)}</span>` : ''}
          </header>
          ${
            c.levels.length
              ? `<p class="sm-progress">${done}/${c.levels.length} solved · <span class="stars">★</span> ${stars}/${c.levels.length * 3}</p>
                 <div class="sm-dots">${dots}</div>`
              : '<p class="sm-progress">Coming soon</p>'
          }
        </div>
      </section>`;
  }

  /** A level card in a world's grid: its mini-map, number and name, par and your best. */
  private card(h: HandmadeLevel, n: number): string {
    const best = this.progress.best[`level:${h.id}`];
    const cls = ['sm-card', best !== undefined ? 'solved' : '', h === this.next ? 'next' : '', h.id === this.current ? 'current' : ''].join(' ');
    const record = best !== undefined ? `<span class="stars">${'★'.repeat(best)}</span><span class="sm-off">${'★'.repeat(3 - best)}</span>` : '';
    return `
      <button class="${cls}" data-level="${h.id}" title="${esc(`${h.id} · ${h.name}`)}">
        <span class="sm-card-map">${miniMap(h.level)}</span>
        <span class="sm-card-name"><b>${n + 1}</b> ${esc(h.name)}</span>
        <span class="sm-card-meta">Par ${h.par ?? '–'} ${record}</span>
      </button>`;
  }

  private worldCaption(c: Chapter): string {
    const p = this.progress;
    const done = c.levels.filter((h) => solved(p, h)).length;
    const up = c.levels.find((h) => !solved(p, h));
    const badge = this.badgeFor(c);
    const kicker = c.levels.some((h) => h.id === this.current) ? 'You are here' : this.next && c.levels.includes(this.next) ? 'Up next' : (badge ?? '');
    const detail = !c.levels.length
      ? 'Coming soon'
      : up
        ? `${done}/${c.levels.length} solved · next: <code>${esc(up.id)}</code> ${esc(up.name)}`
        : `All ${c.levels.length} solved`;
    return `
      <div class="sm-preview">${up || c.levels[0] ? miniMap((up ?? c.levels[0]).level) : ''}</div>
      <div class="sm-text">
        <p class="sm-kicker">${esc(kicker)}</p>
        <h3>${esc(title(c))}</h3>
        <p class="sm-meta">${detail}</p>
      </div>
      ${c.levels.length ? '<button class="primary" data-play>Open <kbd>Enter</kbd></button>' : ''}`;
  }

  private levelCaption(h: HandmadeLevel): string {
    const best = this.progress.best[`level:${h.id}`];
    const kicker = h.id === this.current ? 'You are here' : h === this.next ? 'Up next' : esc(title(this.chapters[this.world!]));
    const record = best
      ? `<span class="stars">${'★'.repeat(best)}</span><span class="sm-off">${'★'.repeat(3 - best)}</span>`
      : 'not solved yet';
    return `
      <div class="sm-preview">${miniMap(h.level)}</div>
      <div class="sm-text">
        <p class="sm-kicker">${kicker}</p>
        <h3><code>${esc(h.id)}</code> ${esc(h.name)}</h3>
        <p class="sm-meta">Par ${h.par ?? '–'} · Best ${record}</p>
      </div>
      <button class="primary" data-play>Play <kbd>Enter</kbd></button>`;
  }
}

/** What an island's badge says on the sky map. */
/** Worlds whose mechanics have no one-trick guard (no signature), labeled by hand. */
const WORLD_LABEL: Record<string, string> = { paint: 'Split & paint' };

export function signatureBadge(c: Chapter): string {
  return c.signature ? (SIGNATURE_LABEL[c.signature] ?? c.signature) : (WORLD_LABEL[c.id] ?? 'Basics');
}
