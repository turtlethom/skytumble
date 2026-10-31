import './style.css';
import { randomSeed } from './game/rng';
import { initialState, step } from './game/rules';
import { solve } from './game/solver';
import { Dir, Level, State, TIERS, Tier } from './game/types';
import { REFERENCE_LEVELS } from './levels/reference';
import { World } from './render/world';
import { loadProgress, saveProgress, starsFor } from './ui/progress';
import type { GenerateRequest, GenerateResponse } from './worker';

type Mode = { kind: 'gen'; tier: Tier; seed: string } | { kind: 'ref'; index: number };
type Status = 'loading' | 'playing' | 'busy' | 'fallen' | 'won';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Clockwise grid directions; screen directions index into this after camera rotation. */
const CLOCKWISE: Dir[] = ['up', 'right', 'down', 'left'];
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

  constructor() {
    this.mode = modeFromUrl();
    this.worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
      if (e.data.id === this.requestId) void this.start(e.data.level, e.data.par);
    };
    this.bindUi();
    this.load(this.mode);
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

    if (mode.kind === 'ref') {
      const level = REFERENCE_LEVELS[mode.index].level;
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
    await this.world.setLevel(level, this.state);
    this.status = 'playing';
    this.drainQueue();
  }

  private nextLevel(): void {
    const prevKey = this.levelKey();
    if (this.status !== 'won' && this.progress.best[prevKey] === undefined) {
      // Skipping an unsolved level ends the streak.
      this.progress.streak = 0;
      saveProgress(this.progress);
    }
    if (this.mode.kind === 'ref') {
      this.load({ kind: 'ref', index: (this.mode.index + 1) % REFERENCE_LEVELS.length });
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
    this.renderChrome();

    await this.world.roll(from.block, result.state.block, dir);
    this.world.pressSwitches(result.pressed);
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
    this.drainQueue();
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
    return this.mode.kind === 'ref' ? `ref:${this.mode.index}` : `${this.mode.tier}:${this.mode.seed}`;
  }

  private renderChrome(): void {
    const tabKey = this.mode.kind === 'ref' ? 'ref' : this.mode.tier;
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === tabKey);
    });
    $('moves').textContent = String(this.moves);
    $('par').textContent = this.level && this.status !== 'loading' ? String(this.par) : '–';
    const best = this.progress.best[this.levelKey()];
    $('best').textContent = best ? '★'.repeat(best) : '–';
    if (this.mode.kind === 'ref') {
      const ref = REFERENCE_LEVELS[this.mode.index];
      $('level-info').textContent = `${this.mode.index + 1}/${REFERENCE_LEVELS.length} · ${ref.name}: ${ref.idea}`;
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
    this.hideToast();
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
        if (m === 'ref') this.load({ kind: 'ref', index: 0 });
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

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code in KEY_DIRS) {
        e.preventDefault();
        if (e.repeat) return;
        const screen = KEY_DIRS[e.code];
        void this.move(CLOCKWISE[(screen - this.world.cameraIndex + 4) % 4]);
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
        case 'Escape':
          $('stats').classList.add('hidden');
          break;
      }
    });
  }
}

function modeFromUrl(): Mode {
  const params = new URLSearchParams(location.search);
  const ref = Number(params.get('ref'));
  if (ref >= 1 && ref <= REFERENCE_LEVELS.length) return { kind: 'ref', index: ref - 1 };
  const tier = params.get('tier') as Tier | null;
  return {
    kind: 'gen',
    tier: tier && TIERS.includes(tier) ? tier : 'easy',
    seed: params.get('seed') || randomSeed(),
  };
}

function modeToQuery(mode: Mode): string {
  return mode.kind === 'ref' ? `?ref=${mode.index + 1}` : `?tier=${mode.tier}&seed=${encodeURIComponent(mode.seed)}`;
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
