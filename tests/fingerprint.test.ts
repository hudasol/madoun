import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generate } from '@/data/generate';
import { computeKpis, simulate } from '@/engine';

const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/**
 * Behaviour guard. The default seed produces these release results and headline numbers byte for byte.
 * If a change moves them, that change altered what the simulator or the planner does. Either undo it,
 * or update the values here and explain why in docs/decisions.md.
 */
describe('behaviour fingerprint', () => {
  const g = generate();
  const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });

  it('keeps the simulated release results stable', () => {
    expect(digest(sim.results)).toBe('500aad9e9dad8311');
  });

  it('keeps the headline numbers stable', () => {
    expect(digest(computeKpis(sim.results))).toBe('232a6abfa98ad394');
  });
});
