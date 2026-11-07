import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, step } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { CAMPAIGN, CHAPTERS, LABS, TUTORIAL, nextOnTrack, trackOf } from '../src/levels';
import { MENU_LEVEL } from '../src/levels/menuScene';
import { loadProgress, resetProgress, saveProgress } from '../src/ui/progress';

describe('the main menu scene', () => {
  it('is a short puzzle whose switch the solution presses, ending in a win', () => {
    const moves = solve(MENU_LEVEL)!.moves;
    expect(moves.length).toBeGreaterThanOrEqual(4);
    expect(moves.length).toBeLessThanOrEqual(10);
    let state = initialState(MENU_LEVEL);
    let toggled = false;
    let outcome: string | undefined;
    for (const dir of moves) {
      const result = step(MENU_LEVEL, state, dir);
      toggled ||= !!result.toggled;
      outcome = result.outcome;
      state = result.state;
    }
    expect(toggled).toBe(true);
    expect(outcome).toBe('win');
  });
});

describe('level tracks', () => {
  it('put every chapter on exactly one', () => {
    expect([TUTORIAL, ...CAMPAIGN, ...LABS].map((c) => c.id).sort()).toEqual(CHAPTERS.map((c) => c.id).sort());
    expect(trackOf('tutorial-01')).toEqual([TUTORIAL]);
    expect(trackOf('wind-03')).toBe(CAMPAIGN);
    expect(trackOf('gravlab-02')).toBe(LABS);
  });

  it('walk through chapters but stop at the end of the track', () => {
    expect(nextOnTrack('tutorial-01')?.id).toBe('tutorial-02');
    const frost = CAMPAIGN.find((c) => c.id === 'frost')!.levels;
    expect(nextOnTrack(frost[frost.length - 1].id)?.id).toBe('wind-01');
    expect(nextOnTrack(TUTORIAL.levels[TUTORIAL.levels.length - 1].id)).toBeNull();
    const lastCampaign = CAMPAIGN[CAMPAIGN.length - 1].levels;
    expect(nextOnTrack(lastCampaign[lastCampaign.length - 1].id)).toBeNull();
    const lastLab = LABS[LABS.length - 1].levels;
    expect(nextOnTrack(lastLab[lastLab.length - 1].id)).toBeNull();
  });
});

describe('resetting progress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forgets stars, streaks and tier counts, for this session and the next', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const played = loadProgress();
    played.best['level:frost-01'] = 3;
    played.best['easy:abc'] = 2;
    played.streak = 4;
    played.bestStreak = 9;
    played.tiers.easy.solved = 7;
    played.seen.push('ice');
    saveProgress(played);
    expect(loadProgress().best['level:frost-01']).toBe(3);

    const fresh = resetProgress();
    for (const p of [fresh, loadProgress()]) {
      expect(p.best).toEqual({});
      expect(p.streak).toBe(0);
      expect(p.bestStreak).toBe(0);
      expect(p.tiers.easy.solved).toBe(0);
      expect(p.seen).toEqual([]);
    }
  });
});
