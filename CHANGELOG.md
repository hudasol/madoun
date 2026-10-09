# Changelog

Milestones are listed with the commit that closes them. Git tags for each milestone are created locally
as `vX.Y.Z-name`; if tags are missing on GitHub, create them with the commands at the bottom.

## v0.9.0-demo — docs, demo script, polish
- Architecture, data model, robotics extension, research notes, demo script. Favicon, humanised learning rationale.

## v0.4.0-boards — exceptions, evidence, learning, inspection, simulator, method
- Six operational boards, bilingual, with working actions (resolve, approve, preview, run inspection).

## v0.3.0-ui — control tower and shipment file
- Arrival board, shipment list, per-shipment evidence file with lane explanation, timeline and audit.

## v0.2.0-engine — evidence, reviews, risk, exceptions, learning, inspection seam, simulator
- Event-sourced engine (pure TypeScript) with deterministic replay and time travel.
- Evidence receipts with provenance, scope, validity, custodian sharing policy, reuse log and a hash chain.
- Requirement mapping, parallel review graph with critical path and sequential baseline.
- Explainable per-authority risk signals, lanes, conflict detection, random audit selection.
- Exceptions with owners, clocks and escalation. Learning loop that only suggests.
- Inspection task/result contract and an inspection-cell simulator.
- Seeded synthetic data generator and full-process simulator. 62 tests.

## v0.0.1-plan — plan, README, licence

## Tags and GitHub topics
Tags exist locally; the sandbox could not push tags or edit repo topics. Run from a clone with push access:

```bash
git push origin --tags
gh repo edit hudasol/madoun --add-topic customs,trade-facilitation,govtech,logistics,uae,abu-dhabi,ai,risk-management,single-window,robotics,arabic,nextjs,typescript
```
