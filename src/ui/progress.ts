import { Tier } from '../game/types';

interface TierStats {
  solved: number;
  stars: number;
}

export interface Progress {
  version: 1;
  tiers: Record<Tier, TierStats>;
  streak: number;
  bestStreak: number;
  /** Best stars per level, keyed "tier:seed" or "level:<id>". */
  best: Record<string, number>;
}

const KEY = 'skytumble.progress';

function empty(): Progress {
  return {
    version: 1,
    tiers: { easy: { solved: 0, stars: 0 }, medium: { solved: 0, stars: 0 } },
    streak: 0,
    bestStreak: 0,
    best: {},
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Progress;
    return parsed.version === 1 ? { ...empty(), ...parsed } : empty();
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked (private mode etc.): progress just won't persist.
  }
}

/** 3 stars at par, 2 within a small margin, 1 for any solve. */
export function starsFor(moves: number, par: number): number {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(3, Math.ceil(par * 0.3))) return 2;
  return 1;
}
