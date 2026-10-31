// Level index (levels.html): every handmade level with a mini-map, validation status, and a
// link to play it. Playtest notes quote the ids shown here.
import './levels-page.css';
import { DIRS } from './game/types';
import { CHAPTERS } from './levels';
import { HandmadeLevel } from './levels/format';
import { LevelReport, validateChapters } from './levels/validate';
import { ARROW_DEG, miniMap } from './render/minimap';
import { CONVEYOR_COLORS, cssColor } from './render/palette';
import { esc } from './ui/html';

const $ = (id: string) => document.getElementById(id)!;

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
