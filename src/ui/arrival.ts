const FADE_IN_MS = 300;
const HOLD_MS = 1400;
/** The fade-out in style.css (0.5 s), plus a margin: the motifs keep drifting until it has finished. */
const FADE_OUT_MS = 600;

/** The moment of entering a chapter: the page fades to the world's color, shows its name, and lifts. */
export class ChapterArrival {
  private skip: (() => void) | null = null;
  private plays = 0;

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
    // The motifs drift under the class `drift`, kept on through the fade-out: dropping it with `show`
    // stopped the animation mid-fade and snapped them back to where they started. Re-adding it after a
    // reflow restarts the drift for this entry.
    const play = ++this.plays;
    this.el.classList.remove('drift');
    void this.el.offsetWidth;
    this.el.classList.add('show', 'drift');
    const skipped = new Promise<void>((resolve) => (this.skip = resolve));
    const wait = (ms: number) => Promise.race([new Promise<void>((r) => window.setTimeout(r, ms)), skipped]);
    const covered = wait(FADE_IN_MS);
    const lifted = covered
      .then(() => wait(HOLD_MS))
      .then(() => {
        this.skip = null;
        this.el.classList.remove('show');
        window.setTimeout(() => {
          if (play === this.plays) this.el.classList.remove('drift');
        }, FADE_OUT_MS);
      });
    return { covered, lifted };
  }

  dismiss(): void {
    this.skip?.();
  }
}
