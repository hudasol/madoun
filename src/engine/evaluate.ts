/**
 * Model checks for the risk engine, run against the generator's hidden ground truth.
 *
 * What this can and cannot show. The synthetic generator decides who violates from the trader's
 * compliance score and from under-declared value, and the rule engine reads the same facts, so a
 * good score here is partly circular. The checks are still worth running because they catch the
 * failures that do not depend on that: lanes that do not order risk, a rule set beaten by a trivial
 * baseline, a burden that falls unevenly, or a learned challenger that finds signal the hand weights
 * miss. They are not evidence about real traffic.
 */
import { makeRng } from './rng';
import { auroc, averagePrecision, bootstrapCI, brier, calibration, wilson, type CalibrationBin } from './stats';
import type { Lane } from './types';

export interface EvalCase {
  /** True if the hidden ground truth contains a violation. */
  label: boolean;
  lane: Lane;
  /** Rule-engine score: the highest per-authority score. */
  score: number;
  /** Feature vector for the learned challenger (see FEATURE_NAMES). */
  features: number[];
  /** Single-fact baselines. Higher means riskier. */
  valueRisk: number;
  traderRisk: number;
  band: 'low' | 'mid' | 'high';
  aeo: boolean;
  /** 0 = train half, 1 = test half. */
  fold: 0 | 1;
}

export const FEATURE_NAMES = [
  'compliance score (lower is riskier)',
  'confirmed past findings',
  'authorised operator',
  'declared value looks low',
  'declared value looks high',
  'first shipment from this origin',
  'road consignment',
  'documents missing or invalid',
  'customs category points',
] as const;

/* ---------------- logistic regression (the challenger) ---------------- */

export interface Logistic {
  w: number[];
  b: number;
  mean: number[];
  sd: number[];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Full-batch gradient descent with L2 shrinkage on standardised features. Deterministic. */
export function fitLogistic(X: number[][], y: boolean[], { iterations = 600, lr = 0.3, l2 = 0.05 } = {}): Logistic {
  const d = X[0]?.length ?? 0;
  const n = X.length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / n);
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / sd[j]));
  const w = new Array<number>(d).fill(0);
  // Start the intercept at the base rate's log-odds so early steps are not wasted on it.
  const pos = y.filter(Boolean).length;
  let b = Math.log(Math.max(1, pos) / Math.max(1, n - pos));
  for (let it = 0; it < iterations; it++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const err = sigmoid(z) - (y[i] ? 1 : 0);
      gb += err;
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  return { w, b, mean, sd };
}

export function predictLogistic(m: Logistic, x: number[]): number {
  let z = m.b;
  for (let j = 0; j < m.w.length; j++) z += (m.w[j] * (x[j] - m.mean[j])) / m.sd[j];
  return sigmoid(z);
}

/* ---------------- the report ---------------- */

export interface MethodResult {
  name: 'rules' | 'challenger' | 'trader-only' | 'value-only' | 'random';
  auroc: number;
  aurocCI: { lo: number; hi: number };
  averagePrecision: number;
  /** Share of violations caught when each method may check the same number of shipments as the rules do. */
  recallAtSameBurden: number;
}

export interface EvalReport {
  seeds: number;
  shipments: number;
  violations: number;
  testShipments: number;
  testViolations: number;
  baseRate: { rate: number; lo: number; hi: number };
  lanes: { lane: Lane; n: number; violations: number; rate: number; lo: number; hi: number }[];
  policy: { burden: number; recall: number; recallCI: { lo: number; hi: number }; precision: number; missedInGreen: number };
  methods: MethodResult[];
  challenger: { brier: number; baselineBrier: number; calibration: CalibrationBin[]; coefficients: { name: string; weight: number }[] };
  segments: { key: string; n: number; flagged: number; flaggedPct: number; falseFlags: number; falseFlagRate: number; lo: number; hi: number }[];
}

const pick = <T>(arr: T[], idx: number[]) => idx.map((i) => arr[i]);

