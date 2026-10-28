import { describe, expect, it } from 'vitest';
import { explainRow, fitFactorModel, scoreRow, topReasons } from '@/engine/factor-model';
import { fitSparseLogistic, predictSparse } from '@/engine/sparse-logistic';
import {
  atBudget, bandEdges, bandOf, evaluatePredictions, fitPlatt, rankOrder, runTarget, tieBreaker,
  type Declaration, type Splits,
} from '@/engine/benchmark';
import { makeRng } from '@/engine';

const logit = (p: number) => Math.log(p / (1 - p));

describe('factor model', () => {
  const rows = [
    ...Array.from({ length: 100 }, () => ({ origin: 'CN', mode: 'sea' })),
    ...Array.from({ length: 100 }, () => ({ origin: 'DE', mode: 'sea' })),
  ];
  const labels = rows.map((r, i) => (r.origin === 'CN' ? i % 4 === 0 : i % 20 === 0));
  const specs = [{ name: 'origin' }, { name: 'mode' }];

  it('explains every score exactly as the base plus the factor contributions', () => {
    const m = fitFactorModel(rows, labels, specs, 5);
    for (const r of [{ origin: 'CN', mode: 'sea' }, { origin: 'DE', mode: 'sea' }, { origin: 'ZZ', mode: 'air' }]) {
      const e = explainRow(m, r);
      expect(e.score).toBeCloseTo(e.baseLogit + e.contributions.reduce((a, c) => a + c.contribution, 0), 12);
      expect(scoreRow(m, r)).toBe(e.score);
    }
  });

  it('ranks the riskier level higher and gives an unseen level no contribution', () => {
    const m = fitFactorModel(rows, labels, specs, 5);
    expect(scoreRow(m, { origin: 'CN', mode: 'sea' })).toBeGreaterThan(scoreRow(m, { origin: 'DE', mode: 'sea' }));
    const unseen = explainRow(m, { origin: 'ZZ', mode: 'air' });
    expect(unseen.contributions.every((c) => c.contribution === 0)).toBe(true);
    expect(unseen.score).toBeCloseTo(m.baseLogit, 12);
  });

  it('trusts a rarely seen level less when the pseudo count is larger', () => {
    const r = [{ f: 'a' }, ...Array.from({ length: 50 }, () => ({ f: 'b' }))];
    const y = [true, ...Array.from({ length: 50 }, () => false)];
    const loose = fitFactorModel(r, y, [{ name: 'f' }], 0);
    const tight = fitFactorModel(r, y, [{ name: 'f' }], 20);
    expect(scoreRow(loose, { f: 'a' })).toBeGreaterThan(scoreRow(tight, { f: 'a' }));
  });

  it('adds only what the parent does not already say, so a chain telescopes (hand computed)', () => {
    // 100 rows in group 84; 40 of them are 8471 (10 positive), 60 are 8473 (6 positive). k = 4.
    const r = [
      ...Array.from({ length: 40 }, () => ({ c2: '84', c4: '8471' })),
      ...Array.from({ length: 60 }, () => ({ c2: '84', c4: '8473' })),
    ];
    const y = r.map((_, i) => (i < 10 ? true : i >= 40 && i < 46));
    const m = fitFactorModel(r, y, [{ name: 'c2' }, { name: 'c4', parent: 'c2' }], 4);
    const base = (16 + 0.5) / (100 + 1);
    const r2 = (16 + 4 * base) / (100 + 4);
    const r4 = (10 + 4 * r2) / (40 + 4);
    const e = explainRow(m, r[0]);
    expect(e.contributions[0].contribution).toBeCloseTo(logit(r2) - logit(base), 10);
    expect(e.contributions[1].contribution).toBeCloseTo(logit(r4) - logit(r2), 10);
    expect(e.score).toBeCloseTo(logit(r4), 10);
  });

  it('lists the reasons that mattered most first', () => {
    const m = fitFactorModel(rows, labels, specs, 1);
    const reasons = topReasons(explainRow(m, { origin: 'CN', mode: 'sea' }), 2);
    expect(Math.abs(reasons[0].contribution)).toBeGreaterThanOrEqual(Math.abs(reasons[reasons.length - 1].contribution));
  });

  it('rejects a parent that is not listed before its child, and mismatched inputs', () => {
    expect(() => fitFactorModel([{ a: 'x' }], [true], [{ name: 'b', parent: 'a' }, { name: 'a' }], 1)).toThrow(/parent/);
    expect(() => fitFactorModel([{ a: 'x' }], [], [{ name: 'a' }], 1)).toThrow(/length/);
  });
});

