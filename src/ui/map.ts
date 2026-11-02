// The campaign sky map: one floating island per chapter, joined by a dashed suggested path.
// Every level is open (soft order); the path and the "up next" marker only suggest an order.
import { CHAPTERS, HANDMADE, isExtra } from '../levels';
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
  tutorial: { x: 16, y: 27, theme: 'glade' },
  frost: { x: 40, y: 62, theme: 'frost' },
  wind: { x: 64, y: 27, theme: 'peaks' },
  star: { x: 88, y: 62, theme: 'night' },
  toy: { x: 110, y: 27, theme: 'toy' },
  lab: { x: 143, y: 11, theme: 'lab' },
  windlab: { x: 143, y: 33, theme: 'lab' },
  gravlab: { x: 143, y: 55, theme: 'lab' },
  shapelab: { x: 143, y: 77, theme: 'lab' },
};

const SIGNATURE_LABEL: Record<string, string> = { ice: 'Ice & belts', pads: 'Launch pads', gravity: 'Gravity', shapes: 'Shapes' };

/** Map keys: Left/Right step through levels in play order, Up/Down hop between islands. */
const STEP: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const HOP: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 };

function layoutOf(c: Chapter, i: number) {
  // Chapters without a hand-placed island line up along the bottom until they get one.
  return LAYOUT[c.id] ?? { x: 20 + ((i * 36) % 130), y: 74, theme: 'meadow' };
}

const solved = (p: Progress, h: HandmadeLevel) => p.best[`level:${h.id}`] !== undefined;

/** The first unsolved level on the suggested path, then in the extras; null once all are solved. */
export function suggestedLevel(p: Progress): HandmadeLevel | null {
  const ordered = [...CHAPTERS.filter((c) => !isExtra(c)), ...CHAPTERS.filter(isExtra)];
  return ordered.flatMap((c) => c.levels).find((h) => !solved(p, h)) ?? null;
}

export class SkyMap {
  private selected = 0;
  private progress!: Progress;
  private current: string | null = null;
  private next: HandmadeLevel | null = null;

  constructor(
    private root: HTMLElement,
    private onPlay: (id: string) => void,
  ) {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const node = el.closest<HTMLElement>('[data-level]');
      if (node) this.onPlay(node.dataset.level!);
      else if (el.closest('[data-play]')) this.onPlay(HANDMADE[this.selected].id);
      else if (el.closest('[data-close]')) this.hide();
    });
    // Islands are sized in px for legible text; scale them with the map so they neither crowd
    // a small window nor float lost in a big one.
    const canvas = root.querySelector<HTMLElement>('.sm-canvas')!;
    new ResizeObserver(() => {
      const s = Math.min(1.35, Math.max(0.8, canvas.clientWidth / NATURAL_WIDTH));
      canvas.style.setProperty('--s', s.toFixed(3));
    }).observe(canvas);
    // Hovering previews a level; clicking plays it.
    root.addEventListener('mouseover', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
      if (node) this.select(HANDMADE.findIndex((h) => h.id === node.dataset.level));
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(progress: Progress, current: string | null): void {
    this.progress = progress;
    this.current = current;
    this.next = suggestedLevel(progress);
    const here = HANDMADE.find((h) => h.id === current);
    // Open on the level you're playing until it's solved, then on what comes next.
    const focus = here && !solved(progress, here) ? here : (this.next ?? here ?? HANDMADE[0]);
    this.root.querySelector('.sm-canvas')!.innerHTML = this.paths() + CHAPTERS.map((c, i) => this.island(c, i)).join('');
    this.root.classList.remove('hidden');
    this.select(HANDMADE.indexOf(focus));
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Handle a key while the map is open. Returns true if the map used it. */
  key(e: KeyboardEvent): boolean {
    if (e.code in STEP) {
      this.select((this.selected + STEP[e.code] + HANDMADE.length) % HANDMADE.length);
    } else if (e.code in HOP) {
      this.hop(HOP[e.code]);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.onPlay(HANDMADE[this.selected].id);
    } else if (e.code === 'Escape' || e.code === 'KeyL') {
      this.hide();
    } else {
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------

  /** Jump to the neighbouring island, landing on its first unsolved level. */
  private hop(delta: number): void {
    const from = CHAPTERS.findIndex((c) => c.levels.includes(HANDMADE[this.selected]));
    const chapter = CHAPTERS[(from + delta + CHAPTERS.length) % CHAPTERS.length];
    const target = chapter.levels.find((h) => !solved(this.progress, h)) ?? chapter.levels[0];
    this.select(HANDMADE.indexOf(target));
  }

  private select(index: number): void {
    if (index < 0) return;
    this.selected = index;
    const h = HANDMADE[index];
    this.root.querySelectorAll<HTMLElement>('[data-level]').forEach((n) => {
      n.classList.toggle('selected', n.dataset.level === h.id);
    });
    this.root.querySelector('.sm-caption')!.innerHTML = this.caption(h);
  }

  private paths(): string {
    const pts = CHAPTERS.map((c, i) => ({ c, ...layoutOf(c, i) }));
    const main = pts.filter((p) => !isExtra(p.c));
    const curve = (a: { x: number; y: number }, b: { x: number; y: number }, bend: number) =>
      `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + bend} ${b.x} ${b.y}`;
    const trail = main.slice(1).map((b, i) => `<path class="sm-trail" d="${curve(main[i], b, 22)}"/>`);
    // Extras branch off the end of the suggested path.
    const last = main[main.length - 1];
    const side = pts.filter((p) => isExtra(p.c)).map((b) => `<path class="sm-trail extra" d="${curve(last, b, -6)}"/>`);
    return `<svg class="sm-paths" viewBox="0 0 ${W} ${H}" aria-hidden="true">${[...trail, ...side].join('')}</svg>`;
  }

  private island(c: Chapter, i: number): string {
    const { x, y, theme } = layoutOf(c, i);
    const p = this.progress;
    const done = c.levels.filter((h) => solved(p, h)).length;
    const stars = c.levels.reduce((n, h) => n + (p.best[`level:${h.id}`] ?? 0), 0);
    const badge = isExtra(c) ? 'Extras' : c.signature ? (SIGNATURE_LABEL[c.signature] ?? c.signature) : 'Basics';
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
      <section class="sm-island ${theme} ${isExtra(c) ? 'extra' : ''}"
               style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;--delay:${-i * 1.7}s">
        <div class="sm-top">
          <header>
            <h3>${esc(c.title.replace(/\s*\(.*\)$/, ''))}</h3>
            <span class="sm-badge">${esc(badge)}</span>
          </header>
          <p class="sm-progress">${done}/${c.levels.length} solved · <span class="stars">★</span> ${stars}/${c.levels.length * 3}</p>
          <div class="sm-nodes">${nodes}</div>
        </div>
      </section>`;
  }

  private caption(h: HandmadeLevel): string {
    const best = this.progress.best[`level:${h.id}`];
    const chapter = CHAPTERS.find((c) => c.levels.includes(h))!;
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
