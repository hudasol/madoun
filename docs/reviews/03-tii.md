# Review 3: applied AI research engineer (TII lens)

Reviewer stance: a researcher who asks for the experiment before the claim. Wants a held-out evaluation, honest baselines, uncertainty on every number, an account of selection and feedback effects, a look at who bears the errors, and a model description someone else could audit.

## Critique of v1.2.0
1. **No evaluation of the core model.** The product says its lanes are explainable. It never showed they are *right*, even on its own synthetic ground truth. Explainability without accuracy is a story.
2. **The learning loop learns from a biased sample.** Outcomes exist only for shipments a rule chose to check. The green lane is never inspected, so violations that pass through it are invisible to learning. Measured here: about 35% of violations sit in green. The README promised random audits of green traffic; the simulator never ran them, so there was no unbiased base rate at all.
3. **Decisions on point estimates of tiny samples.** A suggestion fired at 12 cases with a hit rate under 15%. With 12 cases the plausible range is wide enough to hold both "fine" and "useless". The interface presented the suggestion with more confidence than the data allows.
4. **No baselines.** Nothing showed whether the hand-set rules beat the trader's compliance score alone. (They barely do: AUC 0.80 against 0.78.)
5. **No learned comparator, no promotion path.** A reviewer asks what would make you replace the weights. There was no answer.
6. **Single-run simulator numbers.** "Median time saved" came from one synthetic week with no spread.
7. **Nobody looked at who bears the checks.** Every shipment from a low-compliance trader is sent to amber or red; about half of those checks find nothing. That is a policy, but it was invisible.
8. **No model documentation.** Intended use, limits, monitoring and promotion criteria were scattered or absent.
9. **Evaluation circularity unacknowledged.** The synthetic truth is generated from the same facts the rules read; nothing said so.

## Checklist
- [x] 1. Audits that actually run: flagged green shipments get a post-clearance audit after release (never delaying it) on a separate random stream, so every other number in the simulation is unchanged (release-time and KPI hashes identical before and after). Outcomes carry how they were sampled (`risk`, `random-audit`, `history-audit`). (`src/engine/simulate.ts`, tests)
- [x] 2. Learning made statistically honest: Wilson 95% interval on every hit rate, shown in the factor table; random-audit sample reported as the base rate with its range (or "none yet"); selected outcomes and audit outcomes kept apart; each suggestion labelled "strong" only if its whole interval clears the decision threshold, otherwise "thin". (`src/engine/learning.ts`, `src/engine/stats.ts`, 12+5 tests)
- [x] 3. Model check, runnable in the interface and from the command line: lane calibration with intervals, held-out comparison of the rules against trader-score-only, value-only, random and a learned logistic challenger, with bootstrap intervals, AUC, average precision and violations found at equal effort. (`src/engine/evaluate.ts`, `src/lib/evaluation.ts`, `scripts/eval.ts`, `docs/evaluation.md`)
- [x] 4. Champion/challenger framing: the challenger is fitted on four weeks, scored on four it never saw, never decides a lane, and has written promotion criteria. (`docs/model-card.md`)
- [x] 5. Burden analysis: share checked and share of checks that found nothing, by compliance band and by authorised-operator status, with intervals, and the blanket-treatment finding stated plainly.
- [x] 6. Simulator spread: twelve other synthetic weeks, median and range for time saved and for pre-arrival release, share of shipments no slower than today, and a note that the spread is a floor on uncertainty.
- [x] 7. Model card with intended use, out of scope, evidence with its circularity stated, known weaknesses, learning guardrails, promotion path and monitoring plan.
- [x] 8. Tests: 26 new (statistics against pairwise definitions and known values, learning with audits, determinism of the evaluation, lane monotonicity, audits never change release times).
- [ ] 9. Not done, on purpose: drift monitoring (needs real, non-stationary data), causal estimation of per-signal effects (needs randomised assignment beyond the 1-in-20 audit), calibration of the rule scores into probabilities, evaluation on real labelled history.

## What the new checks found (and what they did not change)
- The rules do rank risk: green about 6%, amber about 34%, red about 58% have a hidden violation.
- They catch about 65% of violations and miss about 35% in green.
- The learned challenger is better on this data but not by a margin that survives its own interval. It was not promoted.
- No weights were tuned to flatter the numbers.

## Honest limits after this round
- Everything is synthetic and partly circular; see the first paragraph of docs/evaluation.md.
- The random-audit sample in one demo week is small (about ten), so its range is wide. That is shown, not hidden.
- The audit detection rate is a modelled 60%, so observed rates understate truth.
