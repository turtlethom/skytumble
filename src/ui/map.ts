// A screen of floating islands, one per chapter: the campaign's sky map, joined by a dashed
// suggested path, and the Labs. Every level is open (soft order); the path and the "up next"
// marker only suggest an order.
import { Chapter, HandmadeLevel } from '../levels/format';
import { miniMap } from '../render/minimap';
import { esc } from './html';
import { Progress } from './progress';

/** The map is laid out in a 160×90 box (16:9). Island centers by chapter id. */
/** Map width at which islands draw at their natural size; they scale with the map around it. */
const NATURAL_WIDTH = 1000;
const W = 160;
const H = 90;
const LAYOUT: Record<string, { x: number; y: number; theme: string }> = {
  // Two rows far enough apart for full islands of 20 stones: neighbors overlap sideways, so they can't overlap in height.
  glade: { x: 20, y: 23, theme: 'glade' },
  frost: { x: 50, y: 70, theme: 'frost' },
  wind: { x: 80, y: 23, theme: 'peaks' },
  star: { x: 110, y: 70, theme: 'night' },
  toy: { x: 140, y: 23, theme: 'toy' },
  lab: { x: 30, y: 22, theme: 'lab' },
  windlab: { x: 80, y: 22, theme: 'lab' },
  gravlab: { x: 130, y: 22, theme: 'lab' },
  shapelab: { x: 50, y: 64, theme: 'lab' },
  gladelab: { x: 110, y: 64, theme: 'lab' },
};

const SIGNATURE_LABEL: Record<string, string> = { walls: 'Hedges', ice: 'Ice & belts', pads: 'Launch pads', gravity: 'Gravity', shapes: 'Shapes' };

/** Map keys: Left/Right step through levels in play order, Up/Down hop between islands. */
const STEP: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const HOP: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 };

function layoutOf(c: Chapter, i: number) {
  // Chapters without a hand-placed island line up along the bottom until they get one.
  return LAYOUT[c.id] ?? { x: 20 + ((i * 36) % 130), y: 74, theme: 'meadow' };
}

const solved = (p: Progress, h: HandmadeLevel) => p.best[`level:${h.id}`] !== undefined;

/** The first unsolved level in these chapters; null once all are solved. */
export function firstUnsolved(chapters: Chapter[], p: Progress): HandmadeLevel | null {
  return chapters.flatMap((c) => c.levels).find((h) => !solved(p, h)) ?? null;
}

