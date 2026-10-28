import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '@/data/generate';
import { REFERENCE_POINTS, NOT_PUBLISHED, byId } from '@/data/baselines';
import { computeKpis, simulate } from '@/engine';

const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', p), 'utf8');

describe('published reference points', () => {
  it('name their source, what they measure and what they do not', () => {
    for (const r of REFERENCE_POINTS) {
      expect(r.source.url).toMatch(/^https:\/\//);
      expect(r.source.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.measures.length).toBeGreaterThan(20);
      expect(r.doesNotMeasure.length).toBeGreaterThan(20);
      expect(r.labelAr.length).toBeGreaterThan(0);
    }
    expect(new Set(REFERENCE_POINTS.map((r) => r.id)).size).toBe(REFERENCE_POINTS.length);
    expect(NOT_PUBLISHED.length).toBeGreaterThan(0);
  });

  it('agree with the World Bank series that was downloaded', () => {
    const lpi = JSON.parse(read('docs/data/worldbank-lpi.json'));
    expect(byId('lpi-uae-customs-2023')!.value).toBe(lpi.series.customs.ARE['2022']);
  });
});

describe('docs/baselines.md', () => {
  const md = read('docs/baselines.md');
  const g = generate();
  const k = computeKpis(simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth }).results);

  it('quotes the simulator headline exactly as the simulator produces it today', () => {
    expect(md).toContain(`${k.todayPreArrivalPct.toFixed(1)}% of shipments`);
    expect(md).toContain(`${k.madounPreArrivalPct.toFixed(1)}%`);
    expect(md).toContain(`${k.todayMedianHours.toFixed(1)} h`);
    expect(md).toContain(`${k.medianReductionPct.toFixed(1)}%`);
  });

  it('lists every reference point and uses no em dashes', () => {
    for (const r of REFERENCE_POINTS) expect(md).toContain(r.source.url);
    expect(md).not.toMatch(/—|–/);
  });
});
