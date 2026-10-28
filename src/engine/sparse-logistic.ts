/**
 * Logistic regression for rows with many one hot levels and a few numeric inputs, fitted by seeded
 * stochastic gradient descent with an L2 penalty. It exists to give the factor model a fair linear
 * comparison on the same inputs; it is not used to score shipments.
 *
 * Pure and deterministic for a given seed.
 */
import { makeRng } from './rng';

export interface SparseRow {
  /** Indices of the one hot features that are on for this row. */
  idx: number[];
  /** Numeric features, already scaled by the caller. Same length for every row. */
  dense: number[];
}

export interface SparseLogistic {
  weights: Float64Array;
  denseWeights: number[];
  bias: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export interface FitOptions {
  /** Number of one hot features (largest index plus one). */
  dim: number;
  l2: number;
  epochs?: number;
  learningRate?: number;
  seed?: number;
}

export function fitSparseLogistic(rows: readonly SparseRow[], labels: readonly boolean[], opts: FitOptions): SparseLogistic {
  if (rows.length !== labels.length) throw new Error('rows and labels differ in length');
  const { dim, l2, epochs = 20, learningRate = 0.1, seed = 1 } = opts;
  const nd = rows[0]?.dense.length ?? 0;
  const w = new Float64Array(dim);
  const wd = new Array<number>(nd).fill(0);
  let b = 0;
  const rng = makeRng(seed);
  const order = rows.map((_, i) => i);
  for (let e = 0; e < epochs; e++) {
    // Fisher-Yates with the seeded generator, then a decaying step size.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const lr = learningRate / (1 + e * 0.5);
    for (const i of order) {
      const r = rows[i];
      let z = b;
      for (const j of r.idx) z += w[j];
      for (let d = 0; d < nd; d++) z += wd[d] * r.dense[d];
      const g = sigmoid(z) - (labels[i] ? 1 : 0);
      b -= lr * g;
      for (const j of r.idx) w[j] -= lr * (g + l2 * w[j]);
      for (let d = 0; d < nd; d++) wd[d] -= lr * (g * r.dense[d] + l2 * wd[d]);
    }
  }
  return { weights: w, denseWeights: wd, bias: b };
}

/** Log odds for one row. */
export function predictSparse(model: SparseLogistic, row: SparseRow): number {
  let z = model.bias;
  for (const j of row.idx) z += model.weights[j];
  for (let d = 0; d < model.denseWeights.length; d++) z += model.denseWeights[d] * row.dense[d];
  return z;
}
