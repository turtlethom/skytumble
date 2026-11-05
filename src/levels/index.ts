import { Chapter, HandmadeLevel, parseChapter } from './format';
import frost from './frost.txt?raw';
import gravlab from './gravlab.txt?raw';
import lab from './lab.txt?raw';
import shapelab from './shapelab.txt?raw';
import star from './star.txt?raw';
import toy from './toy.txt?raw';
import wind from './wind.txt?raw';
import windlab from './windlab.txt?raw';
import tutorial from './tutorial.txt?raw';
import glade from './glade.txt?raw';
import gladelab from './gladelab.txt?raw';

/** Every chapter: the Tutorial, then the campaign in play order, then the labs. Add a chapter by adding its .txt file here. */
export const CHAPTERS: Chapter[] = [
  parseChapter('tutorial', tutorial),
  parseChapter('glade', glade),
  parseChapter('frost', frost),
  parseChapter('wind', wind),
  parseChapter('star', star),
  parseChapter('toy', toy),
  // The rule prototypes from the ice lab playtest.
  parseChapter('lab', lab),
  // Launch-pad prototypes for the Windy Peaks lab playtest.
  parseChapter('windlab', windlab),
  // Gravity-flip prototypes for the Starfall camera and lab playtests.
  parseChapter('gravlab', gravlab),
  // Shape-changing prototypes for the Toybox lab playtest.
  parseChapter('shapelab', shapelab),
  // Wall and knock-down hedge prototypes for the First Glade lab playtest.
  parseChapter('gladelab', gladelab),
];

const LAB_IDS = new Set(['lab', 'windlab', 'gravlab', 'shapelab', 'gladelab']);

/** Outside the story and off the sky map, opened from the main menu. */
export const TUTORIAL: Chapter = CHAPTERS.find((c) => c.id === 'tutorial')!;
/** The story: the chapters on the sky map. */
export const CAMPAIGN: Chapter[] = CHAPTERS.filter((c) => c !== TUTORIAL && !LAB_IDS.has(c.id));
/** Mechanic prototypes, on a screen of their own. */
export const LABS: Chapter[] = CHAPTERS.filter((c) => LAB_IDS.has(c.id));

/** Every handmade level, across chapters. */
export const HANDMADE: HandmadeLevel[] = CHAPTERS.flatMap((c) => c.levels);

/** A lesson opens once the one before it is done; the first is always open. */
export function lessonUnlocked(id: string, done: (id: string) => boolean): boolean {
  const i = TUTORIAL.levels.findIndex((l) => l.id === id);
  return i <= 0 || done(TUTORIAL.levels[i - 1].id);
}

/** The chapters a level's "next level" walks through: the Tutorial, the campaign, or the labs. */
export function trackOf(id: string): Chapter[] {
  if (TUTORIAL.levels.some((l) => l.id === id)) return [TUTORIAL];
  return CAMPAIGN.some((c) => c.levels.some((l) => l.id === id)) ? CAMPAIGN : LABS;
}

/** The level after this one on its track; null at the end. */
export function nextOnTrack(id: string): HandmadeLevel | null {
  const levels = trackOf(id).flatMap((c) => c.levels);
  return levels[levels.findIndex((l) => l.id === id) + 1] ?? null;
}

export function chapterOf(id: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === id));
}

export function findLevel(id: string): HandmadeLevel | undefined {
  return HANDMADE.find((h) => h.id === id);
}
