import { Chapter, HandmadeLevel, parseChapter } from './format';
import lab from './lab.txt?raw';
import tutorial from './tutorial.txt?raw';

/** Campaign chapters in play order. Add a chapter by adding its .txt file here. */
export const CHAPTERS: Chapter[] = [parseChapter('tutorial', tutorial), parseChapter('lab', lab)];

/** Every handmade level in play order, across chapters. */
export const HANDMADE: HandmadeLevel[] = CHAPTERS.flatMap((c) => c.levels);

export function findLevel(id: string): HandmadeLevel | undefined {
  return HANDMADE.find((h) => h.id === id);
}
