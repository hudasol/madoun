import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', p), 'utf8');

/** The generated report must stay tied to the plan it claims to follow, and the pinned data must be the data the plan names. */
describe('benchmark report and preregistration', () => {
  const prereg = read('docs/preregistration-benchmark.md');
  const report = JSON.parse(read('docs/benchmark-korea.json'));
  const md = read('docs/benchmark-korea.md');

  it('reports exactly the predictions that were preregistered, in order', () => {
    const planned = [...prereg.matchAll(/^\| (P\d+) \|/gm)].map((m) => m[1]);
    expect(planned.length).toBeGreaterThan(0);
    expect(report.predictions.map((p: { id: string }) => p.id)).toEqual(planned);
  });

  it('states a hit count that matches the evaluated predictions', () => {
    const scored = report.predictions.filter((p: { structural?: boolean }) => !p.structural);
    const hits = scored.filter((p: { hit: boolean }) => p.hit).length;
    expect(md).toContain(`${hits} of ${scored.length} predictions hit`);
  });

  it('pins the same file digests in the plan and in the fetch script', () => {
    const script = read('scripts/fetch-reference-data.mjs');
    for (const digest of prereg.match(/[0-9a-f]{64}/g) ?? []) expect(script).toContain(digest);
    expect((prereg.match(/[0-9a-f]{64}/g) ?? []).length).toBe(3);
  });

  it('keeps the dataset out of git and uses no em dashes', () => {
    expect(read('.gitignore')).toContain('data/external/');
    expect(md + prereg).not.toMatch(/—|–/);
  });

  it('measured the unconstrained reference, so the two predictions that need it were evaluable', () => {
    expect(report.fraud.methods.map((m: { id: string }) => m.id)).toContain('M5');
  });
});
