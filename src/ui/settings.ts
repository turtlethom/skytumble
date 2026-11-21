// Player settings, kept apart from progress so "Reset all progress" leaves them alone.

export interface Settings {
  /** Mark where each possible slide would leave the block. Off by default: reading a slide is part of the puzzle. */
  slidePreview: boolean;
}

const KEY = 'skytumble.settings';
const DEFAULTS: Settings = { slidePreview: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode etc.): the setting lasts until the page closes.
  }
}
