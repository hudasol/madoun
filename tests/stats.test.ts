import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { auroc, averagePrecision, bootstrapCI, brier, calibration, makeRng, quantileOf, wilson } from '@/engine';

describe('wilson interval', () => {
  it('matches known values', () => {
    const w = wilson(5, 20);
    expect(w.lo).toBeCloseTo(0.112, 2);
    expect(w.hi).toBeCloseTo(0.469, 2);
  });
  it('stays inside [0,1] and brackets the point estimate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.double({ min: 0, max: 1, noNaN: true }), (n, f) => {
        const x = Math.round(f * n);
        const w = wilson(x, n);
        return w.lo >= 0 && w.hi <= 1 && w.lo <= x / n + 1e-12 && w.hi >= x / n - 1e-12;
      }),
    );
  });
  it('narrows as the sample grows', () => {
    const a = wilson(10, 100);
    const b = wilson(100, 1000);
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
  });
  it('with no data it knows nothing', () => expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1 }));
});

describe('auroc', () => {
  it('is 1 for perfect separation, 0 for reversed, 0.5 for constant scores', () => {
    expect(auroc([1, 2, 3, 4], [false, false, true, true])).toBe(1);
    expect(auroc([4, 3, 2, 1], [false, false, true, true])).toBe(0);
    expect(auroc([1, 1, 1, 1], [false, true, false, true])).toBe(0.5);
  });
  it('agrees with the pairwise definition (ties half) on random data', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.boolean()), { minLength: 4, maxLength: 40 }), (rows) => {
        const s = rows.map((r) => r[0]);
        const l = rows.map((r) => r[1]);
        const P = s.filter((_, i) => l[i]);
        const N = s.filter((_, i) => !l[i]);
        if (!P.length || !N.length) return Number.isNaN(auroc(s, l));
        let sum = 0;
        for (const p of P) for (const n of N) sum += p > n ? 1 : p === n ? 0.5 : 0;
        return Math.abs(auroc(s, l) - sum / (P.length * N.length)) < 1e-9;
      }),
    );
  });
  it('is NaN when a class is empty', () => expect(auroc([1, 2], [true, true])).toBeNaN());
});

describe('other metrics', () => {
  it('average precision is 1 when positives rank first and low when they rank last', () => {
    expect(averagePrecision([3, 2, 1], [true, false, false])).toBe(1);
    expect(averagePrecision([3, 2, 1], [false, false, true])).toBeCloseTo(1 / 3, 6);
  });
  it('brier is 0 for perfect and 1 for perfectly wrong', () => {
    expect(brier([1, 0], [true, false])).toBe(0);
    expect(brier([0, 1], [true, false])).toBe(1);
  });
  it('calibration bins hold every point once', () => {
    const p = [0.05, 0.1, 0.5, 0.55, 0.95, 1];
    const bins = calibration(p, [false, false, true, false, true, true], 5);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(p.length);
  });
  it('quantiles interpolate', () => expect(quantileOf([1, 2, 3, 4], 0.5)).toBe(2.5));
  it('bootstrap is deterministic for a seed and brackets the estimate', () => {
    const s = Array.from({ length: 60 }, (_, i) => i + (i % 3 === 0 ? 40 : 0));
    const l = s.map((_, i) => i % 3 === 0);
    const run = () => bootstrapCI(60, (idx) => auroc(idx.map((i) => s[i]), idx.map((i) => l[i])), makeRng(7));
    expect(run()).toEqual(run());
    const ci = run();
    const est = auroc(s, l);
    expect(ci.lo).toBeLessThanOrEqual(est);
    expect(ci.hi).toBeGreaterThanOrEqual(est);
  });
});
