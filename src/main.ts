import './style.css';
import { randomSeed } from './game/rng';
import { initialState, step } from './game/rules';
import { solve } from './game/solver';
import { DIRS, Dir, Level, State, TIERS, Tier } from './game/types';
import { CAMPAIGN, LABS, TUTORIAL, chapterOf, findLevel, lessonUnlocked, nextOnTrack, trackOf } from './levels';
import { isLesson, lessonDone, lessonPrompt } from './levels/lessons';
import { HandmadeLevel } from './levels/format';
import { MECHANICS, Mechanic, mechanicsIn } from './levels/mechanics';
import { MENU_LEVEL } from './levels/menuScene';
import { tileSheet, toySampleFloor } from './levels/sheet';
import { NEUTRAL, THEMES, Theme, themeForLevel } from './render/themes';
import { World } from './render/world';
import { ChapterArrival } from './ui/arrival';
import { FrameReadout } from './ui/fps';
import { esc } from './ui/html';
import { SkyMap, firstUnsolved, signatureBadge } from './ui/map';
import { Menu } from './ui/menu';
import { loadProgress, resetProgress, saveProgress, starsFor } from './ui/progress';
import type { GenerateRequest, GenerateResponse } from './worker';

type Mode = { kind: 'menu' } | { kind: 'gen'; tier: Tier; seed: string } | { kind: 'hand'; id: string };
type Status = 'loading' | 'playing' | 'busy' | 'fallen' | 'won';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const CHAIN_BEAT_MS = 110;
/** The menu's block rests this long between rolls, and this long after sinking into the goal. */
const MENU_ROLL_GAP_MS = 90;
const MENU_REST_MS = 450;
/** How far the menu's island sits right of center, as a share of the screen's width. */
const MENU_VIEW_SHIFT = 0.17;
/** How To Play's scenes go slowly enough to follow, and rest longer between runs. */
const HOWTO_ROLL_GAP_MS = 240;
const HOWTO_REST_MS = 800;
/** An extension's Esc can arrive as both a key and a lost focus: count them once. */
const ESC_REPEAT_MS = 200;
const FELL_DETAIL = 'Take back the last move, or try the island again.';

