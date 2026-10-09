import { createHash } from 'node:crypto';
import { generate } from '@/data/generate';
import { replay, simulate, detectExceptions, computeKpis } from '@/engine';
const g = generate();
const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
const w = replay(sim.events);
const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
console.log('events', h(sim.events), 'results', h(sim.results), 'world', h({ ...w, log: w.log.length }), 'exceptions', h(detectExceptions(w, g.directory, g.now)), 'kpis', h(computeKpis(sim.results)));
