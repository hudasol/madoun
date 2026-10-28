# Changelog

Milestones are listed with the commit that closes them. Git tags for each milestone are created locally
as `vX.Y.Z-name`; if tags are missing on GitHub, create them with the commands at the bottom.

## v1.5.0-edge-proposal: Edge proposal package (review round 5)
Proposal ready package for a supervised robotic inspection cell with tamper evident evidence that runs offline. All data remains synthetic, the API a mock and the keys public demo keys. See docs/edge-proposal.md, docs/decisions.md and docs/reviews/05-edge-proposal.md. Fingerprints: `results 500aad9e9dad8311` and `kpis 232a6abfa98ad394` unchanged; `events` and `world` changed because confirmation events are new (D3).
- **Officer confirmation of serious machine findings** (642df41, ad1cbb0, 1223ded, 62619b1, 31c0bbc): `requiresOfficerConfirmation`, the `InspectionConfirmed` event in both reducers, validation rules, pending receipts until upheld, learning outcomes only after confirmation, simulator confirmation inside the release window, banner and uphold or overturn form for the customs role, property test.
- **Robot gateway reference and contract** (8d89ec4, 37751b9, 2e4b772, 1f8eb19, ea09386): mock `GET /api/v1/inspection-tasks` and `POST /api/v1/inspection-tasks/{id}/result` with strict validation and byte caps, in memory store, dependency free reference gateway, ROS 2 message definitions, OpenAPI and JSON Schemas with a structural contract test, mapping table and rosbridge example.
- **Inspection cell digital twin and preregistered experiment** (4b012c9 preregistration first, then 5fc7f0c, c512cc9, 4c9447d, 226303b): pure seeded discrete event model, `npm run cell` over 30 seeds and four scenarios, comparison table with intervals on the Inspection page. After amendments A1 (separate random streams, as preregistered) and A2 (P6 reported as a structural check): 12 of 13 predictions hit, P5 missed.
- **Merkle checkpoints and proofs** (1c7dcb3, b7a28c7, e9e3b0e, 8bc18da): RFC 6962 tree over receipt hashes, signed checkpoints, inclusion and consistency proofs, proof and checkpoint routes, standalone offline verifier, "Copy inclusion proof" on the Evidence page, known answer tests.
- **Hardening and offline delivery** (009fca8, a9ef363, f4f504d, fda0844, 728b74f): per instance token bucket rate limiter, optional file based development keystore with a custody design, `npm run offline` egress proof, optional Dockerfile (not built here), static CSP decision with measurements, threat model update.
- **Proposal package** (c6979ba, 9eb06f3): two page Edge proposal with a consistency test, architecture and evidence flow diagram, README opening, six minute demo script.
- **Independent review and fixes** (9f71a6d, 31c2153, 649e46c, 6a9bd26, 580d257, 226303b, a80aec0, 7443328, b10d28b, 433458b): four bypasses of the confirmation rule closed and added to the property test, officer results refused on the device route, gateway receipts checkpointed, proof coverage and origin checks, server side proofs in the UI, corrected cell run, a stricter offline check, self review framing, older documents updated. See docs/reviews/05-edge-proposal.md and decisions D13.
- Tests: 139 at v1.4.0, 218 at this tag.

## v1.4.0-atrc: review round 4 (national research and strategy)
- Pilot plan page (EN/AR) with gates, stop criteria, day-one roles, readiness by component and an audit sample-size calculator; research programme for robotic inspection; AI impact assessment. See docs/reviews/04-atrc.md.

## v1.3.0-tii: review round 3 (applied AI research)
- Post-clearance audits of flagged green shipments, interval-aware learning, model check (lanes, baselines, learned challenger, burden by group), simulator spread, model card, generated evaluation report. See docs/reviews/03-tii.md.

## v1.2.0-edge: review round 2 (defence and security systems)
- Ed25519 receipt attestations (demo keys), linear-time replay and simulation, event validation, API limits, security headers and CSP, noble SHA-256, property and differential tests, threat model, SBOM, CI. See docs/reviews/02-edge.md.

## v1.1.0-adeo: review round 1 (government office)
- Mock integration API (`/api/v1`), OpenAPI, JSON Schemas; role lens; clearance-record export; business-case panel; governance doc; Arabic data twins; reuse metric rebuilt; WCAG scan to zero violations. See docs/reviews/01-adeo.md.

## v0.9.1-polish: UI polish pass
- Sticky header with nav indicator, consistent form controls and slider, table and panel depth, button states, mobile header, tower column fit. No feature changes.

## v0.9.0-demo: docs, demo script, polish
- Architecture, data model, robotics extension, research notes, demo script. Favicon, humanised learning rationale.

## v0.4.0-boards: exceptions, evidence, learning, inspection, simulator, method
- Six operational boards, bilingual, with working actions (resolve, approve, preview, run inspection).

## v0.3.0-ui: control tower and shipment file
- Arrival board, shipment list, per-shipment evidence file with lane explanation, timeline and audit.

## v0.2.0-engine: evidence, reviews, risk, exceptions, learning, inspection seam, simulator
- Event-sourced engine (pure TypeScript) with deterministic replay and time travel.
- Evidence receipts with provenance, scope, validity, custodian sharing policy, reuse log and a hash chain.
- Requirement mapping, parallel review graph with critical path and sequential baseline.
- Explainable per-authority risk signals, lanes, conflict detection, random audit selection.
- Exceptions with owners, clocks and escalation. Learning loop that only suggests.
- Inspection task/result contract and an inspection-cell simulator.
- Seeded synthetic data generator and full-process simulator. 62 tests.

## v0.0.1-plan: plan, README, licence

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
