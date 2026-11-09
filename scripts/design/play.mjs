// Play handmade levels' optimal solutions in headless Chrome and check each one wins at par.
//   npm run build && npx vite preview --port 4179 &
//   npx vite-node scripts/design/solutions.ts frost- > /tmp/solutions.json
//   node scripts/design/play.mjs http://localhost:4179 /tmp/solutions.json <screenshot dir>
// Env: STEPS=1 also saves a screenshot after every move (<id>-NN.png); PEEK_AT=n holds Space after
// move n and saves <id>-peek; FRAMES=n saves n shots during the last move (<id>-frameNN.png), FRAME_MS
// apart (default 150), to see an animation mid-way (slow its constants in a throwaway build first);
// ROTATE=n turns the view n quarter turns (E) before playing, to check controls follow the screen.
// PAGES='sheet=peaks&walls;sheet=peaks&walls&gray' skips playing: it opens each query, waits for the
// world to settle and saves page-1.png, page-2.png... (for tile sheets and samples; solutions unused).
// Uses CHROME (path to a Chrome/Chromium binary) or Playwright's cached Chromium. Talks to Chrome over
// the DevTools protocol with a tiny built-in WebSocket client, so it needs no npm dependencies.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const [base, solutionsFile, outDir] = process.argv.slice(2);
const solutions = JSON.parse(fs.readFileSync(solutionsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  const dir = fs.existsSync(cache) && fs.readdirSync(cache).find((d) => d.startsWith('chromium-'));
  if (dir) return path.join(cache, dir, 'chrome-linux/chrome');
  throw new Error('No Chrome found: set CHROME=/path/to/chrome');
}

const port = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'skytumble-play-'));
const chrome = spawn(findChrome(), [
  '--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250);
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
  } catch {
    // Chrome still starting.
  }
}
if (!wsUrl) throw new Error('Chrome did not start');
const u = new URL(wsUrl);
const sock = await new Promise((resolve, reject) => {
  const req = http.request({
    host: u.hostname, port: u.port, path: u.pathname,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') },
  });
  req.on('upgrade', (_res, s) => resolve(s));
  req.on('error', reject);
  req.end();
});

let buf = Buffer.alloc(0);
const pending = new Map();
sock.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    if (buf.length < 2) return;
    let len = buf[1] & 0x7f, off = 2;
    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    if (buf.length < off + len) return;
    const msg = JSON.parse(buf.subarray(off, off + len).toString());
    buf = buf.subarray(off + len);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  const payload = Buffer.from(JSON.stringify({ id, method, params }));
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
  sock.write(Buffer.concat([header, mask, masked]));
  return new Promise((r) => pending.set(id, r));
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result?.value;
const key = (code) => evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' }))`);

