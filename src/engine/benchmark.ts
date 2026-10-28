/**
 * Ranking benchmark for risk scoring on declaration data that Madoun did not generate.
 *
 * The method, models, grids, metrics and predictions are fixed in docs/preregistration-benchmark.md,
 * which was committed before this file existed. This module only computes; reading files and writing
 * the report happen in scripts/benchmark.ts.
 *
 * Pure and deterministic for a given seed.
 */
import { explainRow, fitFactorModel, scoreRow as factorScore, type FactorModel, type FactorRow, type FactorSpec } from './factor-model';
import { makeRng, type Rng } from './rng';
import { fitSparseLogistic, predictSparse, type SparseLogistic, type SparseRow } from './sparse-logistic';
import { auroc, averagePrecision, brier, quantileOf } from './stats';

/** The columns the Madoun model is allowed to see, plus the two labels. */
export interface Declaration {
  importer: string;
  hs6: string;
  origin: string;
  departure: string;
  mode: string;
  price: number;
  fraud: boolean;
  /** Critical fraud: a case that may threaten public safety. */
  critical: boolean;
}

export type Target = 'fraud' | 'critical';
export const BUDGETS = [0.05, 0.1, 0.2] as const;
export const K_GRID = [1, 2, 5, 10, 20, 50, 100] as const;
export const L2_GRID = [0.0001, 0.001, 0.01, 0.1] as const;
export const MIN_LEVEL_COUNT = 20;
export const BOOTSTRAP_REPS = 1000;

/** The factors Madoun offers the model. All are criteria the WTO Trade Facilitation Agreement permits. */
export const FACTOR_SPECS: FactorSpec[] = [
  { name: 'hs2' },
  { name: 'hs4', parent: 'hs2' },
  { name: 'hs6', parent: 'hs4' },
  { name: 'origin' },
  { name: 'departure' },
  { name: 'mode' },
  { name: 'band' },
  { name: 'importer' },
];
const IMPORTER_ONLY: FactorSpec[] = [{ name: 'importer' }];

export const label = (d: Declaration, t: Target) => (t === 'fraud' ? d.fraud : d.critical);

/* ---------------- features ---------------- */

/** Upper edges of the value bands: deciles of the training prices. */
export function bandEdges(trainPrices: number[], bands = 10): number[] {
  return Array.from({ length: bands - 1 }, (_, i) => quantileOf(trainPrices, (i + 1) / bands));
}

export function bandOf(price: number, edges: number[]): string {
  let b = 0;
  while (b < edges.length && price > edges[b]) b++;
  return `b${b}`;
}

export function factorRow(d: Declaration, edges: number[]): FactorRow {
  return {
    hs2: d.hs6.slice(0, 2),
    hs4: d.hs6.slice(0, 4),
    hs6: d.hs6,
    origin: d.origin,
    departure: d.departure,
    mode: d.mode,
    band: bandOf(d.price, edges),
    importer: d.importer,
  };
}

/* ---------------- ranking metrics ---------------- */

/** Order of row indices, highest score first; ties are broken by a seeded permutation so no method gains from file order. */
export function rankOrder(scores: readonly number[], tie: readonly number[]): number[] {
  return scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || tie[a] - tie[b]);
}

export function tieBreaker(n: number, rng: Rng): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const rank = new Array<number>(n);
  perm.forEach((original, position) => (rank[original] = position));
  return rank;
}

export interface BudgetPoint {
  budget: number;
  inspected: number;
  precision: number;
  recall: number;
  lift: number;
}

export function atBudget(scores: readonly number[], labels: readonly boolean[], tie: readonly number[], budget: number): BudgetPoint {
  const n = scores.length;
  const positives = labels.filter(Boolean).length;
  const take = Math.max(1, Math.round(budget * n));
  const order = rankOrder(scores, tie);
  let hits = 0;
  for (let r = 0; r < take; r++) if (labels[order[r]]) hits++;
  const precision = hits / take;
  const base = positives / n;
  return { budget, inspected: take, precision, recall: positives ? hits / positives : NaN, lift: base ? precision / base : NaN };
}

/* ---------------- models ---------------- */

export interface Scored {
  valid: number[];
  test: number[];
}

interface Tuned<P> {
  param: P;
  validAuc: number;
}

