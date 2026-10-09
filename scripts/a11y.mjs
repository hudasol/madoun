// Usage: node scripts/a11y.mjs <baseUrl>   Runs axe-core (WCAG 2.x A/AA) over every page, in EN/AR and dark/light.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3000';
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const candidates = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium', ...fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium')).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)].filter(Boolean);
const executablePath = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

const pages = ['/', '/shipments', '/shipments/SHP-0005', '/exceptions', '/evidence', '/learning', '/inspection', '/simulator', '/pilot', '/method'];
let total = 0;
const seen = new Map();
for (const scheme of ['dark', 'light']) {
  for (const locale of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript((l) => { try { localStorage.setItem('madoun.locale', l); } catch {} }, locale);
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.evaluate(axeSource);
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
      for (const v of res.violations) {
        total += v.nodes.length;
        const key = `${v.id}`;
        const entry = seen.get(key) ?? { help: v.help, impact: v.impact, where: new Set(), sample: v.nodes.slice(0, 3).map((n) => { const d = n.any?.[0]?.data; return n.html.slice(0, 90) + (d && d.fgColor ? ` [fg ${d.fgColor} bg ${d.bgColor} ratio ${d.contrastRatio}]` : ''); }).join('\n    ') };
        entry.where.add(`${p} [${locale}/${scheme}]`);
        seen.set(key, entry);
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (!seen.size) console.log('axe: no WCAG A/AA violations found on', pages.length, 'pages x 4 variants');
for (const [id, e] of seen) console.log(`\n[${e.impact}] ${id}: ${e.help}\n  e.g. ${e.sample}\n  on: ${[...e.where].slice(0, 6).join('; ')}${e.where.size > 6 ? ` (+${e.where.size - 6} more)` : ''}`);
console.log('\nviolating nodes:', total);
process.exit(total ? 1 : 0);
