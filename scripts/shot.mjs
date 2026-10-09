// Usage: node scripts/shot.mjs <url> <out.png> [--w=1280] [--h=900] [--ar] [--light] [--full] [--wait=1500]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [url, out, ...flags] = process.argv.slice(2);
const opt = Object.fromEntries(flags.map((f) => { const [k, v] = f.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium', ...fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)].filter(Boolean);
const executablePath = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: Number(opt.w ?? 1280), height: Number(opt.h ?? 900) }, colorScheme: opt.light ? 'light' : 'dark' });
await ctx.addInitScript(({ ar }) => { try { localStorage.setItem('madoun.locale', ar ? 'ar' : 'en'); } catch {} }, { ar: !!opt.ar });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(opt.wait ?? 1500));
await page.screenshot({ path: out, fullPage: !!opt.full });
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
console.log('saved', out);
