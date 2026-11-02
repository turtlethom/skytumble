import './style.css';
import { randomSeed } from './game/rng';
import { initialState, step } from './game/rules';
import { solve } from './game/solver';
import { DIRS, Dir, Level, State, TIERS, Tier } from './game/types';
import { HANDMADE, findLevel } from './levels';
import { tileSheet } from './levels/sheet';
import { NEUTRAL, THEMES, Theme, themeForLevel } from './render/themes';
import { World } from './render/world';
import { SkyMap, suggestedLevel } from './ui/map';
import { Progress, loadProgress, saveProgress, starsFor } from './ui/progress';
import type { GenerateRequest, GenerateResponse } from './worker';

type Mode = { kind: 'gen'; tier: Tier; seed: string } | { kind: 'hand'; id: string };
type Status = 'loading' | 'playing' | 'busy' | 'fallen' | 'won';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const CHAIN_BEAT_MS = 110;

/** Screen directions: 0 up, 1 right, 2 down, 3 left; the world maps them to grid directions. */
const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

class Game {
  private world = new World($('stage'));
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private progress = loadProgress();
  private map = new SkyMap($('map'), (id) => this.load({ kind: 'hand', id }));
  private mode: Mode;
  private level: Level | null = null;
  private par = 0;
  private state!: State;
  private history: State[] = [];
  private moves = 0;
  private status: Status = 'loading';
  private queued: Dir | null = null;
  private requestId = 0;
  private toastTimer = 0;
  /** A theme forced from the URL, to preview it on any level. */
  private themeOverride: Theme | null = null;

