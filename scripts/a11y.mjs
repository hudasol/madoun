// Usage: node scripts/a11y.mjs <baseUrl>   Runs axe-core (WCAG 2.x A/AA) over every page, in EN/AR and dark/light.
import { launchChromium } from './browser.mjs';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2] ?? 'http://localhost:3000';
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const browser = await launchChromium();

const pages = ['/', '/shipments', '/shipments/SHP-0005', '/exceptions', '/evidence', '/learning', '/inspection', '/simulator', '/pilot', '/method'];
let total = 0;
let confirmScanned = 0;
const seen = new Map();
for (const scheme of ['dark', 'light']) {
  for (const locale of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    await ctx.addInitScript((l) => { try { localStorage.setItem('madoun.locale', l); } catch {} }, locale);
    const page = await ctx.newPage();
    const scan = async (p) => {
      await page.evaluate(axeSource);
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
      for (const v of res.violations) {
        total += v.nodes.length;
        const key = `${v.id}`;
        const entry = seen.get(key) ?? { help: v.help, impact: v.impact, where: new Set(), sample: v.nodes.slice(0, 3).map((n) => { const d = n.any?.[0]?.data; return n.html.slice(0, 90) + (d && d.fgColor ? ` [fg ${d.fgColor} bg ${d.bgColor} ratio ${d.contrastRatio}]` : ''); }).join('\n    ') };
        entry.where.add(`${p} [${locale}/${scheme}]`);
        seen.set(key, entry);
      }
    };
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await scan(p);
    }
    // The officer confirmation banner and form appear only after a machine reports a serious finding, so drive
    // the inspection cell until one does, then scan the board and the shipment file (client navigation keeps state).
    await page.goto(base + '/inspection', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    for (let i = 0; i < 80 && !(await page.locator('[data-confirm-banner]').count()); i++) {
      const run = page.locator('table button.btn:not([disabled])').first();
      if (!(await run.count())) break;
      await run.click();
      await page.waitForTimeout(150);
    }
    if (await page.locator('[data-confirm-banner]').count()) {
      await scan('/inspection (confirmation banner)');
      await page.locator('[data-confirm-banner] a').first().click();
      await page.waitForSelector('[data-confirm-form]');
      await page.waitForTimeout(500);
      await scan('/shipments/[id] (confirmation form)');
      confirmScanned++;
    }
    await ctx.close();
  }
}
await browser.close();
if (confirmScanned < 4) { console.log('could not reach the officer confirmation form in', 4 - confirmScanned, 'variant(s)'); total++; }
if (!seen.size) console.log('axe: no WCAG A/AA violations found on', pages.length, 'pages x 4 variants, plus the confirmation banner and form');
for (const [id, e] of seen) console.log(`\n[${e.impact}] ${id}: ${e.help}\n  e.g. ${e.sample}\n  on: ${[...e.where].slice(0, 6).join('; ')}${e.where.size > 6 ? ` (+${e.where.size - 6} more)` : ''}`);
console.log('\nviolating nodes:', total);
process.exit(total ? 1 : 0);
