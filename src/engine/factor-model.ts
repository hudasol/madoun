/**
 * Explainable factor model: the additive risk score that Madoun's learning loop is built around,
 * made reusable so it can be fitted and tested on data that Madoun did not generate.
 *
 * A row is a set of named factor levels (for example `origin = "CN"`, `mode = "air"`). For every factor
 * the model keeps how often each level was followed by a confirmed finding, shrinks that rate toward
 * a parent level (or the overall rate) with a pseudo count `k` so that a level seen twice does not
 * look certain, and sums the log odds contributed by each factor. Every score therefore comes with an
 * exact explanation: the base log odds plus a list of factor contributions.
 *
 * Only criteria the WTO Trade Facilitation Agreement allows for risk management should be offered
 * as factors. The model cannot check that for you; the caller chooses the factors.
 *
 * Pure: no clock, no randomness, no input or output.
 */

export type FactorRow = Readonly<Record<string, string | undefined>>;

export interface FactorSpec {
  /** Name of the key in each row that holds this factor's level. */
  name: string;
  /** Optional coarser factor (for example HS4 for HS6). The child is shrunk toward it, and only adds what the parent does not already say. */
  parent?: string;
}

interface LevelStats {
  n: number;
  positives: number;
}

export interface FactorModel {
  k: number;
  specs: FactorSpec[];
  /** Overall fraction of positive rows in the training data. */
  baseRate: number;
  baseLogit: number;
  trainRows: number;
  levels: Record<string, Map<string, LevelStats>>;
}

export interface Contribution {
  factor: string;
  level: string;
  /** Change in log odds this factor adds on top of its parent (or the base rate). */
  contribution: number;
  /** Training rows that had this level (0 when the level was never seen). */
  support: number;
}

export interface Explained {
  /** Base log odds plus the sum of the contributions. */
  score: number;
  baseLogit: number;
  contributions: Contribution[];
}

const logit = (p: number) => Math.log(p / (1 - p));
const EPS = 1e-9;
const clamp = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));

function assertSpecs(specs: FactorSpec[]): void {
  const names = new Set<string>();
  for (const s of specs) {
    if (names.has(s.name)) throw new Error(`duplicate factor ${s.name}`);
    if (s.parent && !names.has(s.parent)) throw new Error(`factor ${s.name} names parent ${s.parent}, which must be listed before it`);
    names.add(s.name);
  }
}

/** Fits the model. `k` is the pseudo count: larger values trust rare levels less. */
export function fitFactorModel(rows: readonly FactorRow[], labels: readonly boolean[], specs: FactorSpec[], k: number): FactorModel {
  if (rows.length !== labels.length) throw new Error('rows and labels differ in length');
  if (!(k >= 0)) throw new Error('k must be zero or more');
  assertSpecs(specs);
  const positives = labels.filter(Boolean).length;
  const baseRate = clamp((positives + 0.5) / (rows.length + 1));
  const levels: Record<string, Map<string, LevelStats>> = {};
  for (const s of specs) levels[s.name] = new Map();
  rows.forEach((row, i) => {
    for (const s of specs) {
      const level = row[s.name];
      if (level === undefined || level === '') continue;
      const m = levels[s.name];
      const cur = m.get(level) ?? { n: 0, positives: 0 };
      cur.n++;
      if (labels[i]) cur.positives++;
      m.set(level, cur);
    }
  });
  return { k, specs, baseRate, baseLogit: logit(baseRate), trainRows: rows.length, levels };
}

/** Shrunk positive rate of a factor for this row: the level's rate pulled toward its parent's rate. */
function rateOf(model: FactorModel, name: string, row: FactorRow): number {
  const spec = model.specs.find((s) => s.name === name)!;
  const parentRate = spec.parent ? rateOf(model, spec.parent, row) : model.baseRate;
  const level = row[name];
  const stats = level === undefined || level === '' ? undefined : model.levels[name].get(level);
  if (!stats) return parentRate;
  return clamp((stats.positives + model.k * parentRate) / (stats.n + model.k));
}

/** Score with its exact decomposition. */
export function explainRow(model: FactorModel, row: FactorRow): Explained {
  const contributions: Contribution[] = model.specs.map((s) => {
    const level = row[s.name] ?? '';
    const own = logit(clamp(rateOf(model, s.name, row)));
    const before = s.parent ? logit(clamp(rateOf(model, s.parent, row))) : model.baseLogit;
    return { factor: s.name, level, contribution: own - before, support: model.levels[s.name].get(level)?.n ?? 0 };
  });
  const score = model.baseLogit + contributions.reduce((a, c) => a + c.contribution, 0);
  return { score, baseLogit: model.baseLogit, contributions };
}

export function scoreRow(model: FactorModel, row: FactorRow): number {
  return explainRow(model, row).score;
}

/** The factors that moved a score the most, largest absolute contribution first. */
export function topReasons(e: Explained, count = 3): Contribution[] {
  return [...e.contributions].filter((c) => c.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, count);
}
