import { Chapter, HandmadeLevel, parseChapter } from './format';
import frost from './frost.txt?raw';
import lab from './lab.txt?raw';
import tutorial from './tutorial.txt?raw';

/** Campaign chapters in play order. Add a chapter by adding its .txt file here. */
export const CHAPTERS: Chapter[] = [
  parseChapter('tutorial', tutorial),
  parseChapter('frost', frost),
  // The rule prototypes from the ice lab playtest, kept as extras after the campaign.
  parseChapter('lab', lab),
];

/** Chapters kept as extras: shown on the map off the suggested path. */
const EXTRAS = new Set(['lab']);

export function isExtra(chapter: Chapter): boolean {
  return EXTRAS.has(chapter.id);
}

/** Every handmade level in play order, across chapters. */
export const HANDMADE: HandmadeLevel[] = CHAPTERS.flatMap((c) => c.levels);

export function findLevel(id: string): HandmadeLevel | undefined {
  return HANDMADE.find((h) => h.id === id);
}
