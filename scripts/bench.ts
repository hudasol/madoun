// Usage: npx tsx scripts/bench.ts [sizes...]  e.g. 240 2000 10000
import { generate } from '@/data/generate';
import { replay, simulate } from '@/engine';

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
if (!sizes.length) sizes.push(240, 2000, 10000);
const mb = () => Math.round(process.memoryUsage().heapUsed / 1e6);
console.log('shipments  generate  simulate  replay(all events)  events   heapMB');
for (const n of sizes) {
  let t = performance.now();
  const g = generate({ shipments: n, days: Math.max(7, Math.round(n / 34)) });
  const tg = performance.now() - t;
  t = performance.now();
  const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
  const ts = performance.now() - t;
  t = performance.now();
  replay(sim.events);
  const tr = performance.now() - t;
  console.log(`${String(n).padEnd(10)} ${tg.toFixed(0).padStart(6)}ms ${ts.toFixed(0).padStart(7)}ms ${tr.toFixed(0).padStart(10)}ms        ${String(sim.events.length).padStart(7)} ${String(mb()).padStart(7)}`);
}
