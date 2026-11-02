const FADE_IN_MS = 300;
const HOLD_MS = 1400;

/** The moment of entering a chapter: the page fades to the world's color, shows its name, and lifts. */
export class ChapterArrival {
  private skip: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('click', () => this.dismiss());
  }

  /** While true, a key press only skips the title, so it can never count as a move. */
  get active(): boolean {
    return this.skip !== null;
  }

  /**
   * Resolves `covered` once the page is hidden, ready to swap the level underneath, and `lifted`
   * as the title starts to fade away. Skipping resolves both at once.
   */
  play(name: string, theme: string): { covered: Promise<void>; lifted: Promise<void> } {
    this.el.textContent = name;
    this.el.dataset.theme = theme;
    this.el.classList.add('show');
    const skipped = new Promise<void>((resolve) => (this.skip = resolve));
    const wait = (ms: number) => Promise.race([new Promise<void>((r) => window.setTimeout(r, ms)), skipped]);
    const covered = wait(FADE_IN_MS);
    const lifted = covered
      .then(() => wait(HOLD_MS))
      .then(() => {
        this.skip = null;
        this.el.classList.remove('show');
      });
    return { covered, lifted };
  }

  dismiss(): void {
    this.skip?.();
  }
}