const codes = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const screenCodes = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
// Controls follow the screen, and the camera can turn over: ask the game which key rolls which way.
const keyFor = async (dir) => {
  const k = await evalJs(`window.skytumbleKeyFor ? window.skytumbleKeyFor('${dir}') : -1`);
  return k >= 0 ? screenCodes[k] : codes[dir];
};
const peekAt = process.env.PEEK_AT ? Number(process.env.PEEK_AT) : -1;
const frames = Number(process.env.FRAMES ?? 0);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
let failed = 0;
const titleUp = () => evalJs("document.getElementById('arrival').classList.contains('show')");
const untilTitle = async () => {
  for (let i = 0; i < 50 && !(await titleUp()); i++) await sleep(100);
  return titleUp();
};
if (process.env.PAGES) {
  const pages = process.env.PAGES.split(';').filter(Boolean);
  for (const [i, q] of pages.entries()) {
    await send('Page.navigate', { url: `${base}/?${q}` });
    await sleep(Number(process.env.SETTLE ?? 4000));
    await shot(`page-${i + 1}`);
    console.log(`page-${i + 1}.png  ?${q}`);
  }
} else if (process.env.TITLE_CHECK === '1') {
  // Walk through when the chapter title should and shouldn't show.
  const check = (what, ok) => {
    console.log(`${ok ? 'ok    ' : 'FAILED'} ${what}`);
    if (!ok) failed++;
  };
  const settle = () => sleep(2200);
  await send('Page.navigate', { url: `${base}/?level=frost-04` });
  check('fresh page load shows the title', await untilTitle());
  await shot('title-frost');
  await key('ArrowUp');
  await sleep(150);
  check('a key skips it', !(await titleUp()));
  check('and does not count as a move', (await evalJs("document.getElementById('moves').textContent")) === '0');
  await settle();
  await key('KeyN');
  await sleep(600);
  check('next level in the same chapter: no title', !(await titleUp()));
  await send('Page.navigate', { url: `${base}/?level=frost-08` });
  await untilTitle();
  await sleep(3200);
  await key('KeyN');
  check('next level in a new chapter: title', await untilTitle());
  check('it names the new chapter', (await evalJs("document.getElementById('arrival').textContent")) === 'Windy Peaks');
  await sleep(3200);
  check('it lifts by itself', !(await titleUp()));
  await send('Page.navigate', { url: `${base}/?tier=easy&seed=abc` });
  await sleep(1500);
  check('Easy has no title', !(await titleUp()));
  await send('Page.navigate', { url: `${base}/?sheet=forest` });
  await sleep(1500);
  check('the tile sheet has no title', !(await titleUp()));
  await send('Page.navigate', { url: `${base}/` });
  await sleep(2500);
  check('landing on the main menu: no title', !(await titleUp()));
  await evalJs("document.querySelector('[data-action=tutorial]').click()");
  await sleep(300);
  await evalJs("document.querySelector('[data-action=tutorial-01]').click()");
  check('leaving it for a level: title', await untilTitle());
} else
for (const [id, moves] of Object.entries(solutions)) {
  await send('Page.navigate', { url: `${base}/?level=${id}` });
  // A fresh load shows the chapter title, then the island rises. On a slow load the title comes late,
  // so wait for it to appear before waiting for it to go: any key sent during it would only skip it.
  await untilTitle();
  while (await titleUp()) await sleep(100);
  await sleep(1300);
  for (let r = 0; r < Number(process.env.ROTATE ?? 0); r++) await key('KeyE');
  if (process.env.ROTATE) await sleep(800);
  await shot(`${id}-start`);
  // Generous gaps: long slides and chained motions take over a second to animate.
  for (const [i, m] of moves.entries()) {
    await key(await keyFor(m));
    if (frames && i === moves.length - 1) {
      // FRAMES=n: n shots during the last move, FRAME_MS apart, to see an animation mid-way.
      for (let f = 1; f <= frames; f++) {
        await sleep(Number(process.env.FRAME_MS ?? 150));
        await shot(`${id}-frame${String(f).padStart(2, '0')}`);
      }
    } else await sleep(1300);
    if (process.env.STEPS === '1') await shot(`${id}-${String(i + 1).padStart(2, '0')}`);
    if (i + 1 === peekAt) {
      await key('Space');
      await sleep(900);
      await shot(`${id}-peek`);
      await evalJs(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))`);
      await sleep(900);
    }
  }
  await sleep(900);
  await shot(`${id}-end`);
  const won = !(await evalJs("document.getElementById('win').classList.contains('hidden')"));
  const count = await evalJs("document.getElementById('moves').textContent");
  console.log(`${id.padEnd(12)} ${won ? 'WON' : 'NOT WON'}  ${count} moves / par ${moves.length}`);
  if (!won) failed++;
}
// Wait for Chrome to exit before deleting its profile: it keeps writing there while shutting down.
await new Promise((resolve) => {
  chrome.once('exit', resolve);
  chrome.kill();
});
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Chrome sometimes still holds files there; the OS cleans its temp dir eventually.
}
process.exit(failed ? 1 : 0);
