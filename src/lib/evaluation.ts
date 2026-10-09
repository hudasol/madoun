import { generate } from '@/data/generate';
import { evaluateCases, replay, simulate, type EvalCase, type EvalReport, type Lane } from '@/engine';

/** Builds labelled cases for one seed: simulate a week, then read each shipment's lane and score at filing. */
export function casesForSeed(seed: number, fold: 0 | 1, shipments = 240): EvalCase[] {
  const g = generate({ seed, shipments });
  const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
  const world = replay(sim.events);
  const out: EvalCase[] = [];
  for (const s of g.shipments) {
    const a = world.shipments[s.id]?.assessment;
    if (!a) continue;
    const trader = g.directory.traders[s.traderId];
    const signals = a.perAuthority.flatMap((p) => p.signals);
    const has = (k: string) => (signals.some((x) => x.key === k && x.points > 0) ? 1 : 0);
    const docs = new Set(signals.filter((x) => x.factor === 'documentation-completeness' && x.points > 0).map((x) => x.key + x.authorityId)).size;
    const catPts = signals.filter((x) => x.factor === 'goods-category' && x.authorityId === 'adc').reduce((t, x) => t + x.points, 0);
    const valueSig = signals.find((x) => x.key === 'value:undervalued' && x.points > 0);
    const band = trader.complianceScore < 60 ? 'low' : trader.complianceScore < 80 ? 'mid' : 'high';
    out.push({
      label: !!g.truth[s.id].violation,
      lane: a.lane as Lane,
      score: Math.max(0, ...a.perAuthority.map((p) => p.score)),
      features: [trader.complianceScore, Math.min(5, trader.pastFindings), trader.aeo ? 1 : 0, has('value:undervalued'), has('value:overvalued'), has('origin:first-time'), s.mode === 'land' ? 1 : 0, docs, catPts],
      valueRisk: valueSig ? 1 : has('value:overvalued') ? 0.3 : 0,
      traderRisk: 100 - trader.complianceScore,
      band,
      aeo: trader.aeo,
      fold,
    });
  }
  return out;
}

/** Runs `seeds` independent synthetic weeks (first half train, second half test) and evaluates them together. */
export function runEvaluation(seeds = 8, firstSeed = 100): EvalReport {
  const cases: EvalCase[] = [];
  for (let i = 0; i < seeds; i++) cases.push(...casesForSeed(firstSeed + i, i < seeds / 2 ? 0 : 1));
  return evaluateCases(cases, seeds);
}
