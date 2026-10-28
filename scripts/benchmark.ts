/**
 * Runs the preregistered benchmark (docs/preregistration-benchmark.md) on the Korea Customs dataset.
 *
 *   node scripts/fetch-reference-data.mjs
 *   python scripts/ceiling.py            (optional: the unconstrained reference model, needs lightgbm)
 *   npm run benchmark
 *
 * Writes docs/benchmark-korea.md and docs/benchmark-korea.json. One run, no tuning after it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePredictions, runTarget, type Declaration, type Scored, type Splits, type TargetReport } from '@/engine/benchmark';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'data', 'external', 'korea-customs');

function load(name: string): Declaration[] {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    console.error('Dataset not found. Run: node scripts/fetch-reference-data.mjs');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  const at = (col: string) => cols.indexOf(col);
  const need = ['Importer ID', 'HS6 Code', 'Country of Origin', 'Country of Departure', 'Mode of Transport', 'Item Price', 'Fraud', 'Critical Fraud'];
  for (const n of need) if (at(n) < 0) throw new Error(`column ${n} missing in ${name}`);
  return lines.map((line) => {
    const f = line.split(',');
    return {
      importer: f[at('Importer ID')],
      hs6: f[at('HS6 Code')],
      origin: f[at('Country of Origin')],
      departure: f[at('Country of Departure')],
      mode: f[at('Mode of Transport')],
      price: Number(f[at('Item Price')]),
      fraud: f[at('Fraud')] === '1',
      critical: f[at('Critical Fraud')] === '2',
    };
  });
}

const splits: Splits = { train: load('df_syn_train_eng.csv'), valid: load('df_syn_valid_eng.csv'), test: load('df_syn_test_eng.csv') };

const ceilingFile = path.join(root, 'docs', 'data', 'ceiling-scores.json');
const ceiling = fs.existsSync(ceilingFile) ? JSON.parse(fs.readFileSync(ceilingFile, 'utf8')) : undefined;
const pick = (t: 'fraud' | 'critical'): Scored | undefined => (ceiling ? { valid: ceiling[t].valid, test: ceiling[t].test } : undefined);
if (ceiling && (ceiling.fraud.test.length !== splits.test.length || ceiling.fraud.valid.length !== splits.valid.length)) {
  throw new Error('ceiling-scores.json does not match the dataset rows; run scripts/ceiling.py again');
}

const fraud = runTarget(splits, 'fraud', pick('fraud'));
const critical = runTarget(splits, 'critical', pick('critical'));
const predictions = evaluatePredictions(fraud, critical);

const f3 = (x: number) => x.toFixed(3);
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

function methodTable(r: TargetReport): string {
  const rows = [
    '| Method | Chosen | Validation AUC | Test AUC (95% interval) | Average precision | Precision at 5% | at 10% (95% interval) | at 20% | Recall at 10% | Lift at 10% |',
    '|---|---|---|---|---|---|---|---|---|---|',
    `| M0 Random order | none | 0.500 | 0.500 | ${pct(r.baseRate.test)} | ${pct(r.random.budgets[0].precision)} | ${pct(r.random.budgets[1].precision)} | ${pct(r.random.budgets[2].precision)} | ${pct(r.random.budgets[1].recall)} | ${r.random.budgets[1].lift.toFixed(2)} |`,
  ];
  for (const m of r.methods) {
    const b = (x: number) => m.budgets.find((p) => p.budget === x)!;
    rows.push(`| ${m.id} ${m.name} | ${m.chosen ?? 'none'} | ${f3(m.validAuc)} | ${f3(m.testAuc)} (${f3(m.aucCi.lo)} to ${f3(m.aucCi.hi)}) | ${pct(m.averagePrecision)} | ${pct(b(0.05).precision)} | ${pct(b(0.1).precision)} (${pct(m.precisionAt10Ci.lo)} to ${pct(m.precisionAt10Ci.hi)}) | ${pct(b(0.2).precision)} | ${pct(b(0.1).recall)} | ${b(0.1).lift.toFixed(2)} |`);
  }
  return rows.join('\n');
}

const pairedLines = (r: TargetReport) => r.paired.map((p) => `- AUC of ${p.a} minus ${p.b}: ${p.diff >= 0 ? '+' : ''}${f3(p.diff)} (95% paired interval ${f3(p.lo)} to ${f3(p.hi)})`).join('\n');

const hits = predictions.filter((p) => !p.structural && p.hit).length;

// Descriptive context about the features (no labels): how much of the test traffic comes from importers seen in training.
const seenImporters = new Map<string, number>();
for (const d of splits.train) seenImporters.set(d.importer, (seenImporters.get(d.importer) ?? 0) + 1);
const importerSeen = splits.test.filter((d) => seenImporters.has(d.importer)).length / splits.test.length;
const importerSeen5 = splits.test.filter((d) => (seenImporters.get(d.importer) ?? 0) >= 5).length / splits.test.length;
const get = (r: TargetReport, id: string) => r.methods.find((m) => m.id === id);
const m3 = get(fraud, 'M3')!;
const m5 = get(fraud, 'M5');
const m3b = m3.budgets.find((b) => b.budget === 0.1)!;
const m5b = m5?.budgets.find((b) => b.budget === 0.1);
const m1 = get(fraud, 'M1')!;
const m2 = get(fraud, 'M2')!;
const share = m5 ? (m3.testAuc - 0.5) / (m5.testAuc - 0.5) : NaN;
const scored = predictions.filter((p) => !p.structural).length;

const md = `# Benchmark: risk scoring on a published customs dataset

Generated by \`npm run benchmark\` from the plan in [preregistration-benchmark.md](preregistration-benchmark.md), which was committed before any model was fitted. One run, no tuning after it. Do not edit by hand.

## What was measured
The Madoun factor model (M3), built only from criteria the WTO Trade Facilitation Agreement permits, against simple baselines a customs office already uses, a plain logistic regression on the same inputs, and an unconstrained gradient boosted reference that sees every column. Data: Customs Import Declaration Datasets (Jeong, Kim, Park and Choi, arXiv 2208.02484, MIT licence), a CTGAN synthetic copy of inspected Korean import declarations, split by the authors into training (2020), validation (January to March 2021) and test (April to June 2021) months.

**Read this before quoting a number.** The data is a synthetic copy of real Korean traffic, it contains only declarations that were already selected for inspection, and it says nothing about Abu Dhabi. What it supports is a comparison of methods on data Madoun did not generate. It does not support a claim about performance at a UAE border.

## Data size and base rates
| Target | Train rows | Validation rows | Test rows | Positives in test | Base rate train / validation / test |
|---|---|---|---|---|---|
| Fraud | ${fraud.counts.train} | ${fraud.counts.valid} | ${fraud.counts.test} | ${fraud.counts.positivesTest} | ${pct(fraud.baseRate.train)} / ${pct(fraud.baseRate.valid)} / ${pct(fraud.baseRate.test)} |
| Critical fraud (label 2) | ${critical.counts.train} | ${critical.counts.valid} | ${critical.counts.test} | ${critical.counts.positivesTest} | ${pct(critical.baseRate.train)} / ${pct(critical.baseRate.valid)} / ${pct(critical.baseRate.test)} |

## Results: fraud
${methodTable(fraud)}

${pairedLines(fraud)}
- Platt scaled M3 Brier score ${fraud.brierSkillM3.brier.toFixed(4)} against ${fraud.brierSkillM3.baseline.toFixed(4)} for a constant base rate (skill ${fraud.brierSkillM3.skill.toFixed(4)})
- Negative control, M3 with shuffled training labels, test AUC: ${fraud.permutation.map(f3).join(', ')}

## Results: critical fraud
${methodTable(critical)}

${pairedLines(critical)}

## Preregistered predictions
${hits} of ${scored} predictions hit. P11 is a structural check that cannot fail by design.

| Id | Prediction | Result | Evidence |
|---|---|---|---|
${predictions.map((p) => `| ${p.id} | ${p.statement} | ${p.structural ? 'STRUCTURAL HOLDS' : p.hit ? 'HIT' : 'MISS'} | ${p.detail} |`).join('\n')}

## What the results say, and what they do not
- **The explainable model is clearly useful.** At a 10 percent inspection budget it finds fraud ${pct(m3b.precision)} of the time against ${pct(fraud.baseRate.test)} for random order (lift ${m3b.lift.toFixed(2)}), using only criteria the WTO Trade Facilitation Agreement permits, and every score comes with its factor by factor explanation.
- **It gives up a measurable amount.** The unconstrained reference reaches an AUC of ${m5 ? f3(m5.testAuc) : 'n/a'} against ${f3(m3.testAuc)} for M3, so M3 keeps ${m5 ? pct(share, 0) : 'n/a'} of the skill above chance${m5b ? `, and its precision at 10 percent is ${pct(m5b.precision)} against ${pct(m3b.precision)}` : ''}. The reference uses office, declarant, seller, courier and tax columns, which Madoun leaves out on purpose. That gap is the price of the permitted criteria rule and of explainability together; this run cannot separate the two. It is a decision for the customs authority, not a defect to be tuned away.${ceiling && ceiling.fraud.best_iteration >= 2000 ? ' The fraud reference reached the 2,000 round cap without stopping early, so its true ceiling may be a little higher.' : ''}
- **Declared value alone is worse than chance here** (AUC ${f3(m1.testAuc)}): higher value went with less fraud. The preregistered prediction P2 was only that value is weak, and it hit, but a ranking below 0.5 is a different finding from a weak one. Sorting by value and inspecting the top would have found fraud less often than picking at random.
- **Trader history alone is close to chance** (AUC ${f3(m2.testAuc)}, interval ${f3(m2.aucCi.lo)} to ${f3(m2.aucCi.hi)}), although ${pct(importerSeen, 0)} of test declarations come from an importer seen in training (${pct(importerSeen5, 0)} from one seen five or more times). The synthesis may have weakened importer level behaviour; that is a guess, not something this run tested. Do not read it as evidence about real compliance histories.
- **Critical fraud has only ${critical.counts.positivesTest} positive cases in the test months**, so every critical interval is wide and the differences between M3, M4 and M5 there are suggestive at most. P8 missed because the AUC for critical cases is higher than for fraud in general, but with a base rate of ${pct(critical.baseRate.test)} even a good ranking inspects mostly clean declarations: precision at 10 percent is ${pct(get(critical, 'M3')!.budgets.find((b) => b.budget === 0.1)!.precision)}.
- **The two misses stand.** P5 and P8 were written before any model was fitted and are not edited.

## How to reproduce
\`\`\`bash
node scripts/fetch-reference-data.mjs   # checks pinned SHA-256 digests
python scripts/ceiling.py               # optional, needs lightgbm; writes docs/data/ceiling-scores.json
npm run benchmark
\`\`\`
${ceiling ? '' : '\nThe unconstrained reference (M5) was not run, so P1 and P5 cannot be evaluated and are shown as misses.\n'}`;

fs.writeFileSync(path.join(root, 'docs', 'benchmark-korea.md'), md);
fs.writeFileSync(path.join(root, 'docs', 'benchmark-korea.json'), JSON.stringify({ fraud, critical, predictions }, null, 2) + '\n');
console.log(`wrote docs/benchmark-korea.md (${hits} of ${scored} predictions hit)`);
for (const p of predictions) console.log(p.id, p.structural ? 'STRUCTURAL' : p.hit ? 'HIT ' : 'MISS', p.detail);
