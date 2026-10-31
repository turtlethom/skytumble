// Play handmade levels' optimal solutions in headless Chrome and check each one wins at par.
//   npm run build && npx vite preview --port 4179 &
//   npx vite-node scripts/design/solutions.ts frost- > /tmp/solutions.json
//   node scripts/design/play.mjs http://localhost:4179 /tmp/solutions.json <screenshot dir>
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
let failed = 0;
for (const [id, moves] of Object.entries(solutions)) {
  await send('Page.navigate', { url: `${base}/?level=${id}` });
  await sleep(2500);
  await shot(`${id}-start`);
  // Generous gaps: long slides and chained motions take over a second to animate.
  for (const m of moves) {
    await key(codes[m]);
    await sleep(1300);
  }
  await sleep(900);
  await shot(`${id}-end`);
  const won = !(await evalJs("document.getElementById('win').classList.contains('hidden')"));
  const count = await evalJs("document.getElementById('moves').textContent");
  console.log(`${id.padEnd(12)} ${won ? 'WON' : 'NOT WON'}  ${count} moves / par ${moves.length}`);
  if (!won) failed++;
}
chrome.kill();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