/** A screen over the game. The top one takes the keys, and Esc returns to the one below. */
interface Panel {
  show(): void;
  hide(): void;
  key(e: KeyboardEvent): boolean;
}

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
  private map = new SkyMap($('map'), CAMPAIGN, signatureBadge, true, (id) => this.load({ kind: 'hand', id }), () => this.back());
  private labs = new SkyMap($('labs'), LABS, () => null, false, (id) => this.load({ kind: 'hand', id }), () => this.back());
  private mapPanel: Panel = {
    show: () => this.map.show(this.progress, this.playingId(), this.backLabel()),
    hide: () => this.map.hide(),
    key: (e) => this.map.key(e),
  };
  private labsPanel: Panel = {
    show: () => this.labs.show(this.progress, this.playingId(), this.backLabel()),
    hide: () => this.labs.hide(),
    key: (e) => this.labs.key(e),
  };
  private mainMenu = new Menu(
    $('main-menu'),
    (action) => this.mainMenuAction(action),
    (root) => {
      // The Tutorial stands out until a lesson has been solved.
      const fresh = !TUTORIAL.levels.some((l) => this.progress.best[`level:${l.id}`] !== undefined);
      root.querySelector('[data-action=tutorial]')!.classList.toggle('suggested', fresh);
      root.querySelector('[data-action=campaign]')!.classList.toggle('suggested', !fresh);
    },
  );
  private howTo = new Menu(
    $('howto'),
    (action) => action === 'back' && this.back(),
    (root) => this.refreshHowTo(root),
    (button) => this.previewMechanic(button.dataset.mechanic),
  );
  private howToPanel: Panel = {
    show: () => {
      this.howTo.forget();
      this.shownMechanic = null;
      this.howTo.show();
    },
    // How To Play has the world to itself, so give it back to the main menu's scene.
    hide: () => {
      this.howTo.hide();
      this.scene++;
      this.world.finishAnimations();
      void this.playMenuScene();
    },
    key: (e) => this.howTo.key(e),
  };
  /** The mechanic How To Play is showing. */
  private shownMechanic: string | null = null;
  private pause = new Menu($('pause'), (action) => this.pauseAction(action), () => {
    // The Tutorial is self-contained: its Esc menu leads to its own levels, not the sky map.
    const button = $('pause-map');
    button.dataset.action = this.lessonId() ? 'levels' : 'map';
    button.textContent = this.lessonId() ? 'Levels' : 'Map';
  });
  private lessons = new Menu(
    $('lessons'),
    (action) => (action === 'back' ? this.back() : this.load({ kind: 'hand', id: action })),
    (root) => this.refreshLessons(root),
  );
  private settings = new Menu($('settings'), (action) => (action === 'reset' ? this.open(this.confirmReset) : this.back()));
  private confirmReset = new Menu($('confirm-reset'), (action) => this.confirmResetAction(action));
  /** The open screens, bottom first; empty during play. */
  private panels: Panel[] = [];
  private lastEscape = -Infinity;
  private arrival = new ChapterArrival($('arrival'));
  /** The chapter last announced: entering a different one shows its title. */
  private lastChapter: string | null = null;
  private readout = new FrameReadout($('fps'), () => this.world.renderStats);
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
  /** Counts what the world has been asked to show, so work overtaken by a newer request can stop. */
  private scene = 0;
  /** The block's animation in progress, which must finish before the world is rebuilt. */
  private animating: Promise<unknown> = Promise.resolve();
  /** A theme forced from the URL, to preview it on any level. */
  private themeOverride: Theme | null = null;

  constructor() {
    this.mode = modeFromUrl();
    this.worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
      if (e.data.id === this.requestId) void this.start(e.data.level, e.data.par);
    };
    this.bindUi();
    $('lessons').querySelector('nav')!.prepend(...TUTORIAL.levels.map(lessonButton));
    const [basics, others] = $('howto').querySelectorAll('h3');
    basics.after(...MECHANICS.filter((m) => m.basic).map(mechanicButton));
    others.after(...MECHANICS.filter((m) => !m.basic).map(mechanicButton));
    // For the headless play driver (scripts/design/play.mjs): which arrow key (0 up, 1 right, 2 down,
    // 3 left) rolls the block in a grid direction from the current view.
    (window as unknown as { skytumbleKeyFor: (d: Dir) => number }).skytumbleKeyFor = (d) =>
      [0, 1, 2, 3].find((k) => this.world.gridDirForScreen(k) === d) ?? -1;
    const params = new URLSearchParams(location.search);
    this.themeOverride = THEMES[params.get('theme') ?? params.get('sheet') ?? ''] ?? null;
    if (params.has('fps')) this.readout.toggle();
    // For approving a theme's readability without relying on color.
    if (params.has('gray')) document.documentElement.style.filter = 'grayscale(1)';
    if (params.has('summit') && params.has('sheet')) {
      void this.start(toySampleFloor(), 0).then(() => this.world.showReindeer());
      return;
    }
    if (params.has('aerie') && params.has('sheet')) {
      void this.start(toySampleFloor(), 0).then(() => this.world.showAerie());
      return;
    }
    if (params.has('toys')) {
      void this.start(toySampleFloor(), 0).then(() => this.world.showToySamples());
      return;
    }
    if (params.has('sheet')) {
      void this.start(tileSheet(Number(params.get('bridges') ?? 15)), 0);
      return;
    }
    this.load(this.mode);
  }

  // -------------------------------------------------------------------------
  // Loading levels.

  private load(mode: Mode): void {
    this.scene++;
    this.world.finishAnimations();
    const id = ++this.requestId;
    this.mode = mode;
    this.status = 'loading';
    this.queued = null;
    this.hideModals();
    this.showPrompt('');
    document.body.classList.toggle('at-menu', mode.kind === 'menu');
    this.renderChrome();
    history.replaceState(null, '', modeToQuery(mode));

    if (mode.kind === 'menu') {
      this.level = null;
      this.open(this.mainMenu);
      void this.playMenuScene();
      return;
    }
    if (mode.kind === 'hand') {
      const level = findLevel(mode.id)!.level;
      this.noteMechanics(level);
      void this.start(level, solve(level)!.moves.length);
      return;
    }
    const loading = window.setTimeout(() => $('loading').classList.add('show'), 150);
    const clear = () => window.clearTimeout(loading);
    this.worker.addEventListener('message', clear, { once: true });
    const req: GenerateRequest = { id, tier: mode.tier, seed: mode.seed };
    this.worker.postMessage(req);
  }

  private async start(level: Level, par: number): Promise<void> {
    const scene = this.scene;
    await this.animating;
    await revealPage();
    if (scene !== this.scene) return;
    $('loading').classList.remove('show');
    this.level = level;
    this.par = par;
    this.state = initialState(level);
    this.history = [];
    this.moves = 0;
    this.status = 'busy';
    this.renderChrome();
    const arrival = this.playArrival();
    if (arrival) await arrival.covered;
    if (scene !== this.scene) return;
    this.world.setViewShift(0);
    await this.world.setLevel(level, this.state, this.currentTheme(), arrival?.lifted);
    if (scene !== this.scene) return;
    this.status = 'playing';
    this.updatePreviews();
    this.updatePrompt();
    this.drainQueue();
  }

  private currentTheme(): Theme {
    return this.themeOverride ?? (this.mode.kind === 'hand' ? themeForLevel(this.mode.id) : NEUTRAL);
  }

  /** The main menu's island: the block drops in and solves its puzzle on the real rules, over and over. */
  private playMenuScene(): Promise<void> {
    return this.playScene(MENU_LEVEL, solve(MENU_LEVEL)!.moves, NEUTRAL, MENU_ROLL_GAP_MS, MENU_REST_MS);
  }

  /** Play these moves on the real rules, over and over, until another scene takes over the world. */
  private async playScene(level: Level, moves: Dir[], theme: Theme, rollGap: number, rest: number): Promise<void> {
    const scene = this.scene;
    await this.animating;
    await revealPage();
    if (scene !== this.scene) return;
    const start = initialState(level);
    const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    this.lastChapter = null;
    this.world.setViewShift(MENU_VIEW_SHIFT);
    await this.world.setLevel(level, start, theme);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (;;) {
      let state = start;
      for (const dir of moves) {
        await pause(rollGap);
        if (scene !== this.scene) return;
        const result = step(level, state, dir);
        this.animating = this.animateStep(state, result, dir, scene);
        await this.animating;
        if (scene !== this.scene) return;
        state = result.state;
      }
      this.animating = this.world.win();
      await this.animating;
      await pause(rest);
      if (scene !== this.scene) return;
      this.animating = this.world.setBridges(start.bridges);
      await this.animating;
      if (scene !== this.scene) return;
      this.world.syncState(start);
      this.animating = this.world.dropBlock();
      await this.animating;
      if (scene !== this.scene) return;
    }
  }

  /** Show the chapter's name if this is a new chapter. */
  private playArrival(): ReturnType<ChapterArrival['play']> | null {
    const chapter = this.mode.kind === 'hand' ? chapterOf(this.mode.id) : undefined;
    const entered = chapter && chapter.id !== this.lastChapter;
    this.lastChapter = chapter?.id ?? null;
    return entered ? this.arrival.play(chapter.title, this.currentTheme().id) : null;
  }

  private nextLevel(): void {
    if (this.mode.kind === 'menu' || this.lessonLocksNext()) return;
    const prevKey = this.levelKey();
    if (this.status !== 'won' && this.progress.best[prevKey] === undefined) {
      // Skipping an unsolved level ends the streak.
      this.progress.streak = 0;
      saveProgress(this.progress);
    }
    if (this.mode.kind === 'hand') {
      const next = nextOnTrack(this.mode.id);
      if (next) this.load({ kind: 'hand', id: next.id });
      // The end of the track: the Tutorial leads on to the campaign's map.
      else this.open(trackOf(this.mode.id) === LABS ? this.labsPanel : this.mapPanel);
    } else {
      this.load({ kind: 'gen', tier: this.mode.tier, seed: randomSeed() });
    }
  }

  // -------------------------------------------------------------------------
  // Playing.

  private move(dir: Dir): void {
    if (!this.level) return;
    if (this.status === 'busy') {
      this.queued = dir;
      return;
    }
    if (this.status !== 'playing') return;
    this.animating = this.playMove(this.level, dir);
  }

  private async playMove(level: Level, dir: Dir): Promise<void> {
    const scene = this.scene;
    const from = this.state;
    const result = step(level, from, dir);
    if (result.outcome === 'bump') {
      // Not a move: nothing to count or undo.
      this.status = 'busy';
      await this.animateStep(from, result, dir, scene);
      if (scene !== this.scene) return;
      this.status = 'playing';
      this.drainQueue();
      return;
    }
    this.history.push(from);
    this.moves++;
    this.status = 'busy';
    this.world.showFlipPreviews([]);
    this.renderChrome();

    await this.animateStep(from, result, dir, scene);
    if (scene !== this.scene) return;
    this.state = result.state;

    if (result.outcome === 'fall') {
      this.queued = null;
      await this.world.fall(level, result.state.block, result.broke);
      if (scene !== this.scene) return;
      this.status = 'fallen';
      // In the Tutorial the panel says what went wrong, in place of the prompt.
      const id = this.lessonId();
      $('fell-detail').innerHTML = id ? keysIn(lessonPrompt(id, { level, state: result.state, before: from, last: result, moves: this.moves })) : FELL_DETAIL;
      this.showPrompt('');
      $('fell').classList.remove('hidden');
      return;
    }
    if (result.outcome === 'win') {
      this.queued = null;
      await this.world.win();
      if (scene !== this.scene) return;
      this.status = 'won';
      this.showPrompt('');
      this.recordWin();
      return;
    }
    this.status = 'playing';
    this.updatePreviews();
    this.updatePrompt(from, result);
    this.drainQueue();
  }

  /** Show one move: the roll, whatever carries the block after it, and the switches it presses. */
  private async animateStep(from: State, result: ReturnType<typeof step>, dir: Dir, scene: number): Promise<void> {
    if (result.bumped) return this.world.bump(from.block, result.bumped, dir, !!result.knocked, result.bridged);
    await this.world.roll(from.block, result.rolled, dir);
    for (const [i, motion] of result.motions.entries()) {
      // A short beat between chained motions so slide → push → slide reads as three events.
      if (i > 0) await new Promise((r) => window.setTimeout(r, CHAIN_BEAT_MS));
      await this.world.move(motion);
      if (scene !== this.scene) return;
    }
    if (scene !== this.scene) return;
    this.world.pressSwitches(result.pressed);
    if (result.reshaped) {
      const before = result.motions.length ? result.motions[result.motions.length - 1].to : result.rolled;
      await this.world.reshape(before, result.state.block);
    }
    await Promise.all([result.toggled ? this.world.setBridges(result.state.bridges) : null, this.world.setWalls(result.state)]);
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
    if (next) this.move(next);
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
    this.updatePrompt();
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
    this.updatePrompt();
    this.renderChrome();
  }

  private recordWin(): void {
    const lesson = this.lessonId();
    // A lesson is done or not done, which counts as one star in the save.
    const stars = lesson ? 1 : starsFor(this.moves, this.par);
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

    $('win-title').textContent = lesson ? 'Lesson done!' : 'Landed!';
    $('win-stars').innerHTML = lesson ? '' : [1, 2, 3].map((n) => `<span class="${n <= stars ? 'on' : 'off'}">★</span>`).join('');
    if (lesson) {
      $('win-detail').innerHTML = keysIn(lessonDone(lesson));
    } else {
      const verdict = this.moves <= this.par ? 'Perfect: you matched par!' : `Par is ${this.par}. Can you find a shorter way?`;
      $('win-detail').textContent = `${this.moves} moves. ${verdict}`;
    }
    $('win').classList.remove('hidden');
    this.renderChrome();
  }

  // -------------------------------------------------------------------------
  // UI.

  private levelKey(): string {
    if (this.mode.kind === 'menu') return '';
    return this.mode.kind === 'hand' ? `level:${this.mode.id}` : `${this.mode.tier}:${this.mode.seed}`;
  }

  private playingId(): string | null {
    return this.mode.kind === 'hand' ? this.mode.id : null;
  }

  /** The level being played, if it's a Tutorial lesson. */
  private lessonId(): string | null {
    const id = this.playingId();
    return id && isLesson(id) ? id : null;
  }

  /** A lesson has to be done before the one after it opens, so it can't be skipped. */
  private lessonLocksNext(): boolean {
    const id = this.lessonId();
    return !!id && !this.lessonDone(id);
  }

  private lessonDone = (id: string): boolean => this.progress.best[`level:${id}`] !== undefined;

  /** Let the lesson react to where things stand. `from` and `last` are the move just made, if any. */
  private updatePrompt(from: State | null = null, last: ReturnType<typeof step> | null = null): void {
    const id = this.lessonId();
    if (!id || !this.level) return this.showPrompt('');
    this.showPrompt(lessonPrompt(id, { level: this.level, state: this.state, before: from, last, moves: this.moves }));
  }

  private showPrompt(text: string): void {
    const el = $('prompt');
    el.classList.toggle('hidden', !text);
    if (text === el.dataset.text) return;
    el.dataset.text = text;
    el.innerHTML = keysIn(text);
    // Restart the little pop, so a new line gets noticed.
    el.classList.remove('changed');
    void el.offsetWidth;
    el.classList.add('changed');
  }

  /** What the win panel's main button leads to. */
  private nextLabel(): string {
    const id = this.playingId();
    if (id && nextOnTrack(id) && isLesson(id)) return 'Next lesson';
    if (!id || nextOnTrack(id)) return 'Next level';
    const track = trackOf(id);
    return track === LABS ? 'Back to the Labs' : track === CAMPAIGN ? 'Sky map' : 'Start the Campaign';
  }

  private renderChrome(): void {
    if (this.mode.kind === 'menu') return;
    // The Tutorial is done or not done: no moves, par or stars.
    const lesson = this.lessonId();
    document.body.classList.toggle('in-lesson', !!lesson);
    document.querySelectorAll('.next-label').forEach((el) => (el.textContent = this.nextLabel()));
    $('btn-new').hidden = $('fell-next').hidden = this.lessonLocksNext();
    $('btn-map').textContent = lesson ? 'Levels' : 'Map';
    $('moves').textContent = String(this.moves);
    $('par').textContent = this.level && this.status !== 'loading' ? String(this.par) : '–';
    const best = this.progress.best[this.levelKey()];
    $('best').textContent = best ? '★'.repeat(best) : '–';
    if (this.mode.kind === 'hand') {
      // The id leads so playtest notes can quote it.
      const h = findLevel(this.mode.id)!;
      $('level-info').textContent = lesson ? `${h.id} · ${h.name}` : `${h.id} · ${h.name}: ${h.idea}`;
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
    for (const panel of this.panels) panel.hide();
    this.panels = [];
    this.syncPanelsOpen();
    this.hideToast();
  }

  // -------------------------------------------------------------------------
  // Menus.

  private get topPanel(): Panel | undefined {
    return this.panels[this.panels.length - 1];
  }

  private open(panel: Panel): void {
    this.topPanel?.hide();
    this.panels.push(panel);
    panel.show();
    this.syncPanelsOpen();
  }

  /** The win and fall panels step aside while a menu is open over them. */
  private syncPanelsOpen(): void {
    document.body.classList.toggle('panel-open', this.panels.length > 0);
  }

  /** Close the top screen and return to the one below, or to the level. */
  private back(): void {
    this.panels.pop()?.hide();
    this.topPanel?.show();
    this.syncPanelsOpen();
  }

  /** What leaving the screen now being opened returns to. */
  private backLabel(): string {
    const below = this.panels[this.panels.length - 2];
    if (!below) return 'Back to the level';
    return below === this.mainMenu ? 'Back to the menu' : 'Back';
  }

  /** Esc: back one screen; during a level, the Esc menu; on the main menu, nothing. */
  private escape(): void {
    const now = performance.now();
    if (now - this.lastEscape < ESC_REPEAT_MS) return;
    this.lastEscape = now;
    if (this.arrival.active) this.arrival.dismiss();
    else if (!this.topPanel) this.openPause();
    else if (this.topPanel !== this.mainMenu) this.back();
  }

  private openPause(): void {
    this.queued = null;
    this.world.setPeek(false);
    this.pause.forget();
    this.open(this.pause);
  }

  /** Reaching a level opens the How To Play entries for what's in it. */
  private noteMechanics(level: Level): void {
    const fresh = mechanicsIn(level).filter((m) => !this.progress.seen.includes(m));
    if (!fresh.length) return;
    this.progress.seen.push(...fresh);
    saveProgress(this.progress);
  }

  /** Whether How To Play shows this entry: always for the basics; others once met, or in any level already solved. */
  private mechanicOpen(m: Mechanic): boolean {
    if (m.basic || this.progress.seen.includes(m.id)) return true;
    return Object.keys(this.progress.best).some((key) => {
      const level = key.startsWith('level:') ? findLevel(key.slice(6))?.level : undefined;
      return !!level && mechanicsIn(level).includes(m.id);
    });
  }

  private refreshHowTo(root: HTMLElement): void {
    root.querySelector('[data-back-label]')!.textContent = this.backLabel();
    for (const m of MECHANICS) {
      const button = root.querySelector<HTMLButtonElement>(`[data-mechanic="${m.id}"]`)!;
      const open = this.mechanicOpen(m);
      button.disabled = !open;
      button.textContent = open ? m.name : '???';
    }
  }

  /** Describe a mechanic and let the world behind the list play it. */
  private previewMechanic(id: string | undefined): void {
    const m = MECHANICS.find((e) => e.id === id);
    if (!m || m.id === this.shownMechanic) return;
    this.shownMechanic = m.id;
    $('howto').querySelector('.howto-text')!.innerHTML = keysIn(m.text);
    this.scene++;
    this.world.finishAnimations();
    void this.playScene(m.level, m.moves, THEMES.studio, HOWTO_ROLL_GAP_MS, HOWTO_REST_MS);
  }

  private openLessons(): void {
    this.lessons.forget();
    this.open(this.lessons);
  }

  /** Show which lessons are done, open and locked; the next one to do is suggested. */
  private refreshLessons(root: HTMLElement): void {
    root.querySelector('[data-back-label]')!.textContent = this.backLabel();
    const next = firstUnsolved([TUTORIAL], this.progress);
    for (const { id } of TUTORIAL.levels) {
      const button = root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
      const open = lessonUnlocked(id, this.lessonDone);
      button.disabled = !open;
      button.classList.toggle('suggested', id === next?.id);
      button.querySelector('.soon')!.textContent = !open ? 'Locked' : this.lessonDone(id) ? 'Done' : id === this.playingId() ? 'Playing' : '';
    }
  }

  private openSettings(): void {
    this.settings.forget();
    this.open(this.settings);
  }

  private mainMenuAction(action: string): void {
    if (action === 'campaign') this.open(this.mapPanel);
    else if (action === 'tutorial') this.openLessons();
    else if (action === 'howto') this.open(this.howToPanel);
    else if (action === 'labs') this.open(this.labsPanel);
    else if (action === 'settings') this.openSettings();
  }

  private pauseAction(action: string): void {
    if (action === 'resume') this.back();
    else if (action === 'map') this.open(this.mapPanel);
    else if (action === 'levels') this.openLessons();
    else if (action === 'settings') this.openSettings();
    else if (action === 'exit') this.load({ kind: 'menu' });
    else if (action === 'restart') {
      this.back();
      this.restart();
    }
  }

  private confirmResetAction(action: string): void {
    if (action === 'confirm') {
      this.progress = resetProgress();
      this.renderChrome();
      this.toast('All progress reset');
    }
    this.confirmReset.forget();
    this.back();
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

    click('btn-menu', () => this.openPause());
    click('btn-new', () => this.nextLevel());
    click('btn-restart', () => this.restart());
    click('btn-undo', () => this.undo());
    click('btn-link', () => void this.copyLink());
    click('win-next', () => this.nextLevel());
    click('win-retry', () => this.restart());
    click('fell-undo', () => this.undo());
    click('fell-retry', () => this.restart());
    click('fell-next', () => this.nextLevel());
    click('btn-map', () => (this.lessonId() ? this.openLessons() : this.open(this.mapPanel)));
    focusKeys(() => this.escape());

    // Peeking lasts while Space is held; losing focus ends it too.
    window.addEventListener('keyup', (e) => e.code === 'Space' && this.world.setPeek(false));
    window.addEventListener('blur', () => this.world.setPeek(false));

    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.arrival.active) {
        e.preventDefault();
        if (!e.repeat) this.arrival.dismiss();
        return;
      }
      if (e.code === 'Escape') {
        if (!e.repeat) this.escape();
        return;
      }
      if (e.code === 'KeyF') {
        this.readout.toggle();
        return;
      }
      if (this.topPanel) {
        if (this.topPanel.key(e)) e.preventDefault();
        return;
      }
      if (e.code in KEY_DIRS) {
        e.preventDefault();
        if (e.repeat) return;
        this.move(this.world.gridDirForScreen(KEY_DIRS[e.code]));
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
      }
    });
  }
}

function modeFromUrl(): Mode {
  const params = new URLSearchParams(location.search);
  if (!location.search) return { kind: 'menu' };
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
  if (mode.kind === 'menu') return location.pathname;
  return mode.kind === 'hand' ? `?level=${mode.id}` : `?tier=${mode.tier}&seed=${encodeURIComponent(mode.seed)}`;
}

/** A mechanic's entry in How To Play. */
function mechanicButton(mechanic: Mechanic): HTMLButtonElement {
  const button = document.createElement('button');
  button.dataset.action = 'look';
  button.dataset.mechanic = mechanic.id;
  return button;
}

/** A lesson's entry in the Tutorial's level list. */
function lessonButton(lesson: HandmadeLevel, i: number): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'lesson';
  button.dataset.action = lesson.id;
  button.innerHTML = `<span>${i + 1}. ${esc(lesson.name)}</span><span class="soon"></span>`;
  return button;
}

/** A line of text, with each `[Z]` in it drawn as a key. */
function keysIn(text: string): string {
  return esc(text).replace(/\[(\w+)\]/g, '<kbd>$1</kbd>');
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