export class SkyMap {
  private selected = 0;
  private progress!: Progress;
  private current: string | null = null;
  private next: HandmadeLevel | null = null;
  private levels: HandmadeLevel[];

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
  ) {
    this.levels = chapters.flatMap((c) => c.levels);
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const node = el.closest<HTMLElement>('[data-level]');
      if (node) this.onPlay(node.dataset.level!);
      else if (el.closest('[data-play]')) this.onPlay(this.levels[this.selected].id);
      else if (el.closest('[data-close]')) this.onClose();
    });
    // Islands are sized in px for legible text; scale them with the map so they neither crowd
    // a small window nor float lost in a big one.
    const canvas = root.querySelector<HTMLElement>('.sm-canvas')!;
    new ResizeObserver(() => {
      const s = Math.min(1.35, Math.max(0.7, canvas.clientWidth / NATURAL_WIDTH));
      canvas.style.setProperty('--s', s.toFixed(3));
    }).observe(canvas);
    // Hovering previews a level; clicking plays it.
    root.addEventListener('mouseover', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
      if (node) this.select(this.levels.findIndex((h) => h.id === node.dataset.level));
    });
  }

  show(progress: Progress, current: string | null, backLabel: string): void {
    this.progress = progress;
    this.current = current;
    this.next = firstUnsolved(this.chapters, progress);
    const here = this.levels.find((h) => h.id === current);
    // Open on the level you're playing until it's solved, then on what comes next.
    const focus = here && !solved(progress, here) ? here : (this.next ?? here ?? this.levels[0]);
    this.root.querySelector('.sm-canvas')!.innerHTML = this.paths() + this.chapters.map((c, i) => this.island(c, i)).join('');
    this.root.querySelector('[data-back-label]')!.textContent = backLabel;
    this.root.classList.remove('hidden');
    this.select(this.levels.indexOf(focus));
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Handle a key while the map is open. Returns true if the map used it. */
  key(e: KeyboardEvent): boolean {
    if (e.code in STEP) {
      this.select((this.selected + STEP[e.code] + this.levels.length) % this.levels.length);
    } else if (e.code in HOP) {
      this.hop(HOP[e.code]);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.onPlay(this.levels[this.selected].id);
    } else {
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------

  /** Jump to the neighbouring island, landing on its first unsolved level. */
  private hop(delta: number): void {
    const from = this.chapters.findIndex((c) => c.levels.includes(this.levels[this.selected]));
    const chapter = this.chapters[(from + delta + this.chapters.length) % this.chapters.length];
    const target = chapter.levels.find((h) => !solved(this.progress, h)) ?? chapter.levels[0];
    this.select(this.levels.indexOf(target));
  }

  private select(index: number): void {
    if (index < 0) return;
    this.selected = index;
    const h = this.levels[index];
    this.root.querySelectorAll<HTMLElement>('[data-level]').forEach((n) => {
      n.classList.toggle('selected', n.dataset.level === h.id);
    });
    this.root.querySelector('.sm-caption')!.innerHTML = this.caption(h);
  }

  private paths(): string {
    if (!this.trail) return '';
    const pts = this.chapters.map((c, i) => layoutOf(c, i));
    const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) =>
      `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + bend} ${b.x} ${b.y}`;
    const trail = pts.slice(1).map((b, i) => `<path class="sm-trail" d="${curve(pts[i], b, 22)}"/>`);
    return `<svg class="sm-paths" viewBox="0 0 ${W} ${H}" aria-hidden="true">${trail.join('')}</svg>`;
  }

  private island(c: Chapter, i: number): string {
    const { x, y, theme } = layoutOf(c, i);
    const p = this.progress;
    const done = c.levels.filter((h) => solved(p, h)).length;
    const stars = c.levels.reduce((n, h) => n + (p.best[`level:${h.id}`] ?? 0), 0);
    const badge = this.badgeFor(c);
    const nodes = c.levels
      .map((h, n) => {
        const best = p.best[`level:${h.id}`];
        const cls = [
          'sm-node',
          best !== undefined ? 'solved' : '',
          h === this.next ? 'next' : '',
          h.id === this.current ? 'current' : '',
        ].join(' ');
        const pips = best ? `<span class="sm-pips">${'★'.repeat(best)}</span>` : '';
        return `<button class="${cls}" data-level="${h.id}" title="${esc(`${h.id} · ${h.name}`)}">${n + 1}${pips}</button>`;
      })
      .join('');
    return `
      <section class="sm-island ${theme}"
               style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;--delay:${-i * 1.7}s;--cols:${stoneColumns(c.levels.length)}">
        <div class="sm-top">
          <header>
            <h3>${esc(c.title.replace(/\s*\(.*\)$/, ''))}</h3>
            ${badge ? `<span class="sm-badge">${esc(badge)}</span>` : ''}
          </header>
          <p class="sm-progress">${done}/${c.levels.length} solved · <span class="stars">★</span> ${stars}/${c.levels.length * 3}</p>
          <div class="sm-nodes">${nodes}</div>
        </div>
      </section>`;
  }

  private caption(h: HandmadeLevel): string {
    const best = this.progress.best[`level:${h.id}`];
    const chapter = this.chapters.find((c) => c.levels.includes(h))!;
    const kicker =
      h.id === this.current ? 'You are here' : h === this.next ? 'Up next' : esc(chapter.title.replace(/\s*\(.*\)$/, ''));
    const record = best
      ? `<span class="stars">${'★'.repeat(best)}</span><span class="sm-off">${'★'.repeat(3 - best)}</span>`
      : 'not solved yet';
    return `
      <div class="sm-preview">${miniMap(h.level)}</div>
      <div class="sm-text">
        <p class="sm-kicker">${kicker}</p>
        <h3><code>${esc(h.id)}</code> ${esc(h.name)}</h3>
        <p class="sm-idea" title="${esc(h.idea)}">${esc(h.idea)}</p>
        <p class="sm-meta">Par ${h.par ?? '–'} · Best ${record}</p>
      </div>
      <button class="primary" data-play>Play <kbd>Enter</kbd></button>`;
  }
}

/** How many stones an island sets in a row: two rows while they fit in about the usual width, then three, so it grows wider rather than taller. */
export function stoneColumns(stones: number): number {
  return Math.ceil(stones / (stones <= 12 ? 2 : 3));
}

/** What an island's badge says on the sky map. */
export function signatureBadge(c: Chapter): string {
  return c.signature ? (SIGNATURE_LABEL[c.signature] ?? c.signature) : 'Basics';
}
