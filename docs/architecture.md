# Architecture

Madoun is an **event-sourced, deterministic engine** in pure TypeScript (`src/engine`) with a bilingual Next.js UI on top (`src/app`, `src/components`). The engine has no framework or network dependency, so it can run in a browser, a server or a robot-side bridge.

```
 synthetic data ──► events ──► reducer ──► World ──► views (tower, file, boards)
   (seeded)          ▲            │
                     │            └─► derived: requirements, review plan, risk, exceptions, learning, KPIs
         officer / robot actions (overrides, resolutions, inspection results, approvals)
```

## Principles
1. **Events are the truth.** A shipment's state is whatever replaying its events produces. This gives time travel (`worldAt`), audit and reproducibility for free.
2. **Deterministic.** Time is passed in, randomness is a seeded generator (`mulberry32`). Same seed, same run.
3. **Layer, don't replace.** Madoun sits beside ATLP/MAMAR. It reads filings and writes a shared evidence file; it does not issue declarations.
4. **Suggest, never self-edit.** The learning loop proposes weight changes and recurring-fault pre-checks; a person approves.
5. **Explain everything.** Every lane, verdict and delay carries a plain-language reason in English and Arabic.

## Modules (`src/engine`)
| Module | Job |
|---|---|
| `types.ts` | Domain model and event union |
| `evidence.ts` | Receipts, scope/validity/sharing checks, reuse log, SHA-256 hash chain |
| `requirements.ts` | Which approvals a shipment needs, from category and flags |
| `reviews.ts` | Review graph: dependencies, parallel layers, critical path, sequential baseline |
| `risk.ts` | Per-authority signals, lane thresholds, conflicts, random audit |
| `plan.ts` | Combines requirements, evidence and risk into one plan per shipment |
| `reducer.ts` | Applies events to the World |
| `exceptions.ts` | Missing evidence, expiring evidence, unowned handoff, idle review, authority conflict, with owners and escalation clocks |
| `learning.ts` | Outcome statistics and human-approved suggestions |
| `inspection.ts` | Robotics seam: task and result contract, result to evidence |
| `simulate.ts`, `metrics.ts` | Full-process simulation and KPIs (WCO time-release-study definitions) |

## UI
Client-side store (`src/lib/store.tsx`) builds the synthetic world once, exposes a scrub-able "now", and overlays officer actions as extra events. Pages: control tower, shipments, shipment file, exceptions, evidence, learning, inspection, simulator ("Today vs Madoun"), method. English/Arabic with RTL, light/dark.

## What the model is honest about
Authority queue waits are **not** shortened for full reviews; gains come from removing repeated checks, running independent reviews in parallel, surfacing blockers early and lane routing. Figures are modelled on synthetic data and are not a claim about real performance.
