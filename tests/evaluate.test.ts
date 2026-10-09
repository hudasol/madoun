import { describe, expect, it } from 'vitest';
import { fitLogistic, predictLogistic, auroc, makeRng, isRandomAudit } from '@/engine';
import { runEvaluation } from '@/lib/evaluation';
import { getWorld } from '@/server/world';

describe('model check', () => {
  const r = runEvaluation(4, 100);
  const m = (n: string) => r.methods.find((x) => x.name === n)!;

  it('is deterministic', () => {
    expect(runEvaluation(4, 100)).toEqual(r);
  });

  it('a random ranking scores about a coin toss and the rules clearly beat it', () => {
    expect(m('random').aurocCI.lo).toBeLessThan(0.5);
    expect(m('random').aurocCI.hi).toBeGreaterThan(0.5);
    expect(m('rules').aurocCI.lo).toBeGreaterThan(m('random').aurocCI.hi);
  });

  it('lanes order risk: each lane has a higher violation rate than the one below', () => {
    const [g, a, red] = r.lanes;
    expect(a.rate).toBeGreaterThan(g.rate);
    expect(red.rate).toBeGreaterThan(a.rate);
  });

  it('accounts for every shipment exactly once', () => {
    expect(r.lanes.reduce((t, l) => t + l.n, 0)).toBe(r.shipments);
    expect(r.lanes.reduce((t, l) => t + l.violations, 0)).toBe(r.violations);
    expect(r.policy.missedInGreen).toBe(r.lanes[0].violations);
  });

  it('reports a challenger that is at least better calibrated than guessing the average', () => {
    expect(r.challenger.brier).toBeLessThan(r.challenger.baselineBrier);
  });
});

describe('logistic challenger', () => {
  it('learns a clean separation and is deterministic', () => {
    const rng = makeRng(3);
    const X = Array.from({ length: 200 }, () => [rng.next() * 10, rng.next()]);
    const y = X.map((x) => x[0] > 5);
    const a = fitLogistic(X, y);
    const b = fitLogistic(X, y);
    expect(a).toEqual(b);
    expect(auroc(X.map((x) => predictLogistic(a, x)), y)).toBeGreaterThan(0.99);
    expect(Math.abs(a.w[0])).toBeGreaterThan(Math.abs(a.w[1]) * 5);
  });
});

describe('post-clearance audits', () => {
  const { sim, world, g } = getWorld();
  const outcomes = Object.values(world.shipments).map((f) => f.outcome).filter((o) => !!o);

  it('audit every flagged green shipment, and only green ones', () => {
    const audited = outcomes.filter((o) => o!.sampling);
    expect(audited.length).toBeGreaterThan(0);
    for (const o of audited) {
      expect(o!.lane).toBe('green');
      expect(o!.result).not.toBe('not-inspected');
    }
    for (const o of audited.filter((o) => o!.sampling === 'random-audit')) expect(isRandomAudit(o!.shipmentId)).toBe(true);
  });

  it('never change release times: audits happen after clearance', () => {
    const cleared = new Map(sim.results.map((r) => [r.shipmentId, Date.parse(r.clearedAt)]));
    for (const o of outcomes.filter((o) => o!.sampling)) expect(Date.parse(o!.recordedAt)).toBeGreaterThan(cleared.get(o!.shipmentId)!);
  });

  it('only random audits of green traffic estimate the base rate', () => {
    expect(g.shipments.length).toBeGreaterThan(0);
    const random = outcomes.filter((o) => o!.sampling === 'random-audit');
    expect(random.length).toBeGreaterThanOrEqual(3);
  });
});
