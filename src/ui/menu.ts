// A list of buttons driven by mouse or keyboard: the main menu, the Esc menu and Settings.
// Its root holds `[data-action]` buttons; Esc is handled by the game, which knows what's underneath.

const STEP: Record<string, number> = { ArrowUp: -1, KeyW: -1, ArrowDown: 1, KeyS: 1 };

export class Menu {
  private selected: HTMLButtonElement | null = null;

  constructor(
    private root: HTMLElement,
    private onAction: (action: string) => void,
    /** Runs each time the menu opens, to refresh anything that depends on progress. */
    private beforeShow: (root: HTMLElement) => void = () => {},
    /** Runs whenever the keyboard or the pointer lands on an entry. */
    private onSelect: (button: HTMLButtonElement) => void = () => {},
  ) {
    root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!button) return;
      this.select(button);
      this.onAction(button.dataset.action!);
    });
    root.addEventListener('mouseover', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]:not(:disabled)');
      if (button) this.select(button);
    });
  }

  private get items(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll<HTMLButtonElement>('[data-action]:not(:disabled)')];
  }

  /** Opens where it was left, or else on the suggested entry, or else the first. */
  show(): void {
    this.beforeShow(this.root);
    this.root.classList.remove('hidden');
    this.select(this.selected ?? this.root.querySelector<HTMLButtonElement>('[data-action].suggested') ?? this.items[0]);
  }

  /** The next time it opens, start from the top, so a dangerous choice is never left selected. */
  forget(): void {
    this.selected?.classList.remove('selected');
    this.selected = null;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** Handle a key while the menu is open. Returns true if the menu used it. */
  key(e: KeyboardEvent): boolean {
    if (e.code in STEP) {
      const items = this.items;
      const at = items.indexOf(this.selected!);
      this.select(items[(at + STEP[e.code] + items.length) % items.length]);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (!e.repeat && this.selected) this.onAction(this.selected.dataset.action!);
    } else {
      return false;
    }
    return true;
  }

  private select(button: HTMLButtonElement): void {
    this.selected?.classList.remove('selected');
    this.selected = button;
    button.classList.add('selected');
    this.onSelect(button);
  }
}
