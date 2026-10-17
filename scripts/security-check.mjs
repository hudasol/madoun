// Usage: node scripts/security-check.mjs <baseUrl>
// 1. Every page and API response carries the security headers.
// 2. Loading every page makes requests to the app's own origin only (nothing leaves the machine).
// 3. No Content-Security-Policy violation or console error appears while using the pages.
import { launchChromium } from './browser.mjs';

const base = new URL(process.argv[2] ?? 'http://localhost:3000');
const need = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];
const pages = ['/', '/shipments', '/shipments/SHP-0005', '/exceptions', '/evidence', '/learning', '/inspection', '/simulator', '/pilot', '/method'];
const firstReceipt = (await (await fetch(new URL('/api/v1/receipts?pageSize=1', base))).json()).data[0].id;
const apis = ['/api/v1/health', '/api/v1/kpis', '/api/v1/receipts/verify', '/api/v1/inspection-tasks?status=open', '/api/v1/ledger/checkpoint?from=1', `/api/v1/receipts/${firstReceipt}/proof`];
let failures = 0;
const fail = (m) => { failures++; console.log('FAIL', m); };

for (const p of [...pages, ...apis]) {
  const res = await fetch(new URL(p, base));
  for (const h of need) if (!res.headers.get(h)) fail(`${p} missing ${h}`);
  if (res.headers.get('x-powered-by')) fail(`${p} leaks x-powered-by`);
}

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();
const foreign = new Set();
const errors = [];
page.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== base.origin) foreign.add(u.origin); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
for (const p of pages) {
  await page.goto(new URL(p, base).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}
await browser.close();
if (foreign.size) fail(`requests to other origins: ${[...foreign].join(', ')}`);
if (errors.length) fail(`console errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
console.log(failures ? `${failures} failure(s)` : `OK: ${pages.length} pages + ${apis.length} API routes have all headers, no foreign origins, no console/CSP errors.`);
process.exit(failures ? 1 : 0);
