// Level index (levels.html): every handmade level with a mini-map, validation status, and a
// link to play it. Playtest notes quote the ids shown here.
import './levels-page.css';
import { DIRS, Level, Tile } from './game/types';
import { CHAPTERS } from './levels';
import { HandmadeLevel } from './levels/format';
import { LevelReport, validateChapters } from './levels/validate';
import { CONVEYOR_COLORS, cssColor } from './render/palette';

const CELL = 14;
const GROUP_COLORS = ['#f4a940', '#b57edc', '#4fc3f7', '#ef6f6c'];
const FILL: Partial<Record<Tile, string>> = {
  [Tile.Floor]: '#86d07a',
  [Tile.Fragile]: '#e2b26f',
  [Tile.Goal]: '#1d1a2b',
  [Tile.SoftSwitch]: '#86d07a',
  [Tile.HeavySwitch]: '#86d07a',
  [Tile.Ice]: '#bfe6ff',
  [Tile.Conveyor]: '#4a5266',
};
/** Arrow glyph rotation per DIRS entry (up, down, left, right), for a "→" drawn pointing right. */
const ARROW_DEG = [-90, 90, 180, 0];

const $ = (id: string) => document.getElementById(id)!;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function miniMap(level: Level): string {
  const parts: string[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const i = y * level.width + x;
      const t = level.tiles[i];
      const g = level.groups[i];
      const px = x * CELL;
      const py = y * CELL;
      if (t === Tile.Empty) continue;
      if (t === Tile.Bridge) {
        const on = ((level.bridgesOn >> g) & 1) === 1;
        parts.push(
          `<rect x="${px + 1}" y="${py + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="2" fill="${GROUP_COLORS[g % 4]}"` +
            (on ? '/>' : ` fill-opacity="0.3" stroke="${GROUP_COLORS[g % 4]}" stroke-dasharray="2 2"/>`),
        );
        continue;
      }
      parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="2" fill="${FILL[t]}"/>`);
      const cx = px + CELL / 2;
      const cy = py + CELL / 2;
      if (t === Tile.Goal) {
        parts.push(`<rect x="${px + 1.5}" y="${py + 1.5}" width="${CELL - 3}" height="${CELL - 3}" fill="none" stroke="#ffd36b" stroke-width="2"/>`);
      } else if (t === Tile.SoftSwitch) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="${GROUP_COLORS[g % 4]}"/>`);
      } else if (t === Tile.HeavySwitch) {
        parts.push(
          `<path d="M${cx - 4} ${cy - 4}L${cx + 4} ${cy + 4}M${cx + 4} ${cy - 4}L${cx - 4} ${cy + 4}" stroke="${GROUP_COLORS[g % 4]}" stroke-width="2.5"/>`,
        );
      } else if (t === Tile.Fragile) {
        parts.push(`<path d="M${px + 5} ${py + 1}V${py + CELL - 1}M${px + 9} ${py + 1}V${py + CELL - 1}" stroke="#b98545" stroke-width="1"/>`);
      } else if (t === Tile.Conveyor) {
        parts.push(
          `<path d="M${cx - 4} ${cy}H${cx + 3}M${cx} ${cy - 3}L${cx + 3.5} ${cy}L${cx} ${cy + 3}" stroke="${cssColor(CONVEYOR_COLORS[DIRS[g]])}" stroke-width="1.8" fill="none"` +
            ` transform="rotate(${ARROW_DEG[g]} ${cx} ${cy})"/>`,
        );
      }
    }
  }
  const s = level.start;
  parts.push(
    `<rect x="${s.x * CELL + 3}" y="${s.y * CELL + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="1.5" fill="#f0c987" stroke="#8a6436" stroke-width="1.5"/>`,
  );
  const w = level.width * CELL;
  const h = level.height * CELL;
  return `<svg class="map" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Level layout">${parts.join('')}</svg>`;
}

function card(h: HandmadeLevel, r: LevelReport): string {
  const meta = [`par ${r.par ?? '–'}`, `${r.explored} states`];
  if (r.iceUses.length) meta.push(`ice: ${r.iceUses.join(', ')}`);
  if (r.pushes) meta.push(`${r.pushes} pushes`);
  const status = r.errors.length
    ? `<ul class="errors">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
    : '<p class="ok">✓ Valid</p>';
  return `
    <article class="card ${r.errors.length ? 'bad' : ''}">
      <div class="card-head">
        <code class="id">${esc(h.id)}</code>
        <a class="play" href="./?level=${encodeURIComponent(h.id)}">Play ▸</a>
      </div>
      <h3>${esc(h.name)}</h3>
      <p class="idea">${esc(h.idea)}</p>
      <div class="map-wrap">${miniMap(h.level)}</div>
      <p class="meta">${meta.map(esc).join(' · ')}</p>
      ${status}
    </article>`;
}

function legend(): string {
  const swatch = (fill: string, label: string, extra = '') =>
    `<span class="key"><svg width="14" height="14"><rect x="0.5" y="0.5" width="13" height="13" rx="2" fill="${fill}"/>${extra}</svg>${label}</span>`;
  return [
    swatch('#86d07a', 'Floor'),
    swatch('#e2b26f', 'Fragile'),
    swatch('#bfe6ff', 'Ice'),
    ...DIRS.map((d, i) =>
      swatch(
        '#4a5266',
        `Belt ${d}`,
        `<path d="M3 7H10M7 4L10.5 7L7 10" stroke="${cssColor(CONVEYOR_COLORS[d])}" stroke-width="1.8" fill="none" transform="rotate(${ARROW_DEG[i]} 7 7)"/>`,
      ),
    ),
    swatch('#86d07a', 'Switch', '<circle cx="7" cy="7" r="4" fill="#f4a940"/>'),
    swatch('#f4a940', 'Bridge'),
    swatch('#1d1a2b', 'Goal', '<rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="#ffd36b" stroke-width="2"/>'),
    swatch('#f0c987', 'Start'),
  ].join('');
}

const reports = validateChapters(CHAPTERS);
const bad = [...reports.values()].filter((r) => r.errors.length).length;
$('summary').textContent =
  `${reports.size} handmade levels in ${CHAPTERS.length} chapter${CHAPTERS.length === 1 ? '' : 's'}` +
  (bad ? ` · ${bad} need attention` : ' · all valid');
$('legend').innerHTML = legend();
$('chapters').innerHTML = CHAPTERS.map(
  (c) => `
    <section class="chapter">
      <h2>${esc(c.title)} <span class="file">${esc(c.id)}.txt${c.signature ? ` · signature: ${esc(c.signature)}` : ''}</span></h2>
      <div class="cards">${c.levels.map((h) => card(h, reports.get(h.id)!)).join('')}</div>
    </section>`,
).join('');