function bestOf<P>(grid: readonly P[], fit: (p: P) => number): Tuned<P> {
  let best: Tuned<P> | undefined;
  for (const p of grid) {
    const a = fit(p);
    if (!best || a > best.validAuc) best = { param: p, validAuc: a };
  }
  return best!;
}

function factorScores(model: FactorModel, rows: readonly FactorRow[]): number[] {
  return rows.map((r) => factorScore(model, r));
}

/** One hot vocabulary: levels seen at least MIN_LEVEL_COUNT times in training, everything else shares "other". */
function buildVocabulary(rows: readonly FactorRow[], names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) for (const n of names) counts.set(`${n}=${r[n]}`, (counts.get(`${n}=${r[n]}`) ?? 0) + 1);
  const vocab = new Map<string, number>();
  for (const n of names) vocab.set(`${n}=other`, vocab.size);
  for (const [key, c] of counts) if (c >= MIN_LEVEL_COUNT && !vocab.has(key)) vocab.set(key, vocab.size);
  return vocab;
}

function sparseRows(rows: readonly FactorRow[], prices: readonly number[], names: readonly string[], vocab: Map<string, number>, mu: number, sd: number): SparseRow[] {
  return rows.map((r, i) => ({
    idx: names.map((n) => vocab.get(`${n}=${r[n]}`) ?? vocab.get(`${n}=other`)!),
    dense: [(Math.log1p(prices[i]) - mu) / sd],
  }));
}

export interface ModelRun {
  id: 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
  name: string;
  scores: Scored;
  /** Chosen hyperparameter, when there was one. */
  chosen?: string;
  validAuc: number;
}

export interface Trained {
  runs: ModelRun[];
  m3: FactorModel;
  edges: number[];
  m3Rows: { valid: FactorRow[]; test: FactorRow[] };
}

export interface Splits {
  train: Declaration[];
  valid: Declaration[];
  test: Declaration[];
}

/** Fits M1 to M4 for one target. `ceiling` carries M5 scores computed elsewhere (see scripts/ceiling.py). */
export function trainModels(splits: Splits, target: Target, ceiling?: Scored): Trained {
  const { train, valid, test } = splits;
  const edges = bandEdges(train.map((d) => d.price));
  const rows = { train: train.map((d) => factorRow(d, edges)), valid: valid.map((d) => factorRow(d, edges)), test: test.map((d) => factorRow(d, edges)) };
  const y = { train: train.map((d) => label(d, target)), valid: valid.map((d) => label(d, target)), test: test.map((d) => label(d, target)) };
  const runs: ModelRun[] = [];

  // M1: highest declared value first.
  runs.push({ id: 'M1', name: 'Highest declared value first', scores: { valid: valid.map((d) => d.price), test: test.map((d) => d.price) }, validAuc: auroc(valid.map((d) => d.price), y.valid) });

  // M2: the importer's smoothed past rate.
  const m2 = bestOf(K_GRID, (k) => auroc(factorScores(fitFactorModel(rows.train, y.train, IMPORTER_ONLY, k), rows.valid), y.valid));
  const m2Model = fitFactorModel(rows.train, y.train, IMPORTER_ONLY, m2.param);
  runs.push({ id: 'M2', name: 'Trader history', scores: { valid: factorScores(m2Model, rows.valid), test: factorScores(m2Model, rows.test) }, chosen: `k = ${m2.param}`, validAuc: m2.validAuc });

  // M3: the explainable factor model.
  const m3 = bestOf(K_GRID, (k) => auroc(factorScores(fitFactorModel(rows.train, y.train, FACTOR_SPECS, k), rows.valid), y.valid));
  const m3Model = fitFactorModel(rows.train, y.train, FACTOR_SPECS, m3.param);
  runs.push({ id: 'M3', name: 'Madoun factor model', scores: { valid: factorScores(m3Model, rows.valid), test: factorScores(m3Model, rows.test) }, chosen: `k = ${m3.param}`, validAuc: m3.validAuc });

  // M4: logistic regression on the same permitted inputs.
  const names = FACTOR_SPECS.map((s) => s.name);
  const vocab = buildVocabulary(rows.train, names);
  const logs = train.map((d) => Math.log1p(d.price));
  const mu = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mu) ** 2, 0) / logs.length) || 1;
  const sp = {
    train: sparseRows(rows.train, train.map((d) => d.price), names, vocab, mu, sd),
    valid: sparseRows(rows.valid, valid.map((d) => d.price), names, vocab, mu, sd),
    test: sparseRows(rows.test, test.map((d) => d.price), names, vocab, mu, sd),
  };
  const fit4 = (l2: number): SparseLogistic => fitSparseLogistic(sp.train, y.train, { dim: vocab.size, l2, seed: 1 });
  const m4 = bestOf(L2_GRID, (l2) => {
    const m = fit4(l2);
    return auroc(sp.valid.map((r) => predictSparse(m, r)), y.valid);
  });
  const m4Model = fit4(m4.param);
  runs.push({
    id: 'M4',
    name: 'Logistic regression',
    scores: { valid: sp.valid.map((r) => predictSparse(m4Model, r)), test: sp.test.map((r) => predictSparse(m4Model, r)) },
    chosen: `penalty = ${m4.param}`,
    validAuc: m4.validAuc,
  });

  if (ceiling) runs.push({ id: 'M5', name: 'Unconstrained reference (LightGBM, all columns)', scores: ceiling, validAuc: auroc(ceiling.valid, y.valid) });
  return { runs, m3: m3Model, edges, m3Rows: { valid: rows.valid, test: rows.test } };
}