  constructor() {
    // A bare URL lands on the map, with the suggested level waiting behind it.
    const landing = !location.search;
    this.mode = modeFromUrl(this.progress);
    this.worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
      if (e.data.id === this.requestId) void this.start(e.data.level, e.data.par);
    };
    this.bindUi();
    // For the headless play driver (scripts/design/play.mjs): which arrow key (0 up, 1 right, 2 down,
    // 3 left) rolls the block in a grid direction from the current view.
    (window as unknown as { skytumbleKeyFor: (d: Dir) => number }).skytumbleKeyFor = (d) =>
      [0, 1, 2, 3].find((k) => this.world.gridDirForScreen(k) === d) ?? -1;
    const params = new URLSearchParams(location.search);
    this.themeOverride = THEMES[params.get('theme') ?? params.get('sheet') ?? ''] ?? null;
    if (params.has('sheet')) {
      void this.start(tileSheet(Number(params.get('bridges') ?? 15)), 0);
      return;
    }
    this.load(this.mode);
    if (landing) this.showMap();
  }

  // -------------------------------------------------------------------------
  // Loading levels.

  private load(mode: Mode): void {
    this.mode = mode;
    this.status = 'loading';
    this.queued = null;
    this.hideModals();
    this.renderChrome();
    history.replaceState(null, '', modeToQuery(mode));

    if (mode.kind === 'hand') {
      const level = findLevel(mode.id)!.level;
      void this.start(level, solve(level)!.moves.length);
      return;
    }
    const id = ++this.requestId;
    const loading = window.setTimeout(() => $('loading').classList.add('show'), 150);
    const clear = () => window.clearTimeout(loading);
    this.worker.addEventListener('message', clear, { once: true });
    const req: GenerateRequest = { id, tier: mode.tier, seed: mode.seed };
    this.worker.postMessage(req);
  }

  private async start(level: Level, par: number): Promise<void> {
    await revealPage();
    $('loading').classList.remove('show');
    this.level = level;
    this.par = par;
    this.state = initialState(level);
    this.history = [];
    this.moves = 0;
    this.status = 'busy';
    this.renderChrome();
    const theme = this.themeOverride ?? (this.mode.kind === 'hand' ? themeForLevel(this.mode.id) : NEUTRAL);
    await this.world.setLevel(level, this.state, theme);
    this.status = 'playing';
    this.updatePreviews();
    this.drainQueue();
  }

  private nextLevel(): void {
    const prevKey = this.levelKey();
    if (this.status !== 'won' && this.progress.best[prevKey] === undefined) {
      // Skipping an unsolved level ends the streak.
      this.progress.streak = 0;
      saveProgress(this.progress);
    }
    if (this.mode.kind === 'hand') {
      const id = this.mode.id;
      const next = HANDMADE[(HANDMADE.findIndex((h) => h.id === id) + 1) % HANDMADE.length];
      this.load({ kind: 'hand', id: next.id });
    } else {
      this.load({ kind: 'gen', tier: this.mode.tier, seed: randomSeed() });
    }
  }

  // -------------------------------------------------------------------------
  // Playing.

  private async move(dir: Dir): Promise<void> {
    if (!this.level) return;
    if (this.status === 'busy') {
      this.queued = dir;
      return;
    }
    if (this.status !== 'playing') return;

    const level = this.level;
    const from = this.state;
    const result = step(level, from, dir);
    this.history.push(from);
    this.moves++;
    this.status = 'busy';
    this.world.showFlipPreviews([]);
    this.renderChrome();

    await this.world.roll(from.block, result.rolled, dir);
    for (const [i, motion] of result.motions.entries()) {
      // A short beat between chained motions so slide → push → slide reads as three events.
      if (i > 0) await new Promise((r) => window.setTimeout(r, CHAIN_BEAT_MS));
      await this.world.move(motion);
    }
    this.world.pressSwitches(result.pressed);
    if (result.reshaped) {
      const before = result.motions.length ? result.motions[result.motions.length - 1].to : result.rolled;
      await this.world.reshape(before, result.state.block);
    }
    if (result.toggled) await this.world.setBridges(result.state.bridges);
    this.state = result.state;

    if (result.outcome === 'fall') {
      this.queued = null;
      await this.world.fall(level, result.state.block, result.broke);
      this.status = 'fallen';
      $('fell').classList.remove('hidden');
      return;
    }
    if (result.outcome === 'win') {
      this.queued = null;
      await this.world.win();
      this.status = 'won';
      this.recordWin();
      return;
    }
    this.status = 'playing';
    this.updatePreviews();
    this.drainQueue();
  }

  /**
   * Two-layer levels: for every roll that would flip gravity, show where the whole move would leave
   * the block on the other floor (after any belts or pads up there).
   */
  private updatePreviews(): void {
    const level = this.level;
    if (!level?.ceiling) return this.world.showFlipPreviews([]);
    const layer = this.state.layer ?? 0;
    const spots = DIRS.map((d) => step(level, this.state, d))
      .filter((r) => r.motions.some((m) => m.kind === 'flip') && (r.state.layer ?? 0) !== layer)
      .map((r) => r.state.block);
    this.world.showFlipPreviews(spots);
  }

  private drainQueue(): void {
    const next = this.queued;
    this.queued = null;
    if (next) void this.move(next);
  }

  private undo(): void {
    if (!this.level || (this.status !== 'playing' && this.status !== 'fallen')) return;
    const prev = this.history.pop();
    if (!prev) return;
    this.state = prev;
    this.moves--;
    this.status = 'playing';
    this.world.syncState(prev);
    this.updatePreviews();
    this.hideModals();
    this.renderChrome();
  }

  private restart(): void {
    if (!this.level || this.status === 'loading' || this.status === 'busy') return;
    this.state = initialState(this.level);
    this.history = [];
    this.moves = 0;
    this.status = 'playing';
    this.world.syncState(this.state);
    this.updatePreviews();
    this.hideModals();
    this.renderChrome();
  }

  private recordWin(): void {
    const stars = starsFor(this.moves, this.par);
    const key = this.levelKey();
    const prev = this.progress.best[key];
    if (prev === undefined) {
      this.progress.streak++;
      this.progress.bestStreak = Math.max(this.progress.bestStreak, this.progress.streak);
      if (this.mode.kind === 'gen') this.progress.tiers[this.mode.tier].solved++;
    }
    if (prev === undefined || stars > prev) {
      if (this.mode.kind === 'gen') this.progress.tiers[this.mode.tier].stars += stars - (prev ?? 0);
      this.progress.best[key] = stars;
    }
    saveProgress(this.progress);

    $('win-stars').innerHTML = [1, 2, 3].map((n) => `<span class="${n <= stars ? 'on' : 'off'}">★</span>`).join('');
    const verdict = this.moves <= this.par ? 'Perfect: you matched par!' : `Par is ${this.par}. Can you find a shorter way?`;
    $('win-detail').textContent = `${this.moves} moves. ${verdict}`;
    $('win').classList.remove('hidden');
    this.renderChrome();
  }

  // -------------------------------------------------------------------------
  // UI.

  private levelKey(): string {
    return this.mode.kind === 'hand' ? `level:${this.mode.id}` : `${this.mode.tier}:${this.mode.seed}`;
  }

  private renderChrome(): void {
    const tabKey = this.mode.kind === 'hand' ? 'hand' : this.mode.tier;
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === tabKey);
    });
    $('moves').textContent = String(this.moves);
    $('par').textContent = this.level && this.status !== 'loading' ? String(this.par) : '–';
    const best = this.progress.best[this.levelKey()];
    $('best').textContent = best ? '★'.repeat(best) : '–';
    if (this.mode.kind === 'hand') {
      // The id leads so playtest notes can quote it.
      const h = findLevel(this.mode.id)!;
      $('level-info').textContent = `${h.id} · ${h.name}: ${h.idea}`;
    } else {
      $('level-info').textContent = `${capitalize(this.mode.tier)} · seed ${this.mode.seed}`;
    }
  }

  private toast(message: string, ms = 1800): void {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    if (ms > 0) this.toastTimer = window.setTimeout(() => this.hideToast(), ms);
  }

  private hideToast(): void {
    $('toast').classList.remove('show');
  }

  private hideModals(): void {
    $('win').classList.add('hidden');
    $('fell').classList.add('hidden');
    $('stats').classList.add('hidden');
    this.map.hide();
    this.hideToast();
  }

  /** Esc: close the map or the stats panel. */
  private escape(): void {
    if (this.map.isOpen) this.map.hide();
    else $('stats').classList.add('hidden');
  }

  private showMap(): void {
    this.map.show(this.progress, this.mode.kind === 'hand' ? this.mode.id : null);
  }

  private showStats(): void {
    const p = this.progress;
    const rows = TIERS.map((t) => {
      const s = p.tiers[t];
      const avg = s.solved ? (s.stars / s.solved).toFixed(1) : '–';
      return `<tr><td>${capitalize(t)}</td><td>${s.solved}</td><td>${avg}</td></tr>`;
    }).join('');
    $('stats-table').innerHTML =
      `<tr><th>Tier</th><th>Solved</th><th>Avg ★</th></tr>${rows}` +
      `<tr><td colspan="3">Current streak: <b>${p.streak}</b> · Best streak: <b>${p.bestStreak}</b></td></tr>`;
    $('stats').classList.remove('hidden');
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.toast('Link copied: send it to a friend!');
    } catch {
      this.toast(location.href, 5000);
    }
  }

  private bindUi(): void {
    const click = (id: string, fn: () => void) =>
      $(id).addEventListener('click', (e) => {
        (e.currentTarget as HTMLElement).blur();
        fn();
      });

    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        b.blur();
        const m = b.dataset.mode!;
        if (m === 'hand') this.showMap();
        else this.load({ kind: 'gen', tier: m as Tier, seed: randomSeed() });
      });
    });
    click('btn-new', () => this.nextLevel());
    click('btn-restart', () => this.restart());
    click('btn-undo', () => this.undo());
    click('btn-link', () => void this.copyLink());
    click('btn-stats', () => this.showStats());
    click('win-next', () => this.nextLevel());
    click('win-retry', () => this.restart());
    click('fell-undo', () => this.undo());
    click('fell-retry', () => this.restart());
    click('fell-next', () => this.nextLevel());
    click('stats-close', () => $('stats').classList.add('hidden'));
    click('btn-map', () => this.showMap());
    focusKeys(() => this.escape());

    // Peeking lasts while Space is held; losing focus ends it too.
    window.addEventListener('keyup', (e) => e.code === 'Space' && this.world.setPeek(false));
    window.addEventListener('blur', () => this.world.setPeek(false));

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.map.isOpen) {
        if (this.map.key(e)) e.preventDefault();
        return;
      }
      if (e.code in KEY_DIRS) {
        e.preventDefault();
        if (e.repeat) return;
        void this.move(this.world.gridDirForScreen(KEY_DIRS[e.code]));
        return;
      }
      if (e.code === 'Space' && this.world.twoLayers) {
        e.preventDefault();
        if (!e.repeat) this.world.setPeek(true);
        return;
      }
      switch (e.code) {
        case 'KeyQ':
          this.world.rotateCamera(-1);
          break;
        case 'KeyE':
          this.world.rotateCamera(1);
          break;
        case 'KeyZ':
          this.undo();
          break;
        case 'KeyR':
          this.restart();
          break;
        case 'KeyN':
          this.nextLevel();
          break;
        case 'Enter':
          if (this.status === 'won') this.nextLevel();
          else if (this.status === 'fallen') this.restart();
          break;
        case 'KeyL':
          this.showMap();
          break;
        case 'Escape':
          this.escape();
          break;
      }
    });
  }
}

