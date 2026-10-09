# Madoun · مدوّن

**A shared shipment file for faster, pre-arrival customs clearance.**
Check once, reuse everywhere, review in parallel, and give every delay an owner.

Built for challenge **#21 — Smart Customs Accelerated Clearance** (Abu Dhabi Customs), TDRA UAE Hackathon 2026 challenge pack.

> **Status:** early build. Everything here runs on **synthetic data**. Authority mappings and risk rules are **illustrative samples** and must be validated with Abu Dhabi Customs and the relevant authorities before any real use.

---

## The problem

A shipment arriving at an Abu Dhabi border can need approval from Customs and several other authorities. Today:

- the same documents are requested and re-checked by more than one authority,
- reviews that could run side by side run one after another,
- nobody owns the gap between two authorities,
- a result from one inspection rarely improves the next risk decision.

This lowers the share of cargo cleared before it arrives, lengthens dwell time and raises trade costs.

## What Madoun does

| | |
|---|---|
| **One shipment file** | Every shipment gets a single, auditable file that all participating authorities see. |
| **Evidence receipts** | When an authority verifies something, the file records who verified it, what it covers and when it expires. Another authority can accept it instead of asking again. Documents stay with their custodian; Madoun holds the receipt. |
| **Parallel review** | Madoun maps which reviews depend on which, and runs the independent ones at the same time. |
| **Risk lanes** | Green clears before arrival. Amber gets targeted checks. Red gets a physical inspection. A blue flag marks post-clearance audit. Each decision shows its reasons. |
| **Owned exceptions** | Every stuck step has one named owner and a clock, with escalation. |
| **Learning loop** | Inspection results, false alarms and recurring missing evidence feed back as suggestions that a human approves. |
| **Robot-ready inspection** | Red-lane cargo becomes an inspection task that a person, robot, drone or scanner can perform. The result returns as evidence and outcome. |

### What it is not

- Not a replacement for ATLP / MAMAR. It sits on top of them.
- Not a central database every agency must feed.
- Not an autonomous decision-maker. Officers keep every legal decision, and every recommendation can be overridden with a recorded reason.

## How it is built

- **Engine** (`src/engine`): pure TypeScript, event-sourced. Every change is an event; state is derived. Fully unit-tested and deterministic.
- **App** (`src/app`): Next.js UI in English and Arabic (RTL).
- **Adapters**: ports for a single-window system, authority systems and an inspection cell. Mock adapters ship today.
- **Data**: a seeded synthetic generator with planted edge cases (expired certificate, scope mismatch, authority conflict, idle review, repeated false alarm…).

See [`plan.md`](plan.md) for the full plan, research basis and milestones.

## Aligned with

- WTO Trade Facilitation Agreement: pre-arrival processing (7.1), release separate from final determination (7.3), risk management (7.4), post-clearance audit (7.5), release-time measurement (7.6), authorised operators (7.7), border agency cooperation (Art. 8).
- WCO Data Model vocabulary (declaration, goods shipment, consignment, transport means) and the WCO Time Release Study approach to metrics.
- UAE National AI Strategy 2031 and the Abu Dhabi logistics-hub direction named in the challenge profile.

## Run it

```bash
npm install
npm test          # engine tests
npm run dev       # http://localhost:3000
npm run build
```

Modelled result on the synthetic week (240 shipments, seeded, reproducible): median release 27.3 h → 16.0 h (−41%), p90 48.3 h → 31.1 h, approvals ready before arrival 62.5% → 77.1%, 294 repeat checks avoided. These are model outputs on invented data, not a performance claim. Queue waits for full reviews are deliberately not reduced.

API: a mock integration API is served under `/api/v1` (spec in `public/openapi.yaml`). Accessibility: `npm run a11y` (with the app running).

Reviews: each round of expert critique and its checklist is in [docs/reviews](docs/reviews).

Docs: [plan](plan.md), [governance](docs/governance.md), [threat model](docs/threat-model.md), [pilot plan](docs/pilot-plan.md), [research programme](docs/research-programme.md), [AI impact assessment](docs/ai-impact-assessment.md), [model card](docs/model-card.md), [evaluation](docs/evaluation.md), [integration](docs/integration.md), [architecture](docs/architecture.md), [data model](docs/data-model.md), [robotics extension](docs/robotics-extension.md), [research notes](docs/research-notes.md), [demo script](docs/demo-script.md).

## Roadmap

See the milestone table in [`plan.md`](plan.md#8-milestones--tags). Each milestone is a git tag.

## Responsible use

Madoun's risk logic uses only objective criteria that the WTO TFA lists as permissible for risk management (tariff code, goods type, origin, shipping country, value, trader compliance history, transport mode). It does not profile individuals. Outputs are recommendations with reasons.

## Licence

MIT — see [`LICENSE`](LICENSE).
