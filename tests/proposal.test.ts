import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeKpis } from '@/engine';
import { getWorld } from '@/server/world';
import cell from '../docs/cell-results.json';

/**
 * The Edge proposal must agree with the code: every number it quotes comes from a generated source and
 * every file it cites exists. A failure here means the document drifted, not the code.
 */
const doc = fs.readFileSync('docs/edge-proposal.md', 'utf8');
const scenario = (id: string) => cell.scenarios.find((s) => s.id === id)!.summary;
const two = (x: number | null) => (x as number).toFixed(2);
const pct = (x: number | null) => `${((x as number) * 100).toFixed(1)}%`;

describe('docs/edge-proposal.md', () => {
  it('quotes the release model exactly as computeKpis gives it', () => {
    const k = computeKpis(getWorld().sim.results);
    expect(doc).toContain(`${k.shipments} shipments`);
    expect(doc).toContain(`${k.todayMedianHours.toFixed(1)} h today against ${k.madounMedianHours.toFixed(1)} h with Madoun`);
  });

  it('quotes the cell experiment exactly as docs/cell-results.json gives it', () => {
    const s1 = scenario('S1'), s3 = scenario('S3'), s4 = scenario('S4');
    expect(doc).toContain(`from ${two(s1.medianLead.mean)} h to ${two(s3.medianLead.mean)} h`);
    expect(doc).toContain(`from ${two(s1.officerHoursPerContainer.mean)} to ${two(s3.officerHoursPerContainer.mean)}`);
    expect(doc).toContain(`(${pct(s3.missedViolationShare.mean)} against ${pct(s1.missedViolationShare.mean)})`);
    expect(doc).toContain(`(90th percentile ${two(s4.p90Lead.mean)} h against ${two(s1.p90Lead.mean)} h)`);
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
    const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
    expect(doc).toContain(`${cap(words[cell.hits])} of ${words[cell.predictionCount]} predictions hit`);
    expect(doc).toContain(`for ${cell.seeds.length} seeds`);
  });

  it('cites only files that exist', () => {
    const cited = [...doc.matchAll(/`((?:src|docs|tests|scripts|gateway|public)\/[\w./-]+)`/g)].map((m) => m[1]);
    expect(cited.length).toBeGreaterThan(20);
    for (const p of cited) {
      // Exact path, or a numbered review cited by its number (docs/reviews/01 for docs/reviews/01-adeo.md).
      const exists = fs.existsSync(p) || (/^docs\/reviews\/\d\d$/.test(p) && fs.readdirSync('docs/reviews').some((f) => f.startsWith(p.split('/').pop()! + '-')));
      expect(exists, p).toBe(true);
    }
    for (const f of ['Dockerfile']) expect(fs.existsSync(f)).toBe(true);
  });

  it('follows the house style and states its limits', () => {
    expect(doc).not.toMatch(/—|–/);
    expect(doc).not.toMatch(/claude|anthropic|stirling/i);
    for (const phrase of ['synthetic', 'mock', 'demo keys', 'simulator', 'not a measurement', 'Honest limits']) expect(doc).toContain(phrase);
  });

  it('the rendered architecture page embeds exactly the Mermaid source', () => {
    const mmd = fs.readFileSync('docs/edge-architecture.mmd', 'utf8').replace(/\r\n/g, '\n');
    const md = fs.readFileSync('docs/edge-architecture.md', 'utf8').replace(/\r\n/g, '\n');
    expect(md).toContain('```mermaid\n' + mmd + '```');
  });
});
