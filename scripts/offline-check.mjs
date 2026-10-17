// Checks that the production build makes no outbound attempt that the egress guard can observe (DNS lookups,
// TCP and TLS connections, UDP sends from Node) while every page and every API route is used successfully.
// It does not see traffic from native add-ons or child processes started without the guard.
//
//   npm run build
//   node scripts/offline-check.mjs [port]
//
// 1. Canary: a child process with the egress guard tries to reach example.org; the guard must record and
//    block it, which shows the guard works (nothing is actually sent).
// 2. Starts `next start` with the guard preloaded in every Node process it runs (NODE_OPTIONS).
// 3. Opens every page in a headless browser (English and Arabic), runs the inspection cell, opens a receipt
//    and copies its proof, and records any request the browser makes to another origin.
// 4. Calls every API route, reads and writes, including the gateway result route.
// 5. Stops the server by process id and fails if the guard recorded any outbound attempt.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChromium } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const guard = pathToFileURL(path.join(here, 'egress-guard.mjs')).href;
const port = Number(process.argv[2] ?? 3300);
const base = `http://localhost:${port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'madoun-offline-'));
const serverLog = path.join(tmp, 'server-egress.jsonl');
const canaryLog = path.join(tmp, 'canary-egress.jsonl');
let failures = 0;
const fail = (m) => { failures++; console.log('FAIL', m); };

/** An adapter style declaration (no internal ids) built from a shipment the API returns, so the engine really runs. */
function adapterPayload(s) {
  const { id: _id, consignments, ...rest } = s;
  return { ...rest, consignments: consignments.map(({ id: _c, items, ...c }) => ({ ...c, items: items.map(({ id: _i, ...i }) => i) })) };
}

// 1. Canary.
execFileSync(process.execPath, ['--import', guard, '-e', "fetch('https://example.org/').then(() => process.exit(3), () => process.exit(0))"], {
  env: { ...process.env, MADOUN_EGRESS_LOG: canaryLog },
  stdio: 'ignore',
});
const readLog = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const canary = readLog(canaryLog).filter((l) => l.kind !== 'guard-loaded');
if (!canary.length) fail('the egress guard did not record the canary request; the check would prove nothing');
else console.log(`canary: guard recorded and blocked ${canary.length} attempt(s) to reach example.org`);

// 2. Server with the guard in every Node process.
const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
  cwd: root,
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${guard}`.trim(), MADOUN_EGRESS_LOG: serverLog },
  stdio: 'ignore',
});
const stop = () => {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  } else server.kill('SIGTERM');
};

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { up = (await fetch(`${base}/api/v1/health`)).ok; } catch { /* not yet */ }
  }
  if (!up) throw new Error('server did not start');

  // 3. Pages.
  const receiptId = (await (await fetch(`${base}/api/v1/receipts?pageSize=1`)).json()).data[0].id;
  const pages = ['/', '/shipments', '/shipments/SHP-0005', '/exceptions', '/evidence', `/evidence?receipt=${receiptId}`, '/learning', '/inspection', '/simulator', '/pilot', '/method'];
  const browser = await launchChromium();
  const foreign = new Set();
  for (const locale of ['en', 'ar']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((l) => { try { localStorage.setItem('madoun.locale', l); } catch {} }, locale);
    const page = await ctx.newPage();
    page.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== new URL(base).origin) foreign.add(u.origin); });
    for (const p of pages) { await page.goto(base + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(400); }
    await page.goto(`${base}/inspection`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    for (let i = 0; i < 5; i++) { const b = page.locator('table button.btn:not([disabled])').first(); if (await b.count()) { await b.click(); await page.waitForTimeout(150); } }
    await page.goto(`${base}/evidence?receipt=${receiptId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.locator('button', { hasText: /inclusion proof|إثبات التضمين/ }).first().click();
    await page.waitForTimeout(300);
    await ctx.close();
  }
  await browser.close();
  if (foreign.size) fail(`the browser requested other origins: ${[...foreign].join(', ')}`);

  // 4. Every API route.
  const get = async (p) => { const r = await fetch(base + p); await r.arrayBuffer(); return r.status; };
  const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); await r.arrayBuffer(); return r.status; };
  const shipment = (await (await fetch(`${base}/api/v1/shipments?pageSize=1`)).json()).data[0].id;
  const tasks = (await (await fetch(`${base}/api/v1/inspection-tasks?status=open`)).json()).data;
  const calls = [
    ['GET /health', await get('/api/v1/health')],
    ['GET /shipments', await get('/api/v1/shipments')],
    ['GET /shipments/{id}', await get(`/api/v1/shipments/${shipment}`)],
    ['GET /receipts', await get('/api/v1/receipts')],
    ['GET /receipts/{id}', await get(`/api/v1/receipts/${receiptId}`)],
    ['GET /receipts/{id}/proof', await get(`/api/v1/receipts/${receiptId}/proof`)],
    ['GET /receipts/verify', await get('/api/v1/receipts/verify')],
    ['GET /ledger/checkpoint', await get('/api/v1/ledger/checkpoint?from=10')],
    ['GET /exceptions', await get('/api/v1/exceptions')],
    ['GET /kpis', await get('/api/v1/kpis')],
    ['GET /inspection-tasks', await get('/api/v1/inspection-tasks?status=completed')],
    ['POST /assessments', await post('/api/v1/assessments', adapterPayload((await (await fetch(`${base}/api/v1/shipments/${shipment}`)).json()).shipment))],
  ];
  if (tasks[0]) {
    calls.push(['POST /inspection-tasks/{id}/result', await post(`/api/v1/inspection-tasks/${tasks[0].id}/result`, {
      performedBy: 'cell-G1', performerKind: 'robot', completedAt: tasks[0].requestedAt, seal: { id: 'S', intact: true },
      findings: [{ kind: 'none', severity: 'info', note: 'offline check' }], media: [],
    })]);
  }
  for (const [name, status] of calls) if (status !== (name.startsWith('POST /inspection') ? 201 : 200)) fail(`${name} answered ${status}; every route must succeed for the check to mean anything`);
  console.log(`exercised ${pages.length} pages in 2 languages and ${calls.length} API calls: ${calls.map(([n, s]) => `${n} ${s}`).join(', ')}`);
} catch (e) {
  fail(String(e));
} finally {
  stop();
}

await new Promise((r) => setTimeout(r, 500));
const lines = readLog(serverLog);
const loaded = lines.filter((l) => l.kind === 'guard-loaded');
const attempts = lines.filter((l) => l.kind !== 'guard-loaded');
if (!loaded.some((l) => l.target.includes('next'))) fail('the egress guard was not active in the server process; the check would prove nothing');
else console.log(`guard active in ${loaded.length} server process(es)`);
if (attempts.length) fail(`the server tried to reach other hosts ${attempts.length} time(s): ${[...new Set(attempts.map((l) => l.target))].join(', ')}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `${failures} failure(s)` : 'OK: no outbound attempt observed by the guard in the server, and no other origin requested by the browser, while every page and API route was used successfully.');
process.exit(failures ? 1 : 0);
