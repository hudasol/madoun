# Pilot plan (proposal)

A ninety-day trial on one entry point and one corridor. Every threshold below is a proposal to agree with customs and the participating authorities. None is a finding.

## Principles
1. **Layer, do not replace.** Madoun reads from ATLP and MAMAR through adapters. Legal decisions stay with customs and each authority.
2. **Earn effect in steps.** Shadow, then advisory, then a narrow real effect. Each step has a gate.
3. **Measure before changing.** A baseline is taken with the WCO Time Release Study method before any effect is allowed.
4. **Any authority can stop it.** Their veto holds.
5. **Data stays in the UAE**, on infrastructure the government chooses (see governance.md).

## Scope
One entry point; one corridor (sea or air) with food, electronics and regulated goods so that at least three authorities are involved; one named lead per participating authority.

## Phases and gates
| Gate | When | Effect on real decisions | Passes when |
|---|---|---|---|
| 0 Ready | before day 1 | none | baseline release times measured (TRS method); data-sharing agreement signed; security review and AI impact assessment signed off; sample-size plan for audits agreed |
| 1 Shadow | days 1 to 30 | none, runs beside real decisions | at least 95% of declarations map without manual repair; API answers within 500 ms for 95% of calls; no high-severity security finding; agreement between Madoun lanes and officer decisions measured and reported |
| 2 Advisory | days 31 to 60 | officers see the parallel plan and owners; nothing automatic | every waiting step has a named owner; officers use the shared evidence file in most reviews; override rate under 40% with a reason on each |
| 3 Limited effect | days 61 to 90 | pre-arrival release for green shipments of authorised operators only | median release time falls against baseline with the whole 95% interval below zero; audits of green releases show a violation rate within the agreed tolerance; no group bears a clearly higher share of checks that find nothing |

## Measurement
- **Release time, inaction time and pre-arrival release rate**, defined as in the WCO TRS, compared with the baseline and with a matched control period (same weekdays, same corridor) to separate the effect from seasonality.
- **Safety of green:** post-release audits of green shipments. The audit sample must be large enough to trust: the Pilot page in the app has a calculator (about 380 audits for a 1% rate known to within one point; about 1,100 for a 3% rate).
- **Burden:** share of each trader group checked and share of those checks that found nothing, with intervals (the model check on the Learning page shows how).
- **Adoption:** share of reviews that open the shared file; override rate and reasons; time to resolve exceptions.

## Stop criteria
1. Green-lane post-release audits find a violation rate above the agreed tolerance.
2. Any high-severity security or privacy incident.
3. Sustained override rate above 40%.
4. Data quality too poor to assess fairly (for example more than 5% of declarations unmappable).
5. A legal or policy objection from any participating authority.

## What changes on day one
| Who | Sees and does |
|---|---|
| Customs officer | One file per shipment with lane, reasons, owners and clocks; overrides with a reason; resolves exceptions |
| Regulator officer | Only evidence shared with their authority; reuses receipts instead of asking again; records approval in parallel |
| Trader or agent | Status of their own shipment and what is missing, earlier |
| Auditor | Full trail and clearance-record export; read only |
| Inspection operator | Tasks from any performer; a person confirms any serious machine-reported finding |

## Change management
Arabic-first training of two hours per role; a named floor champion per shift; a weekly review of overrides and exceptions in which officers can change the rules through the approval process; a visible "what we heard, what changed" log.

## Resources the pilot needs
- **Customs:** baseline timestamps, read access to declarations, an officer lead, a decision on lane policy.
- **Each authority:** one named reviewer, its evidence-sharing rules, the right to stop.
- **Technology partners:** a test environment, key management (HSM/KMS), a robot cell for the research track.
- **Legal and privacy:** lawful basis, retention and audit rules, sign-off on the AI impact assessment.

## Risks and answers
| Risk | Answer |
|---|---|
| Efficiency gains slow a safety control | Stop criterion 1; random audits throughout |
| One authority feels bypassed | Veto, named reviewer, sharing rules kept by the custodian |
| Officers distrust the lanes | Reasons on every lane; overrides are a signal, not a failure; stop criterion 3 |
| Integration slips | Shadow mode needs only read access; adapters are the long pole and are scheduled first |
| Biased burden on a trader group | Burden report each week; Gate 3 requires no group clearly worse off |

## Readiness today (honest)
| Part | Level (TRL) | Missing |
|---|---|---|
| Rule engine, event log, review plan | 4, validated on synthetic data | validation on real, labelled history |
| Evidence receipts and signatures | 3 to 4 | real key custody, external anchoring |
| Integration API | 3, mock | authentication, ATLP/MAMAR connection, load tests |
| Learning loop and model check | 3 | real outcomes, audit sample, drift monitoring |
| Robotic inspection seam | 2 to 3, contract and simulation | a real robot, safety case, terminal access |
| Adapters to ATLP and MAMAR | 1 to 2, designed only | specifications and test environment |
