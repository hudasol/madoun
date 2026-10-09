# Changelog

Milestones are listed with the commit that closes them. Git tags for each milestone are created locally
as `vX.Y.Z-name`; if tags are missing on GitHub, create them with the commands at the bottom.

## v1.3.0-tii — review round 3 (applied AI research)
- Post-clearance audits of flagged green shipments, interval-aware learning, model check (lanes, baselines, learned challenger, burden by group), simulator spread, model card, generated evaluation report. See docs/reviews/03-tii.md.

## v1.2.0-edge — review round 2 (defence and security systems)
- Ed25519 receipt attestations (demo keys), linear-time replay and simulation, event validation, API limits, security headers and CSP, noble SHA-256, property and differential tests, threat model, SBOM, CI. See docs/reviews/02-edge.md.

## v1.1.0-adeo — review round 1 (government office)
- Mock integration API (`/api/v1`), OpenAPI, JSON Schemas; role lens; clearance-record export; business-case panel; governance doc; Arabic data twins; reuse metric rebuilt; WCAG scan to zero violations. See docs/reviews/01-adeo.md.

## v0.9.1-polish — UI polish pass
- Sticky header with nav indicator, consistent form controls and slider, table and panel depth, button states, mobile header, tower column fit. No feature changes.

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

Milestone commits (to tag on GitHub if the push route stays blocked):

| Tag | Commit |
|---|---|
| v0.0.1-plan | 7a357ea |
| v0.2.0-engine | da48249 |
| v0.3.0-ui | 63f8562 |
| v0.4.0-boards | ae0de29 |
| v0.9.0-demo | 9028148 |
| v0.9.1-polish | 887d22a |

```bash
git push origin --tags
gh repo edit hudasol/madoun --add-topic customs,trade-facilitation,govtech,logistics,uae,abu-dhabi,ai,risk-management,single-window,robotics,arabic,nextjs,typescript
```