/* ---------------- Platt scaling and Brier skill ---------------- */

/** Fits p = sigmoid(a * score + b) by Newton's method on the validation months. */
export function fitPlatt(scores: readonly number[], labels: readonly boolean[]): { a: number; b: number } {
  let a = 1;
  let b = 0;
  for (let it = 0; it < 50; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    scores.forEach((s, i) => {
      const p = 1 / (1 + Math.exp(-(a * s + b)));
      const e = p - (labels[i] ? 1 : 0);
      const w = p * (1 - p) + 1e-9;
      ga += e * s; gb += e;
      haa += w * s * s; hab += w * s; hbb += w;
    });
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da; b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return { a, b };
}

export function brierSkill(run: ModelRun, validLabels: readonly boolean[], testLabels: readonly boolean[], trainBaseRate: number): { brier: number; baseline: number; skill: number } {
  const { a, b } = fitPlatt(run.scores.valid, validLabels);
  const p = run.scores.test.map((s) => 1 / (1 + Math.exp(-(a * s + b))));
  const m = brier(p, [...testLabels]);
  const base = brier(p.map(() => trainBaseRate), [...testLabels]);
  return { brier: m, baseline: base, skill: 1 - m / base };
}

/* ---------------- the full report ---------------- */

export interface MethodResult {
  id: string;
  name: string;
  chosen?: string;
  validAuc: number;
  testAuc: number;
  aucCi: { lo: number; hi: number };
  averagePrecision: number;
  budgets: BudgetPoint[];
  precisionAt10Ci: { lo: number; hi: number };
}

export interface TargetReport {
  target: Target;
  baseRate: { train: number; valid: number; test: number };
  counts: { train: number; valid: number; test: number; positivesTest: number };
  random: { budgets: BudgetPoint[] };
  methods: MethodResult[];
  /** Paired 95 percent interval for AUC(A) minus AUC(B). */
  paired: { a: string; b: string; diff: number; lo: number; hi: number }[];
  brierSkillM3: { brier: number; baseline: number; skill: number };
  permutation: number[];
  structuralMaxError: number;
}

function shuffled(labels: readonly boolean[], seed: number): boolean[] {
  const rng = makeRng(seed);
  const out = [...labels];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function runTarget(splits: Splits, target: Target, ceiling?: Scored, seed = 1): TargetReport {
  const trained = trainModels(splits, target, ceiling);
  const yTrain = splits.train.map((d) => label(d, target));
  const yValid = splits.valid.map((d) => label(d, target));
  const yTest = splits.test.map((d) => label(d, target));
  const n = yTest.length;
  const rate = (y: boolean[]) => y.filter(Boolean).length / y.length;
  const tie = tieBreaker(n, makeRng(seed));

  // Bootstrap: the same resamples for every method, so differences are paired.
  const rng = makeRng(seed);
  const reps = BOOTSTRAP_REPS;
  const aucs: Record<string, number[]> = {};
  const p10: Record<string, number[]> = {};
  for (const r of trained.runs) { aucs[r.id] = []; p10[r.id] = []; }
  for (let rep = 0; rep < reps; rep++) {
    const idx = Array.from({ length: n }, () => Math.floor(rng.next() * n));
    const yb = idx.map((i) => yTest[i]);
    const tb = idx.map((i) => tie[i]);
    for (const r of trained.runs) {
      const sb = idx.map((i) => r.scores.test[i]);
      const a = auroc(sb, yb);
      if (!Number.isNaN(a)) aucs[r.id].push(a);
      p10[r.id].push(atBudget(sb, yb, tb, 0.1).precision);
    }
  }
  // Paired differences need aligned replicates, so recompute them from the same stream.
  const pairedFor = (a: string, b: string) => {
    const ra = trained.runs.find((r) => r.id === a)!;
    const rb = trained.runs.find((r) => r.id === b)!;
    const rng2 = makeRng(seed);
    const diffs: number[] = [];
    for (let rep = 0; rep < reps; rep++) {
      const idx = Array.from({ length: n }, () => Math.floor(rng2.next() * n));
      const yb = idx.map((i) => yTest[i]);
      const d = auroc(idx.map((i) => ra.scores.test[i]), yb) - auroc(idx.map((i) => rb.scores.test[i]), yb);
      if (!Number.isNaN(d)) diffs.push(d);
    }
    const point = auroc(ra.scores.test, yTest) - auroc(rb.scores.test, yTest);
    return { a, b, diff: point, lo: quantileOf(diffs, 0.025), hi: quantileOf(diffs, 0.975) };
  };

  const methods: MethodResult[] = trained.runs.map((r) => ({
    id: r.id,
    name: r.name,
    chosen: r.chosen,
    validAuc: r.validAuc,
    testAuc: auroc(r.scores.test, yTest),
    aucCi: { lo: quantileOf(aucs[r.id], 0.025), hi: quantileOf(aucs[r.id], 0.975) },
    averagePrecision: averagePrecision(r.scores.test, yTest),
    budgets: BUDGETS.map((b) => atBudget(r.scores.test, yTest, tie, b)),
    precisionAt10Ci: { lo: quantileOf(p10[r.id], 0.025), hi: quantileOf(p10[r.id], 0.975) },
  }));

  // M0: the mean of 200 seeded random orders.
  const rand = BUDGETS.map((b) => {
    const pts = Array.from({ length: 200 }, (_, s) => {
      const r = makeRng(s + 1000);
      const scores = Array.from({ length: n }, () => r.next());
      return atBudget(scores, yTest, tie, b);
    });
    const avg = (f: (p: BudgetPoint) => number) => pts.reduce((a, p) => a + f(p), 0) / pts.length;
    return { budget: b, inspected: pts[0].inspected, precision: avg((p) => p.precision), recall: avg((p) => p.recall), lift: avg((p) => p.lift) };
  });

  const m3 = trained.runs.find((r) => r.id === 'M3')!;
  const pairs = [pairedFor('M2', 'M1')];
  if (trained.runs.some((r) => r.id === 'M5')) pairs.push(pairedFor('M3', 'M5'));
  pairs.push(pairedFor('M4', 'M3'));

  // Negative control: shuffled training labels, the k chosen on the real labels.
  const k = Number((m3.chosen ?? 'k = 10').replace('k = ', ''));
  const permAucs = [1, 2, 3, 4, 5].map((s) => {
    const edges = trained.edges;
    const trainRows = splits.train.map((d) => factorRow(d, edges));
    const model = fitFactorModel(trainRows, shuffled(yTrain, s), FACTOR_SPECS, k);
    return auroc(factorScores(model, trained.m3Rows.test), yTest);
  });

  // Structural check: every score equals its base plus its contributions.
  let maxErr = 0;
  for (const row of trained.m3Rows.test) {
    const e = explainRow(trained.m3, row);
    maxErr = Math.max(maxErr, Math.abs(e.score - (e.baseLogit + e.contributions.reduce((a, c) => a + c.contribution, 0))), Math.abs(e.score - factorScore(trained.m3, row)));
  }

  return {
    target,
    baseRate: { train: rate(yTrain), valid: rate(yValid), test: rate(yTest) },
    counts: { train: yTrain.length, valid: yValid.length, test: n, positivesTest: yTest.filter(Boolean).length },
    random: { budgets: rand },
    methods,
    paired: pairs,
    brierSkillM3: brierSkill(m3, yValid, yTest, rate(yTrain)),
    permutation: permAucs,
    structuralMaxError: maxErr,
  };
}

/* ---------------- predictions ---------------- */

export interface PredictionResult {
  id: string;
  statement: string;
  hit: boolean;
  structural?: boolean;
  detail: string;
}

const fmt = (x: number, d = 3) => x.toFixed(d);

export function evaluatePredictions(fraud: TargetReport, critical: TargetReport): PredictionResult[] {
  const m = (r: TargetReport, id: string) => r.methods.find((x) => x.id === id)!;
  const out: PredictionResult[] = [];
  const learned = ['M2', 'M3', 'M4', 'M5'].filter((id) => fraud.methods.some((x) => x.id === id));
  out.push({
    id: 'P1',
    statement: 'Every learned method ranks better than chance on Fraud.',
    hit: learned.length === 4 && learned.every((id) => m(fraud, id).aucCi.lo > 0.5),
    detail: learned.map((id) => `${id} lower bound ${fmt(m(fraud, id).aucCi.lo)}`).join(', ') + (learned.length < 4 ? ' (M5 missing)' : ''),
  });
  out.push({ id: 'P2', statement: 'Declared value alone is a weak ranking.', hit: m(fraud, 'M1').testAuc < 0.6, detail: `M1 AUC ${fmt(m(fraud, 'M1').testAuc)}` });
  const p3 = fraud.paired.find((p) => p.a === 'M2' && p.b === 'M1')!;
  out.push({ id: 'P3', statement: 'Trader history beats declared value.', hit: p3.diff > 0 && p3.lo > 0, detail: `difference ${fmt(p3.diff)}, interval ${fmt(p3.lo)} to ${fmt(p3.hi)}` });
  const m3f = m(fraud, 'M3');
  const m4f = m(fraud, 'M4');
  out.push({ id: 'P4', statement: 'The explainable model costs little against a plain linear model.', hit: m4f.testAuc - m3f.testAuc < 0.03, detail: `M4 ${fmt(m4f.testAuc)} minus M3 ${fmt(m3f.testAuc)} = ${fmt(m4f.testAuc - m3f.testAuc)}` });
  const m5f = fraud.methods.find((x) => x.id === 'M5');
  const share = m5f ? (m3f.testAuc - 0.5) / (m5f.testAuc - 0.5) : NaN;
  out.push({ id: 'P5', statement: 'The explainable model keeps most of the ranking skill of the unconstrained reference.', hit: share >= 0.8, detail: m5f ? `(${fmt(m3f.testAuc)} - 0.5) / (${fmt(m5f.testAuc)} - 0.5) = ${fmt(share)}` : 'M5 missing' });
  const lift10 = m3f.budgets.find((b) => b.budget === 0.1)!.lift;
  out.push({ id: 'P6', statement: 'At a 10 percent inspection budget the explainable model more than doubles the base rate.', hit: lift10 >= 2, detail: `lift ${fmt(lift10, 2)}` });
  out.push({ id: 'P7', statement: 'The later period is harder than the validation period.', hit: m3f.validAuc - m3f.testAuc > 0, detail: `validation ${fmt(m3f.validAuc)}, test ${fmt(m3f.testAuc)}` });
  const m3c = m(critical, 'M3');
  out.push({ id: 'P8', statement: 'Rare critical cases are harder to rank than fraud in general.', hit: m3c.testAuc < m3f.testAuc, detail: `critical ${fmt(m3c.testAuc)}, fraud ${fmt(m3f.testAuc)}` });
  out.push({ id: 'P9', statement: 'Negative control: with training labels shuffled, M3 has no skill.', hit: fraud.permutation.every((a) => Math.abs(a - 0.5) <= 0.02), detail: fraud.permutation.map((a) => fmt(a)).join(', ') });
  out.push({ id: 'P10', statement: 'The explainable model is useful as a probability, not only as an order.', hit: fraud.brierSkillM3.skill > 0, detail: `Brier ${fmt(fraud.brierSkillM3.brier, 4)} against constant ${fmt(fraud.brierSkillM3.baseline, 4)}, skill ${fmt(fraud.brierSkillM3.skill, 4)}` });
  out.push({ id: 'P11', statement: 'Structural check: every score equals its base plus its factor contributions.', hit: fraud.structuralMaxError < 1e-9, structural: true, detail: `largest difference ${fraud.structuralMaxError.toExponential(1)}` });
  return out;
}
