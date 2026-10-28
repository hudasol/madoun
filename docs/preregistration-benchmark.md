# Preregistration: risk scoring benchmark on a published customs dataset

Status: written and committed before any model was fitted to this dataset. The author has seen only the license, the column list, the first two rows of the training file and the published split sizes. No statistic of the data (base rates, distributions, correlations) has been looked at. Any later change to this plan is added as a dated amendment below and the original text is kept.

## Question
Madoun's risk layer is meant to be explainable and to use only the criteria that the WTO Trade Facilitation Agreement lists as permissible for risk management (tariff code, goods type, origin, shipping country, value, trader compliance history, transport mode). On outside data that Madoun did not generate, how much of the ranking skill of an unconstrained model does such an explainable model keep, and how does it compare with the simple baselines a customs office already uses?

## Data
**Customs Import Declaration Datasets** by Jeong, Kim, Park and Choi (arXiv 2208.02484), MIT licence, Institute for Basic Science and Korea Customs Service. 54,000 declarations of 22 attributes, generated with CTGAN from the inspected part of 24.7 million real Korean import declarations (January 2020 to June 2021), with identities anonymised. Labels: `Fraud` (0 or 1, an attempt to reduce duty) and `Critical Fraud` (0, 1 or 2; 2 is a case that may threaten public safety). The published split is used as it is: first 12 months for training, next 3 months for validation, last 3 months for test.

Files are downloaded by `scripts/fetch-reference-data.mjs` and never committed. Their SHA-256 digests are pinned there and recorded here:

| File | SHA-256 |
|---|---|
| df_syn_train_eng.csv | ecec832d94f9f01e49a76884102c8d346945b61cf26b36ca75fea1a703a3cec5 |
| df_syn_valid_eng.csv | ad012c2da5ec025e6676466f10535309028ec0963b6a135215fbb07de79ac7de |
| df_syn_test_eng.csv | 618b81fca639119e40dfdb55dfa7f07822b7bd5abdcdb66fc8d02d71ebbba98e |

## What this data can and cannot show
- It is a synthetic copy of real data. Marginal distributions and many correlations are kept; fine grained links, such as one importer's behaviour over time, may be smoothed or lost.
- It holds only declarations that were inspected. Which ones were inspected was decided by an earlier selection process, so the fraud rate is far higher than in all traffic and the models learn to rank within an already selected pool. Absolute precision numbers do not transfer to a whole border.
- It is Korean traffic. It says nothing about Abu Dhabi cargo, traders or rates.
- What it can show is whether an explainable factor model built from permitted criteria ranks inspected declarations about as well as stronger models, and whether it beats simple baselines, on data and labels it was not designed around.

## Who built what
The method, the splits, the hyperparameter grids and these predictions were all written by the author of Madoun. The author's own explainable model is one of the models being compared.

## Methods
All models are trained on the training months. Hyperparameters are chosen on the validation months from the grids below. The test months are scored once per final model.

| Id | Method | Inputs |
|---|---|---|
| M0 | Random order | none. Mean over 200 seeded shuffles. |
| M1 | Highest declared value first | item price |
| M2 | Trader history | the importer's smoothed past fraud rate in the training months; an importer not seen in training gets the overall rate |
| M3 | Madoun factor model | the permitted criteria only: HS code at 2, 4 and 6 digits, country of origin, country of departure, mode of transport, value band (training deciles of item price) and importer history. Each factor level has a fraud rate shrunk toward its parent level (HS6 toward HS4 toward HS2 toward the base rate; other factors toward the base rate) with pseudo count k. The score is the base log odds plus the sum over factors of (level log odds minus base log odds). Each score is explained by its factor contributions. |
| M4 | Logistic regression | the same permitted inputs as M3, one hot with levels seen fewer than 20 times grouped as other, plus the log of item price; L2 penalty |
| M5 | Unconstrained reference | LightGBM gradient boosted trees on every column, including office, process type, import type, declarant, seller and courier identifiers and tax columns, which Madoun does not use |

Grids: k in {1, 2, 5, 10, 20, 50, 100}; the logistic penalty in {0.0001, 0.001, 0.01, 0.1}; for M5, 15, 31 or 63 leaves with learning rate 0.05 and early stopping on the validation months. Random seed 1 for everything that is random. No other grid points are tried.

## Metrics
Computed on the test months for the label `Fraud`, and again for `Critical Fraud` equal to 2.
- **AUC** and **average precision**, with a 95 percent percentile bootstrap interval from 1,000 resamples of the test declarations (seed 1).
- **Precision and recall at an inspection budget** of 5, 10 and 20 percent of declarations (the top scored declarations are the ones inspected), and lift over the base rate.
- **Brier score** for the models that give a probability, after Platt scaling fitted on the validation months.
- A paired bootstrap interval for the difference in AUC between two methods (the same resamples for both).

## Predictions
Written before any model is fitted. HIT only if the stated condition holds; every prediction is reported, hits and misses alike.

| Id | Prediction | Condition for HIT |
|---|---|---|
| P1 | Every learned method ranks better than chance on `Fraud`. | The lower bound of the 95 percent AUC interval is above 0.5 for M2, M3, M4 and M5. |
| P2 | Declared value alone is a weak ranking. | AUC of M1 below 0.60 on `Fraud`. |
| P3 | Trader history beats declared value. | AUC of M2 minus AUC of M1 is above 0 and the 95 percent paired interval excludes 0. |
| P4 | The explainable model costs little against a plain linear model. | AUC of M4 minus AUC of M3 is below 0.03. |
| P5 | The explainable model keeps most of the ranking skill of the unconstrained reference. | (AUC of M3 minus 0.5) divided by (AUC of M5 minus 0.5) is at least 0.80. |
| P6 | At a 10 percent inspection budget the explainable model more than doubles the base rate. | Lift of M3 at 10 percent is at least 2.0 on `Fraud`. |
| P7 | The later period is harder than the validation period. | AUC of M3 on the validation months minus its AUC on the test months is above 0. |
| P8 | Rare critical cases are harder to rank than fraud in general. | AUC of M3 on `Critical Fraud` equal to 2 is below its AUC on `Fraud`. |
| P9 | Negative control: with the training labels shuffled, M3 has no skill. | For each of 5 shuffles (seeds 1 to 5), test AUC of M3 is within 0.02 of 0.5. |
| P10 | The explainable model is useful as a probability, not only as an order. | Brier skill score of Platt scaled M3 against a constant base rate prediction is above 0 on the test months. |
| P11 | Structural check, not a prediction: every M3 score equals the base log odds plus its listed factor contributions. | Holds exactly (within 1e-9) for every test declaration. Cannot fail by design. |

## Stopping rule
One run of the full pipeline on the pinned files. If a defect is found afterwards, it is fixed, the whole pipeline is run again, and both the defect and the effect on every number are written as a dated amendment. No prediction is edited after the first run.

## Notes written after the run (no prediction was changed)
Added on 28 October 2026, after the single run reported in [benchmark-korea.md](benchmark-korea.md).
- The run found no defect, so no amendment to the method was needed. P5 and P8 missed and are reported as they were written.
- For the `Fraud` target the unconstrained reference reached the 2,000 boosting round cap with the 15 leaf setting without stopping early. The plan did not set a round cap. A longer run could raise the reference a little, which would lower the share P5 measures, not raise it.
- P2 says declared value is a weak ranking and hit because its AUC is below 0.60. The AUC is in fact 0.439, below chance, which is a stronger statement than the prediction made.
- P8 compared AUC. AUC does not depend on how rare the positives are, so the rare critical class can rank well by AUC and still have low precision at a fixed budget. Both are in the report.
