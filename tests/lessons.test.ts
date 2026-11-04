import { describe, expect, it } from 'vitest';
import { StepResult, initialState, step } from '../src/game/rules';
import { solve } from '../src/game/solver';
import { Dir, State } from '../src/game/types';
import { TUTORIAL, findLevel, lessonUnlocked } from '../src/levels';
import { Moment, isLesson, lessonDone, lessonPrompt } from '../src/levels/lessons';

const MOVES: Record<string, Dir> = { U: 'up', D: 'down', L: 'left', R: 'right' };

/** What the lesson says after each of these moves, the last one being the moment returned. */
function play(id: string, moves: string): Moment {
  const level = findLevel(id)!.level;
  let state = initialState(level);
  let before: State | null = null;
  let last: StepResult | null = null;
  for (const c of moves) {
    before = state;
    last = step(level, state, MOVES[c]);
    state = last.state;
  }
  return { level, state, before, last, moves: moves.length };
}

const say = (id: string, moves: string) => lessonPrompt(id, play(id, moves));

describe('the Tutorial', () => {
  it('has five lessons, each with a prompt and a takeaway, solved in about 12 moves or fewer', () => {
    expect(TUTORIAL.levels).toHaveLength(5);
    for (const { id, level } of TUTORIAL.levels) {
      expect(isLesson(id)).toBe(true);
      expect(lessonPrompt(id, play(id, ''))).not.toBe('');
      expect(lessonDone(id)).not.toBe('');
      expect(solve(level)!.moves.length).toBeLessThanOrEqual(12);
    }
  });

  it('says something on every step of every solution', () => {
    for (const { id, level } of TUTORIAL.levels) {
      const moves = solve(level)!.moves;
      const letters = moves.map((d) => d[0].toUpperCase()).join('');
      for (let n = 0; n <= letters.length; n++) expect(say(id, letters.slice(0, n))).not.toBe('');
    }
  });

  it('does not treat levels outside the Tutorial as lessons', () => {
    expect(isLesson('frost-01')).toBe(false);
  });
});

describe('lesson locks', () => {
  const doneOnly = (...ids: string[]) => (id: string) => ids.includes(id);

  it('leave only the first lesson open at the start', () => {
    const open = TUTORIAL.levels.filter((l) => lessonUnlocked(l.id, doneOnly()));
    expect(open.map((l) => l.id)).toEqual(['tutorial-01']);
  });

  it('open each lesson once the one before it is done', () => {
    expect(lessonUnlocked('tutorial-02', doneOnly('tutorial-01'))).toBe(true);
    expect(lessonUnlocked('tutorial-03', doneOnly('tutorial-01'))).toBe(false);
    expect(lessonUnlocked('tutorial-05', doneOnly('tutorial-01', 'tutorial-02', 'tutorial-03', 'tutorial-04'))).toBe(true);
  });
});

describe('the prompts react', () => {
  it('to tipping over, and to lying across the goal', () => {
    expect(say('tutorial-01', 'R')).toContain('lies across');
    expect(say('tutorial-01', 'RR')).toContain('yellow goal');
    expect(say('tutorial-01', 'RRRRDDL')).toContain('So close');
  });

  it('to rolling off the edge', () => {
    expect(say('tutorial-01', 'U')).toContain('Off the edge');
  });

  it('to a sideways roll and to reaching the ledge', () => {
    expect(say('tutorial-02', 'DR')).toContain('shifts one tile');
    expect(say('tutorial-02', 'DRRD')).toContain('Lined up');
  });

  it('to breaking the planks, and to crossing them', () => {
    expect(say('tutorial-03', 'R')).toContain('one more roll');
    expect(say('tutorial-03', 'RR')).toContain('snapped');
    expect(say('tutorial-03', 'RUL')).toContain('roll down');
    expect(say('tutorial-03', 'RULDRR')).toContain('planks hold');
  });

  it('to raising and lowering the bridge with any touch', () => {
    expect(say('tutorial-04', 'RU')).toContain('bridge is up');
    expect(say('tutorial-04', 'RUD')).toContain('Cross it');
    expect(say('tutorial-04', 'RUDU')).toContain('lowered');
  });

  it('to lying on a heavy switch, then standing on it', () => {
    expect(say('tutorial-05', 'R')).toContain('Lying across it does nothing');
    expect(say('tutorial-05', 'URRD')).toContain('bridge is up');
  });
});