function recallAtK(scores: number[], labels: boolean[], k: number): number {
  const total = labels.filter(Boolean).length;
  if (!total) return NaN;
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  return order.slice(0, k).filter((i) => labels[i]).length / total;
}

export function evaluateCases(cases: EvalCase[], seeds: number, rngSeed = 11): EvalReport {
  const all = cases;
  const train = all.filter((c) => c.fold === 0);
  const test = all.filter((c) => c.fold === 1);

  const lanes = (['green', 'amber', 'red'] as Lane[]).map((lane) => {
    const sub = all.filter((c) => c.lane === lane);
    const v = sub.filter((c) => c.label).length;
    return { lane, n: sub.length, violations: v, rate: sub.length ? v / sub.length : 0, ...wilson(v, sub.length) };
  });

  const violations = all.filter((c) => c.label).length;
  const flagged = all.filter((c) => c.lane !== 'green');
  const caught = flagged.filter((c) => c.label).length;
  const recallCI = bootstrapCI(all.length, (idx) => {
    const s = pick(all, idx);
    const v = s.filter((c) => c.label).length;
    return v ? s.filter((c) => c.label && c.lane !== 'green').length / v : NaN;
  }, makeRng(rngSeed));

  // Challenger: fit on the train half, scored on the held-out half only.
  const model = fitLogistic(train.map((c) => c.features), train.map((c) => c.label));
  const probs = test.map((c) => predictLogistic(model, c.features));
  const labels = test.map((c) => c.label);
  const trainRate = train.filter((c) => c.label).length / Math.max(1, train.length);
  const rng = makeRng(rngSeed + 1);
  const randomScores = test.map(() => rng.next());

  const kTest = test.filter((c) => c.lane !== 'green').length;
  const scoresBy: Record<MethodResult['name'], number[]> = {
    rules: test.map((c) => c.score),
    challenger: probs,
    'trader-only': test.map((c) => c.traderRisk),
    'value-only': test.map((c) => c.valueRisk),
    random: randomScores,
  };
  const methods = (Object.keys(scoresBy) as MethodResult['name'][]).map((name) => {
    const sc = scoresBy[name];
    return {
      name,
      auroc: auroc(sc, labels),
      aurocCI: bootstrapCI(test.length, (idx) => auroc(pick(sc, idx), pick(labels, idx)), makeRng(rngSeed + 2)),
      averagePrecision: averagePrecision(sc, labels),
      recallAtSameBurden: recallAtK(sc, labels, kTest),
    };
  });

  const segs: EvalReport['segments'] = [];
  const addSeg = (key: string, sub: EvalCase[]) => {
    const fl = sub.filter((c) => c.lane !== 'green');
    const ff = fl.filter((c) => !c.label).length;
    segs.push({ key, n: sub.length, flagged: fl.length, flaggedPct: sub.length ? fl.length / sub.length : 0, falseFlags: ff, falseFlagRate: fl.length ? ff / fl.length : 0, ...wilson(ff, fl.length) });
  };
  for (const band of ['low', 'mid', 'high'] as const) addSeg(`band:${band}`, all.filter((c) => c.band === band));
  addSeg('aeo:yes', all.filter((c) => c.aeo));
  addSeg('aeo:no', all.filter((c) => !c.aeo));

  return {
    seeds,
    shipments: all.length,
    violations,
    testShipments: test.length,
    testViolations: labels.filter(Boolean).length,
    baseRate: { rate: all.length ? violations / all.length : 0, ...wilson(violations, all.length) },
    lanes,
    policy: {
      burden: all.length ? flagged.length / all.length : 0,
      recall: violations ? caught / violations : 0,
      recallCI,
      precision: flagged.length ? caught / flagged.length : 0,
      missedInGreen: violations - caught,
    },
    methods,
    challenger: {
      brier: brier(probs, labels),
      baselineBrier: brier(probs.map(() => trainRate), labels),
      calibration: calibration(probs, labels, 5),
      coefficients: FEATURE_NAMES.map((name, j) => ({ name, weight: model.w[j] })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    },
    segments: segs,
  };
}