function modeFromUrl(progress: Progress): Mode {
  const params = new URLSearchParams(location.search);
  if (!location.search) return { kind: 'hand', id: (suggestedLevel(progress) ?? HANDMADE[0]).id };
  const id = params.get('level');
  if (id && findLevel(id)) return { kind: 'hand', id };
  // Links from v1 numbered the reference levels, which are now the tutorial chapter.
  const ref = params.get('ref');
  if (ref && findLevel(`tutorial-0${ref}`)) return { kind: 'hand', id: `tutorial-0${ref}` };
  const tier = params.get('tier') as Tier | null;
  return {
    kind: 'gen',
    tier: tier && TIERS.includes(tier) ? tier : 'easy',
    seed: params.get('seed') || randomSeed(),
  };
}

function modeToQuery(mode: Mode): string {
  return mode.kind === 'hand' ? `?level=${mode.id}` : `?tier=${mode.tier}&seed=${encodeURIComponent(mode.seed)}`;
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Keep a hidden read-only text field focused. Vim-style browser extensions (Vimium, Vimium C,
 * Surfingkeys, Tridactyl) and Firefox's find-as-you-type pass keys through while a text field
 * has focus, so N, R, D and friends reach the game instead of the extension.
 *
 * Esc is the exception: those extensions swallow it and just blur the field. So a blur that no
 * click or Tab explains, while the page keeps focus, counts as Esc (`onEscape`).
 */
function focusKeys(onEscape: () => void): void {
  const sink = $<HTMLInputElement>('keys');
  let explained = 0;
  const explain = () => (explained = performance.now());
  window.addEventListener('pointerdown', explain, true);
  window.addEventListener('keydown', (e) => e.code === 'Tab' && explain(), true);
  const refocus = () => {
    if (document.activeElement !== sink) sink.focus({ preventScroll: true });
  };
  sink.addEventListener('blur', () => {
    if (document.hasFocus() && performance.now() - explained > 300) onEscape();
    // Clicking a button or an extension's Esc moves focus away; take it back.
    window.setTimeout(refocus, 0);
  });
  window.addEventListener('focus', refocus);
  refocus();
}

let revealed: Promise<void> | null = null;

/** Fade the splash out once fonts are in (or after 2s), so the first thing seen is the styled game. */
function revealPage(): Promise<void> {
  revealed ??= Promise.race([document.fonts.ready, new Promise((r) => window.setTimeout(r, 2000))]).then(
    () =>
      new Promise<void>((resolve) => {
        $('splash').classList.add('gone');
        window.setTimeout(resolve, 250);
      }),
  );
  return revealed;
}

function bootFailed(title: string, html: string): void {
  $('splash').classList.add('failed');
  $('splash-status').textContent = title;
  $('splash-help').innerHTML = html;
}

if (!hasWebGL()) {
  bootFailed(
    'Your browser has 3D graphics turned off',
    `Skytumble needs WebGL, and this browser didn't provide it.<br><br>
     <b>Firefox:</b> open <code>about:support</code> and check the <i>WebGL 2 Driver Renderer</i> line.
     If it says blocked or unavailable, enable hardware acceleration in Settings → General → Performance,
     and if Firefox is a Flatpak, run <code>flatpak update</code> to install matching graphics drivers.<br>
     <b>Chrome:</b> Settings → System → turn on <i>Use graphics acceleration when available</i>.<br><br>
     Then reload this page.`,
  );
} else {
  try {
    new Game();
  } catch (err) {
    console.error(err);
    bootFailed('Skytumble failed to start', `<code>${String(err)}</code><br><br>Check the browser console for details.`);
  }
}
