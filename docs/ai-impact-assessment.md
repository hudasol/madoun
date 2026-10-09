# AI impact assessment (draft for the pilot)

## Purpose
Suggest a risk lane and a parallel review plan for each shipment, with reasons, so people spend attention where it matters and nothing waits unseen.

## Who is affected
Traders and agents (checks, delays), authority officers (workload, accountability), the public (safety of goods), auditors.

## Decisions the system makes
None on its own. It suggests a lane. A named officer can override with a reason. Any penalty or detention remains a human, legal decision.

## Data
Declaration facts, trader compliance score and findings history, evidence receipts, inspection outcomes. No data about nationality, religion, gender or similar. All synthetic in the prototype.

## Risks and controls
| Risk | Control |
|---|---|
| Unfair burden on a group of traders | Weekly burden report with intervals; gate requires no group clearly worse off; blanket treatment of low-compliance traders called out for a policy decision |
| Learning from a biased sample | Random audits of green traffic; selected and random outcomes kept apart |
| Overconfident suggestions | Intervals on every hit rate; "thin evidence" label; suggestions only |
| Opaque decisions | Per-authority signals with plain-language reasons; audit trail of every override |
| Manipulation by traders | Random audit applies to every lane; signal sets can change through approval |
| Automation bias | Override reasons recorded; override rate monitored; training says the lane is advice |
| Security | Signed receipts, validated inputs, security headers (threat-model.md) |
| Model drift | Monitoring plan in model-card.md (not yet built) |

## Human oversight and contestability
Every lane has visible reasons; an officer can override; a trader can ask what is missing and why; an auditor can reconstruct any file from the event log.

## Evidence of performance
Synthetic only and partly circular (evaluation.md). The pilot's shadow phase is where real performance is first measured.

## Decision
Proceed to shadow mode only. No effect on real decisions until Gate 2 evidence exists.
