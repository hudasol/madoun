import type { ShipmentSimResult } from './simulate';
import type { Lane } from './types';

export interface Kpis {
  shipments: number;
  todayPreArrivalPct: number;
  madounPreArrivalPct: number;
  todayMedianHours: number;
  madounMedianHours: number;
  todayP90Hours: number;
  madounP90Hours: number;
  medianReductionPct: number;
  repeatChecksAvoided: number;
  todayInactionHours: number;
  madounInactionHours: number;
  byLane: Record<Lane, { count: number; todayMedian: number; madounMedian: number; madounPreArrivalPct: number }>;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Definitions follow the WCO Time Release Study approach: release time, lane routing, inaction time. */
export function computeKpis(results: ShipmentSimResult[]): Kpis {
  const n = results.length;
  const today = results.map((r) => r.todayHours).sort((a, b) => a - b);
  const madoun = results.map((r) => r.madounHours).sort((a, b) => a - b);
  const todayMed = quantile(today, 0.5);
  const madounMed = quantile(madoun, 0.5);

  const byLane = {} as Kpis['byLane'];
  for (const lane of ['green', 'amber', 'red'] as Lane[]) {
    const subset = results.filter((r) => r.lane === lane);
    byLane[lane] = {
      count: subset.length,
      todayMedian: r1(quantile(subset.map((r) => r.todayHours).sort((a, b) => a - b), 0.5)),
      madounMedian: r1(quantile(subset.map((r) => r.madounHours).sort((a, b) => a - b), 0.5)),
      madounPreArrivalPct: pct(subset.filter((r) => r.madounPreArrival).length, subset.length),
    };
  }

  return {
    shipments: n,
    todayPreArrivalPct: pct(results.filter((r) => r.todayPreArrival).length, n),
    madounPreArrivalPct: pct(results.filter((r) => r.madounPreArrival).length, n),
    todayMedianHours: r1(todayMed),
    madounMedianHours: r1(madounMed),
    todayP90Hours: r1(quantile(today, 0.9)),
    madounP90Hours: r1(quantile(madoun, 0.9)),
    medianReductionPct: todayMed ? r1(((todayMed - madounMed) / todayMed) * 100) : 0,
    repeatChecksAvoided: results.reduce((a, r) => a + r.repeatChecksAvoided, 0),
    todayInactionHours: r1(results.reduce((a, r) => a + r.todayInactionHours, 0)),
    madounInactionHours: r1(results.reduce((a, r) => a + r.madounInactionHours, 0)),
    byLane,
  };
}
