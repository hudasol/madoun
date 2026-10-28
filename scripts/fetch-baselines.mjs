// Fetches the World Bank Logistics Performance Index series used in docs/baselines.md and writes
// docs/data/worldbank-lpi.json. Free, no key. Re-run to refresh; the file records when it was retrieved.
//
//   node scripts/fetch-baselines.mjs
//
// Indicator codes: LP.LPI.CUST.XQ (efficiency of customs clearance, 1 low to 5 high) and LP.LPI.OVRL.XQ
// (overall score). The World Bank labels the 2023 edition of the LPI with the year 2022 (survey year).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countries = { ARE: 'United Arab Emirates', SAU: 'Saudi Arabia', OMN: 'Oman', QAT: 'Qatar', SGP: 'Singapore', NLD: 'Netherlands', DEU: 'Germany' };
const indicators = { 'LP.LPI.CUST.XQ': 'customs', 'LP.LPI.OVRL.XQ': 'overall' };

const out = { source: 'World Bank, Logistics Performance Index (indicator API v2)', retrievedOn: new Date().toISOString().slice(0, 10), note: 'The World Bank labels the 2023 edition with the survey year 2022.', series: {} };
for (const [code, key] of Object.entries(indicators)) {
  const url = `https://api.worldbank.org/v2/country/${Object.keys(countries).join(';')}/indicator/${code}?format=json&per_page=500&date=2007:2024`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const body = await res.json();
  const rows = body[1] ?? [];
  out.series[key] = {};
  for (const r of rows) {
    if (r.value === null) continue;
    (out.series[key][r.countryiso3code] ??= {})[r.date] = Math.round(r.value * 100) / 100;
  }
}
out.countries = countries;
fs.mkdirSync(path.join(root, 'docs', 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'data', 'worldbank-lpi.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote docs/data/worldbank-lpi.json');
for (const k of Object.keys(out.series)) console.log(k, JSON.stringify(out.series[k].ARE));
