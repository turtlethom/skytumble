/** Hidden frame-rate readout: F toggles it, `?fps` opens with it on. Reports once a second. */
export class FrameReadout {
  private raf = 0;

  constructor(
    private el: HTMLElement,
    private stats: () => { calls: number; triangles: number },
  ) {}

  toggle(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    this.el.textContent = 'Measuring…';
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let slowest = 0;
    const tick = (now: number) => {
      slowest = Math.max(slowest, now - last);
      last = now;
      frames++;
      if (now - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (now - windowStart));
        const { calls, triangles } = this.stats();
        this.el.textContent = `${fps} fps · slowest ${Math.round(slowest)} ms · ${Math.round(triangles / 1000)}k triangles · ${calls} draws`;
        windowStart = now;
        frames = 0;
        slowest = 0;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
