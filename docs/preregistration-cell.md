# Preregistration: inspection cell digital twin

Status: written and committed before the model was implemented or run. Any later change to this plan is added as a dated amendment below and the original text is kept.

## Question
For red lane containers, does a two robot inspection cell whose serious findings are confirmed by a customs officer change how long inspection takes and how much officer time it uses, compared with officers alone and with a scanner plus officers, and what does it cost in missed violations when the robots fail often?

## Who built what
The model, its parameters, the scenarios and these predictions were all written by the same author who built Madoun. Every parameter below is an assumption chosen for illustration. None is a measurement of a real robot, scanner, officer team or port. The experiment tests the logic of the design under stated assumptions; it says nothing about real performance.

## Model (to be implemented in `src/engine/cell.ts`, pure and seeded)
Discrete event simulation in hours. Each run covers 168 hours (one week) of arrivals and then continues, with no new arrivals, until every task has finished, so that every task ends exactly once.

| Element | Assumption |
|---|---|
| Arrivals | Poisson, 1.5 red lane containers per hour, constant over the day |
| Violation present | 8 percent of containers, independent |
| Officers | 4 on the day shift (06:00 to 18:00), 3 on the night shift (18:00 to 06:00). An officer starts work only during the shift and finishes a job already started. |
| Officer physical inspection | 0.75 h plus an exponential with mean 0.75 h (mean 1.5 h). Detects a violation with probability 0.95; reports a false finding with probability 0.01. |
| Officer priority | Confirmations and scanner image reviews before physical inspections. |
| Scanner | One scanner, 0.1 h per container. Flags a violation with probability 0.85 and a clean container with probability 0.10. Every scan image is reviewed by an officer (0.2 h). Flagged containers then get an officer physical inspection. |
| Robots | Two robots. Inspection 0.5 h plus an exponential with mean 0.25 h (mean 0.75 h). Detect a violation with probability 0.90 and report a false major finding with probability 0.05. Battery: after 6 h of cumulative inspection work a robot charges for 1.5 h. |
| Robot faults | During an inspection the robot faults with probability 0.02 at a uniformly random point of the job; the task returns to the front of the queue and the robot is down for 2 h. |
| Officer confirmation | Every serious machine finding (Madoun rule `requiresOfficerConfirmation`) needs an officer to check it on site: 0.5 h. The officer establishes the truth: upheld if a violation is present, overturned if not. A task with a serious machine finding is complete only after confirmation. |
| Fallback | In the robot scenarios officers take inspection tasks from the robot queue only when no robot is operational (all charging or down). |

## Scenarios
1. **S1 officers only.** Officers do every physical inspection.
2. **S2 scanner plus officers.** Scan, officer image review, officer physical inspection when flagged.
3. **S3 robot cell plus officer confirmation.** Robots inspect; officers confirm serious machine findings and act as fallback.
4. **S4 robot cell with failures.** As S3 but the fault probability is 0.15 per inspection and recovery takes 4 h.

Common random numbers: within a seed, every scenario sees the same arrival times and the same violations (one random stream); service, detection and fault draws come from separate streams.

## Seeds
30 seeds, numbered 1 to 30. No other seeds are run before the results are written. No parameter is tuned after the first run.

## Metrics (per run)
- **Lead time** of a task: from arrival to final completion, including any officer confirmation. The other review steps of a red lane release are identical across scenarios, so a difference in lead time is a difference in total release time for lane red.
- **M1** median lead time; **M2** 90th percentile lead time.
- **M3** median hands on inspection time per container: the sum of service durations spent on that container (all attempts, including an attempt cut short by a fault; scan plus review plus any physical inspection in S2; robot work plus confirmation in S3 and S4).
- **M4** officer hands on hours per container.
- **M5** missed violation share: violations not established at completion, divided by violations.
- **M6** 90th percentile confirmation delay: from the machine result to the end of the officer's confirmation (S3 and S4).
- **M7** share of serious machine findings that were confirmed before their task completed (S3 and S4).
- Conservation: tasks arrived equals tasks completed, each exactly once.

## Analysis plan
For each metric and scenario: the mean over 30 seeds with a 95 percent interval, mean plus or minus 2.045 times the standard deviation over seeds divided by the square root of 30 (t distribution, 29 degrees of freedom). For comparisons: the same interval on the paired difference per seed. A prediction is a HIT only if its stated condition holds; otherwise it is a MISS. All predictions are reported, hits and misses alike.

## Predictions
| Id | Prediction | Condition for HIT |
|---|---|---|
| P1 | A robot cell with officer confirmation does not lengthen lead time; it shortens it. | Upper bound of the 95 percent interval of M1(S3) minus M1(S1) is below 0. |
| P2a | Officers only, median lead time. | Mean M1(S1) between 1.3 h and 2.5 h. |
| P2b | Robot cell, median lead time. | Mean M1(S3) between 0.6 h and 1.4 h. |
| P3a | Officers only, median hands on time per container. | Mean M3(S1) between 1.17 h and 1.37 h (analytic value 1.27 h). |
| P3b | Robot cell, median hands on time per container. | Mean M3(S3) between 0.57 h and 0.77 h (analytic value 0.67 h). |
| P3c | The robot cell lowers median inspection time per container. | Upper bound of the interval of M3(S3) minus M3(S1) is below 0. |
| P4 | The robot cell does not lengthen the tail by more than 15 minutes. | Upper bound of the interval of M2(S3) minus M2(S1) is below 0.25 h. |
| P5 | Frequent robot failures make the cell slower than officers alone. | Lower bound of the interval of M1(S4) minus M1(S1) is above 0. |
| P6 | Every serious machine finding is confirmed by an officer before its task completes. | M7 equals 100 percent in every seed of S3 and S4. |
| P7 | The robot cell misses more violations than officers alone (about 10 percent against 5 percent). | Mean of M5(S3) minus M5(S1) is above 0. Expected to have low power: about 13 violations per seed. |
| P8a | The scanner path is the fastest. | Upper bound of the interval of M1(S2) minus M1(S3) is below 0. |
| P8b | The scanner path misses the most violations (about 19 percent). | Mean M5(S2) is higher than the mean M5 of each other scenario. |
| P9 | The one hour confirmation delay assumed in the release simulator (docs/decisions.md, D3) is not optimistic. | Mean M6(S3) is at most 1.0 h. |
| P10 | The robot cell frees officer time. | Upper bound of the interval of M4(S3) is below 0.25 h per container. |

## Outputs
`npm run cell` runs all 4 scenarios for all 30 seeds and writes `docs/cell-results.json` and `docs/cell-experiment.md`, with every prediction marked HIT or MISS. A test fails if either file is out of date with the code.

## Amendments
Both amendments were made on 18 October 2026, after the first run, in response to an independent review. The original text above is unchanged.

**A1. Random streams brought in line with this plan.** The first implementation drew service times, detection and faults from one random stream, although the plan above says they come from separate streams. That weakened the common random numbers between scenarios. The model now uses three separate streams (service, detection, faults) as written, and the results file reports the corrected run. The first run gave the same pattern: every prediction hit except P5, which missed (difference in median lead time S4 minus S1 of -0.01 h, interval -0.12 to 0.09).

**A2. P6 reclassified as a structural check.** In the model, a task with a serious machine finding completes only when the officer's confirmation ends, so M7 equals 100 percent by construction and P6 cannot fail. It is still checked and reported, but as a structural invariant, and it is no longer counted among the predictions. Hit and miss counts are therefore over 13 predictions. No condition, parameter or seed was changed.
