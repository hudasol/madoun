import { describe, expect, it } from 'vitest';
import { computeLearning, type Outcome } from '@/engine';
import { NOW } from './helpers';

const o = (i: number, result: Outcome['result'], keys: string[], sampling?: Outcome['sampling']): Outcome => ({
  shipmentId: 'S' + i, lane: sampling ? 'green' : 'amber', traderId: 't', forwarderId: 'fw', triggerKeys: keys, result,
  ...(sampling ? { sampling } : {}), missingEvidence: [], recordedAt: NOW,
});

describe('learning with intervals and audits', () => {
  it('gives every factor a 95% interval that brackets its hit rate', () => {
    const r = computeLearning(Array.from({ length: 20 }, (_, i) => o(i, i < 5 ? 'confirmed' : 'false-alarm', ['value:undervalued'])));
    const f = r.factors[0];
    expect(f.hitRate).toBe(0.25);
    expect(f.lo).toBeLessThan(0.25);
    expect(f.hi).toBeGreaterThan(0.25);
  });

  it('marks a suggestion weak when its interval still crosses the threshold, strong when it does not', () => {
    const weak = computeLearning(Array.from({ length: 14 }, (_, i) => o(i, i === 0 ? 'confirmed' : 'false-alarm', ['origin:first-time']))).suggestions[0];
    expect(weak.id).toBe('lower:origin:first-time');
    expect(weak.evidence?.strength).toBe('weak');
    const strong = computeLearning(Array.from({ length: 80 }, (_, i) => o(i, i === 0 ? 'confirmed' : 'false-alarm', ['origin:first-time']))).suggestions[0];
    expect(strong.evidence?.strength).toBe('strong');
  });

  it('keeps random-audit outcomes out of the intervention statistics and reports them as the base rate', () => {
    const outs = [
      ...Array.from({ length: 12 }, (_, i) => o(i, 'false-alarm', ['origin:first-time'])),
      ...Array.from({ length: 10 }, (_, i) => o(100 + i, i < 2 ? 'confirmed' : 'false-alarm', [], 'random-audit')),
    ];
    const r = computeLearning(outs);
    expect(r.interventions).toBe(12);
    expect(r.audit).toMatchObject({ n: 10, confirmed: 2, rate: 0.2 });
    expect(r.audit.lo).toBeLessThan(0.2);
    expect(r.audit.hi).toBeGreaterThan(0.2);
    expect(r.sampling).toEqual({ risk: 12, randomAudit: 10, historyAudit: 0 });
  });

  it('does not count history-selected audits as either interventions or base rate', () => {
    const r = computeLearning([o(1, 'confirmed', ['prior-findings:some'], 'history-audit'), o(2, 'false-alarm', [], 'history-audit')]);
    expect(r.interventions).toBe(0);
    expect(r.audit.n).toBe(0);
    expect(r.sampling.historyAudit).toBe(2);
  });

  it('with no audits the base rate says nothing rather than zero', () => {
    const r = computeLearning([]);
    expect(r.audit).toMatchObject({ n: 0, lo: 0, hi: 1 });
  });
});