describe('sparse logistic', () => {
  it('learns a planted one hot rule and is repeatable for a seed', () => {
    const rng = makeRng(3);
    const rows = Array.from({ length: 2000 }, () => ({ idx: [rng.int(0, 9)], dense: [rng.next()] }));
    const y = rows.map((r) => r.idx[0] === 7 && rng.chance(0.9));
    const a = fitSparseLogistic(rows, y, { dim: 10, l2: 0.001, seed: 2 });
    const b = fitSparseLogistic(rows, y, { dim: 10, l2: 0.001, seed: 2 });
    expect(predictSparse(a, { idx: [7], dense: [0.5] })).toBeGreaterThan(predictSparse(a, { idx: [2], dense: [0.5] }));
    expect(Array.from(a.weights)).toEqual(Array.from(b.weights));
  });
});

describe('ranking helpers', () => {
  it('computes precision, recall and lift at a budget with a known answer', () => {
    const scores = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const labels = [true, true, false, false, false, false, false, false, false, true];
    const tie = scores.map((_, i) => i);
    const p = atBudget(scores, labels, tie, 0.2);
    expect(p.inspected).toBe(2);
    expect(p.precision).toBe(1);
    expect(p.recall).toBeCloseTo(2 / 3, 12);
    expect(p.lift).toBeCloseTo(1 / 0.3, 12);
  });

  it('breaks ties with a permutation rather than by file order', () => {
    const tie = tieBreaker(1000, makeRng(1));
    expect([...tie].sort((a, b) => a - b)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    expect(tie).not.toEqual(Array.from({ length: 1000 }, (_, i) => i));
    const order = rankOrder(Array(1000).fill(1), tie);
    expect(order).not.toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it('puts prices into deciles', () => {
    const prices = Array.from({ length: 1000 }, (_, i) => i + 1);
    const edges = bandEdges(prices);
    expect(edges).toHaveLength(9);
    expect(bandOf(1, edges)).toBe('b0');
    expect(bandOf(1000, edges)).toBe('b9');
  });

  it('Platt scaling gives higher probability to higher scores', () => {
    const rng = makeRng(5);
    const s = Array.from({ length: 2000 }, () => rng.next() * 4 - 2);
    const y = s.map((v) => rng.next() < 1 / (1 + Math.exp(-v)));
    const { a } = fitPlatt(s, y);
    expect(a).toBeGreaterThan(0.5);
  });
});

/** A dataset with a planted signal: origin XX is risky, everything else is noise. */
function planted(n: number, seed: number): Declaration[] {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => {
    const origin = rng.chance(0.2) ? 'XX' : rng.pick(['AA', 'BB', 'CC', 'DD']);
    const fraud = rng.chance(origin === 'XX' ? 0.35 : 0.05);
    return {
      importer: `I${rng.int(0, 200)}`,
      hs6: String(rng.int(100000, 100050)),
      origin,
      departure: rng.pick(['P', 'Q']),
      mode: rng.pick(['10', '40']),
      price: Math.exp(rng.next() * 6),
      fraud,
      critical: fraud && rng.chance(0.2),
    };
  });
}

describe('pipeline on a planted signal', () => {
  const splits: Splits = { train: planted(6000, 1), valid: planted(1500, 2), test: planted(1500, 3) };
  const fraud = runTarget(splits, 'fraud');
  const critical = runTarget(splits, 'critical');

  it('finds the planted signal with the explainable model and not with value alone', () => {
    const m = (id: string) => fraud.methods.find((x) => x.id === id)!;
    expect(m('M3').testAuc).toBeGreaterThan(0.65);
    expect(m('M4').testAuc).toBeGreaterThan(0.65);
    expect(Math.abs(m('M1').testAuc - 0.5)).toBeLessThan(0.06);
    expect(m('M3').aucCi.lo).toBeLessThan(m('M3').testAuc);
    expect(m('M3').aucCi.hi).toBeGreaterThan(m('M3').testAuc);
  });

  it('random order has lift near one and the shuffled label control has no skill', () => {
    for (const b of fraud.random.budgets) expect(Math.abs(b.lift - 1)).toBeLessThan(0.15);
    for (const a of fraud.permutation) expect(Math.abs(a - 0.5)).toBeLessThan(0.05);
  });

  it('keeps the exact explanation property and reports calibrated skill', () => {
    expect(fraud.structuralMaxError).toBeLessThan(1e-9);
    expect(fraud.brierSkillM3.skill).toBeGreaterThan(0);
  });

  it('evaluates every preregistered prediction, marking P11 as structural', () => {
    const preds = evaluatePredictions(fraud, critical);
    expect(preds.map((p) => p.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11']);
    expect(preds.find((p) => p.id === 'P11')!.structural).toBe(true);
    // Without the reference model, the two predictions that need it cannot be a hit.
    expect(preds.find((p) => p.id === 'P1')!.hit).toBe(false);
    expect(preds.find((p) => p.id === 'P5')!.hit).toBe(false);
  });
});
