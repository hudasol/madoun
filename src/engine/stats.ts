/**
 * Small, dependency-free statistics used to keep the learning loop and the model checks honest:
 * every rate that drives a suggestion carries an interval, and every comparison carries a spread.
 * All functions are deterministic (bootstraps take a seeded generator).
 */
import type { Rng } from './rng';

/** Wilson score interval for a proportion (95% by default). Well behaved at small n and at 0 or n successes. */
export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Area under the ROC curve via the rank-sum identity, with ties counted as half. NaN when a class is empty. */
export function auroc(scores: number[], labels: boolean[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let pos = 0;
  let neg = 0;
  let rankSumPos = 0;
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank for the tie group
    for (let k = i; k <= j; k++) {
      if (labels[idx[k]]) {
        pos++;
        rankSumPos += avgRank;
      } else neg++;
    }
    i = j + 1;
  }
  if (pos === 0 || neg === 0) return NaN;
  return (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** Average precision (area under the precision-recall curve, step-wise). Ties are broken pessimistically. */
export function averagePrecision(scores: number[], labels: boolean[]): number {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || Number(labels[a]) - Number(labels[b]));
  const total = labels.filter(Boolean).length;
  if (total === 0) return NaN;
  let tp = 0;
  let sum = 0;
  order.forEach((i, r) => {
    if (labels[i]) {
      tp++;
      sum += tp / (r + 1);
    }
  });
  return sum / total;
}

export function brier(probabilities: number[], labels: boolean[]): number {
  if (!probabilities.length) return NaN;
  return probabilities.reduce((a, p, i) => a + (p - (labels[i] ? 1 : 0)) ** 2, 0) / probabilities.length;
}

export interface CalibrationBin {
  from: number;
  to: number;
  n: number;
  meanPredicted: number;
  observed: number;
}

/** Equal-width reliability bins; empty bins are dropped. */
export function calibration(probabilities: number[], labels: boolean[], bins = 5): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  for (let b = 0; b < bins; b++) {
    const from = b / bins;
    const to = (b + 1) / bins;
    const inBin = probabilities.map((p, i) => i).filter((i) => probabilities[i] >= from && (b === bins - 1 ? probabilities[i] <= to : probabilities[i] < to));
    if (!inBin.length) continue;
    out.push({
      from,
      to,
      n: inBin.length,
      meanPredicted: inBin.reduce((a, i) => a + probabilities[i], 0) / inBin.length,
      observed: inBin.filter((i) => labels[i]).length / inBin.length,
    });
  }
  return out;
}

export function quantileOf(values: number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

/** Percentile bootstrap interval for any statistic of paired (score, label) data. */
export function bootstrapCI(
  n: number,
  stat: (idx: number[]) => number,
  rng: Rng,
  { reps = 300, level = 0.95 }: { reps?: number; level?: number } = {},
): { lo: number; hi: number } {
  const vals: number[] = [];
  for (let r = 0; r < reps; r++) {
    const idx = Array.from({ length: n }, () => Math.floor(rng.next() * n));
    const v = stat(idx);
    if (!Number.isNaN(v)) vals.push(v);
  }
  const a = (1 - level) / 2;
  return { lo: quantileOf(vals, a), hi: quantileOf(vals, 1 - a) };
}

/**
 * How many observations are needed to estimate a proportion to within ±margin at the given confidence
 * (normal approximation, worst case when the expected rate is unknown). Used to size the audit sample
 * a pilot needs before a green-lane violation rate can be trusted.
 */
export function sampleSizeForProportion(expected: number, margin: number, z = 1.96): number {
  if (!(margin > 0) || !(expected >= 0 && expected <= 1)) return NaN;
  return Math.ceil((z * z * expected * (1 - expected)) / (margin * margin));
}
