import { parseLevel } from '../game/ascii';
import { Level } from '../game/types';

/**
 * Chapter files (src/levels/<chapter>.txt) hold handmade levels as text:
 *
 *   title: Frost Isle             chapter header: title, optional signature
 *   signature: ice                levels must use this mechanic in two distinct ways
 *
 *   === frost-03                  level id: <chapter>-<nn>
 *   name: Slip and Stop
 *   idea: What the level teaches or tests.
 *   par: 9                        recorded when designed; validation flags drift
 *   switches: 0 1                 optional: switch target groups in reading order
 *   bridges-on: 1                 optional: bridge groups that start extended
 *   guard: off                    optional: a teaching level skips the signature's one-trick guard
 *   shape: cube                   optional: start as a cube or a tall block (default: the normal block)
 *   S~~~~#G                       grid rows, in the format of game/ascii.ts
 *
 * Grid rows never contain ':', so any "key: value" line is a field.
 */

export interface HandmadeLevel {
  id: string;
  name: string;
  /** What the level is meant to teach or test. */
  idea: string;
  /** Par recorded in the file; null until filled in. */
  par: number | null;
  /** Whether the chapter's one-trick guard applies (teaching levels opt out). */
  guard: boolean;
  level: Level;
}

export interface Chapter {
  id: string;
  title: string;
  /** Mechanic every level must use in at least two distinct ways (the one-trick guard). */
  signature: Signature | null;
  levels: HandmadeLevel[];
}

/** `walls` only names First Glade's mechanics on the map: it has no one-trick guard. */
export const SIGNATURES = ['ice', 'pads', 'gravity', 'shapes', 'walls'] as const;
const START_SHAPES: Record<string, number> = { cube: 1, normal: 2, tall: 3 };
export type Signature = (typeof SIGNATURES)[number];

const FIELD = /^([a-z-]+):\s*(.*)$/;
const HEADER = /^===\s*(\S+)\s*$/;

interface Draft {
  id: string;
  line: number;
  fields: Map<string, string>;
  rows: string[];
}

export function parseChapter(id: string, text: string): Chapter {
  const fail = (line: number, msg: string): never => {
    throw new Error(`${id}.txt:${line}: ${msg}`);
  };
  const header = new Map<string, string>();
  const drafts: Draft[] = [];

  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const n = i + 1;
    if (!line.trim()) return;
    const head = HEADER.exec(line);
    if (head) {
      drafts.push({ id: head[1], line: n, fields: new Map(), rows: [] });
      return;
    }
    const field = FIELD.exec(line);
    const cur = drafts[drafts.length - 1];
    if (field) {
      const target = cur ? cur.fields : header;
      if (target.has(field[1])) fail(n, `duplicate field '${field[1]}'`);
      target.set(field[1], field[2].trim());
    } else if (cur) {
      cur.rows.push(line);
    } else {
      fail(n, 'grid row before the first "=== <id>" header');
    }
  });

  const signature = header.get('signature') ?? null;
  if (signature !== null && !(SIGNATURES as readonly string[]).includes(signature)) {
    fail(1, `unknown signature '${signature}' (known: ${SIGNATURES.join(', ')})`);
  }
  for (const key of header.keys()) {
    if (key !== 'title' && key !== 'signature') fail(1, `unknown chapter field '${key}'`);
  }

  const levels = drafts.map((d): HandmadeLevel => {
    for (const key of d.fields.keys()) {
      if (!['name', 'idea', 'par', 'switches', 'bridges-on', 'guard', 'shape'].includes(key)) fail(d.line, `unknown field '${key}'`);
    }
    if (d.rows.length === 0) fail(d.line, `${d.id} has no grid`);
    const numbers = (key: string) =>
      (d.fields.get(key) ?? '').split(/\s+/).filter(Boolean).map((s) => {
        const v = Number(s);
        if (!Number.isInteger(v) || v < 0) fail(d.line, `${key}: '${s}' is not a whole number`);
        return v;
      });
    const par = d.fields.has('par') ? numbers('par')[0] ?? null : null;
    const bridgesOn = numbers('bridges-on').reduce((mask, g) => mask | (1 << g), 0);
    let level: Level;
    try {
      const shape = d.fields.get('shape') ?? 'normal';
      if (!(shape in START_SHAPES)) fail(d.line, `shape: expected cube, normal or tall, got '${shape}'`);
      level = parseLevel(d.rows, numbers('switches'), bridgesOn, START_SHAPES[shape]);
    } catch (err) {
      return fail(d.line, `${d.id}: ${(err as Error).message}`);
    }
    const guard = d.fields.get('guard') ?? 'on';
    if (guard !== 'on' && guard !== 'off') fail(d.line, `guard: expected 'on' or 'off', got '${guard}'`);
    return { id: d.id, name: d.fields.get('name') ?? d.id, idea: d.fields.get('idea') ?? '', par, guard: guard === 'on', level };
  });

  return { id, title: header.get('title') ?? id, signature: signature as Signature | null, levels };
}
