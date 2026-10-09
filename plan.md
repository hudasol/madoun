# Madoun (مدوّن) — build plan

> Status: living document. Last updated 2026-10-09.
> Challenge: **#21 Smart Customs Accelerated Clearance** (Abu Dhabi Customs), TDRA UAE Hackathon 2026 challenge pack.

## 1. The problem in one paragraph

A consignment crossing an Abu Dhabi border is reviewed by Customs and, depending on the goods, by several other authorities (food safety, standards and conformity, health, telecoms, environment…). Each authority keeps its own queue, its own forms and its own risk view. The same invoice, certificate or inspection result is asked for and re-checked more than once, reviews that could run side by side run one after another, and a delay between two authorities has no single owner. Result: lower pre-arrival clearance, longer dwell time, higher trade cost.

The challenge's five root causes, which are the five things Madoun is built against:

| ID | Root cause (from the profile) | Madoun answer |
|----|-------------------------------|---------------|
| R1 | No shared decision points, dependency visibility or end-to-end accountability | **Shipment file** with a dependency graph of reviews and one owner per step |
| R2 | Evidence not governed for authoritative reuse (provenance, validity, acceptance rules, custodianship) | **Evidence receipts** with issuer, scope, validity and acceptance rules, reusable by other authorities |
| R3 | Risk definitions and thresholds not aligned across mandates | **Per-authority risk signals** kept as-is, combined by an explicit, explainable rule; conflicts surfaced, not hidden |
| R4 | Routine and complex cargo follow the same steps | **Risk lanes** (green / amber / red, plus a blue post-clearance audit flag) with different pathways |
| R5 | Outcomes don't feed a shared learning cycle | **Outcome loop**: inspection results, false interventions and recurring missing evidence update future decisions |

## 2. What Madoun is — and is not

**Is:** an orchestration layer that sits *on top of* existing single-window and port-community systems (Abu Dhabi: MAMAR, Maqta PCS, ATLP) and gives each shipment one shared, auditable file.

**Is not:** a replacement for ATLP/MAMAR, a new declaration portal, a central database that every agency must feed, or an autonomous decision-maker. Humans keep every legal decision; Madoun recommends, explains and keeps the clock.

### Design rules (each one traced to the research in §3)

1. **Layer, don't replace.** Abu Dhabi already has a single window; ignoring it would lose credibility.
2. **Federated evidence.** The custodian agency keeps its data; Madoun stores *receipts* (who verified what, scope, validity, hash), not the documents. Data-sharing reluctance and TradeLens' failure both point here.
3. **Each participant gets value alone.** No "everyone must join first" cliff (TradeLens lesson).
4. **Every automated recommendation carries its reasons** in plain language, and every recommendation can be overridden by a named officer with a recorded reason.
5. **Risk criteria stay non-discriminatory and objective** (WTO TFA Art. 7.4 lists permitted criteria: tariff code, goods type, origin, shipping country, value, trader compliance history, transport mode). Madoun's engine uses only those.
6. **Release is separable from final determination** (TFA Art. 7.3): the model supports "release with guarantee, finalise later".
7. **Append-only audit trail.** Every state change is an event; state is derived. This is the audit story and the replay/simulation story.

## 3. Research summary (what the structure is based on)

### 3.1 Market gaps (full table in the project brief)
- Government single windows move data to agencies but do not unify agency decisions; windows are "bespoke"; agencies are reluctant to share data; one Australian study found one exporter's name on 118 forms, described 61 ways.
- Abu Dhabi's own time-release study (BorderMeter) found coordination with other authorities needs a framework, joint inspections, and customs officers acting for some authorities.
- Commercial customs software mostly serves traders and brokers, not cross-agency orchestration on the authority side.
- AI risk engines: bias from history, opacity, hallucination (generative), regulatory churn; each authority scores under its own mandate.
- Inspection hardware (AI scanners, drones, crawlers) is sensor-in-isolation; no public evidence its results feed a shared cross-agency record. *(absence of public information, not proof)*
- TradeLens closed: weak value for data providers, neutrality doubts, cost, no global adoption.

### 3.2 Standards we align with
- **WTO Trade Facilitation Agreement**: Art. 7.1 pre-arrival processing; 7.3 release separate from final duty determination; 7.4 risk management; 7.5 post-clearance audit feeding risk management; 7.6 average release time measurement; 7.7 authorised operators; Art. 8 border agency cooperation (aligned hours, procedures, joint controls). Madoun's metrics are chosen so they can be reported against these.
- **WCO Data Model**: three main class levels — Declaration/GoodsShipment (goods declaration), Declaration/Consignment (cargo report, transport contract), Declaration/BorderTransportMeans (conveyance report). Classes nest. Our shipment model mirrors this vocabulary.
- **Multiple-level data filing** (Swedish Customs' WCO-based implementation): store each fact at the lowest level where it is true; one transport document per consignment; invoice-level data at goods-shipment level vs item level. We copy the hierarchy and cardinality rules.
- **Verifiable-credential style validation** (UNECE/eTradeForAll): validate documents at source via issuer-signed claims and status checks, not via a central intermediary. Our *evidence receipt* is a simplified, signable analogue. Real signing/PKI is out of scope for the demo (hash-chained receipts only).
- **WCO Time Release Study** categories: lane routing (green/yellow/red/blue), time per step, "inaction time", whether OGA time runs concurrently with customs time. These are our KPI definitions.

### 3.3 UAE context
- Federal layer: ICP (Federal Authority for Identity, Citizenship, Customs & Port Security) oversees customs; each emirate has a local customs authority (Abu Dhabi Customs among them). The federal/local split of duties is not fully described in public pages we found — **to confirm with a domain contact**.
- HS classification under the GCC tariff (reported 12-digit from Jan 2025 in one secondary source — **verify**).
- Typical import documents: commercial invoice, packing list, bill of lading / air waybill, certificate of origin, delivery order, import permit for restricted goods.
- Regulated-goods approvals by category (secondary sources): food (MOCCAE / emirate food-safety authority), electronics and conformity (ESMA, now under MOIAT), pharmaceuticals and some medical (MOHAP), wireless/telecom type approval (TDRA), chemicals (MOCCAE).

> **Assumption flag.** The mapping from goods category to approving authority in the demo is *illustrative* and sourced from secondary web pages. It must be validated with Abu Dhabi Customs / the authorities before any real use. The UI labels it as sample rules.

## 4. Scope

### 4.1 In scope for the first build (v0.x)
1. Shipment file model (WCO-style hierarchy: declaration → goods shipment → consignment → goods items; parties; transport means).
2. Evidence ledger with receipts, validity, scope, acceptance rules, reuse tracking, hash chain.
3. Requirements engine: from goods (HS chapter, category, origin, value, mode) → required approvals and which authority owns each.
4. Review graph: dependencies between reviews; parallel layers; critical path; sequential-vs-parallel time comparison.
5. Risk engine: per-authority signals + combination rule + explanations + conflict detection → lane.
6. Exception board: owner, clock, escalation ladder, ageing.
7. Outcome/learning loop: record outcomes, compute false-intervention and recurring-missing-evidence stats, propose (never auto-apply) rule adjustments.
8. Inspection hook (robotics-ready): `InspectionTask` / `InspectionResult` schema, an inspection-cell simulator, ingest endpoint; results become evidence receipts and outcomes.
9. Synthetic data generator (seeded) with deliberate edge cases.
10. Bilingual UI (English / العربية, RTL), dark, keyboard-accessible.
11. Tests on the engine; README; architecture notes; robotics one-pager.

### 4.2 Out of scope (explicitly)
- Real integration with ATLP/MAMAR (we define the adapter interface and ship a mock adapter).
- Real cryptographic signing / PKI / verifiable-credential issuance.
- Any real shipment, trader or personal data. **All data is synthetic.**
- Legal advice; tariff/duty calculation beyond a clearly labelled illustration.
- Training ML models. The risk engine is transparent rules + counted statistics so every output is explainable.

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI  (Next.js, React, bilingual EN/AR)                      │
│  Control tower · Shipment file · Exceptions · Evidence ·    │
│  Learning · Inspection · Simulator                          │
└───────────────▲─────────────────────────────▲───────────────┘
                │ derived state               │ commands
┌───────────────┴─────────────────────────────┴───────────────┐
│  Engine  (pure TypeScript, no framework, fully tested)       │
│  events → reducer → state                                    │
│  requirements · evidence · reviews(DAG) · risk · exceptions  │
│  · learning · metrics · simulator                            │
└───────▲──────────────────────▲───────────────────▲──────────┘
        │ adapter port         │ adapter port      │ adapter port
  ┌─────┴──────┐        ┌──────┴───────┐     ┌─────┴───────────┐
  │ Single-    │        │ Authority    │     │ Inspection cell │
  │ window     │        │ systems      │     │ (robot / drone  │
  │ (ATLP/     │        │ (receipts in)│     │ / X-ray)        │
  │ MAMAR mock)│        │              │     │ simulator today │
  └────────────┘        └──────────────┘     └─────────────────┘
```

### 5.1 Core pattern: event-sourced shipment file
- Everything that happens to a shipment is an **event** (`ShipmentRegistered`, `EvidenceReceiptIssued`, `ReviewStarted`, `ReviewCompleted`, `RiskSignalRaised`, `LaneAssigned`, `ExceptionOpened`, `ExceptionResolved`, `InspectionRequested`, `InspectionCompleted`, `OutcomeRecorded`, `OfficerOverride`, …).
- State is a pure function of the event list. Benefits: audit trail for free, deterministic tests, time-travel in the simulator, replay for the learning loop.
- Time is always passed in (`now`), never read from the clock inside the engine, so tests and simulations are deterministic.

### 5.2 Folder layout
```
madoun/
  plan.md  README.md  LICENSE
  docs/            architecture.md · data-model.md · robotics-extension.md · research-notes.md
  src/
    engine/        types.ts · events.ts · reducer.ts · requirements.ts · evidence.ts
                   reviews.ts · risk.ts · exceptions.ts · learning.ts · metrics.ts
                   simulate.ts · adapters.ts · index.ts
    data/          authorities.ts · rules.ts · generate.ts (seeded synthetic data)
    app/           Next.js routes (App Router) + api/ (event ingest, inspection ingest)
    components/    UI components
    lib/           i18n, formatting, store
  tests/           engine tests (vitest)
```

### 5.3 Data model (WCO-flavoured, simplified)
- **Shipment** `{ id, declarationRef, transportMode, borderTransportMeans{ vessel/flight/truck, eta, port }, consignments[{ transportDocRef, consignor, consignee, items[] }], goodsShipment{ invoiceRef, incoterm, currency, totalValue }, trader{ id, aeoStatus, history } }`
- **GoodsItem** `{ hsCode, description, origin, value, quantity, packages, category, handlingFlags[] }` — facts stored at the lowest level where true.
- **Authority** `{ id, name, mandate, workingHours, slaHours, riskSignals[] }`
- **Requirement** `{ id, authorityId, kind, appliesTo(goods), acceptsEvidenceTypes[], maxAgeDays }`
- **EvidenceReceipt** `{ id, subject(document or claim), type, issuer, custodian, verifiedBy, method, scope{ hs chapters, origin, trader, shipment|trader|product }, validFrom, validUntil, status, acceptanceRules, hash, prevHash, reuseLog[] }`
- **Review** `{ id, authorityId, requirementId, dependsOn[], state, owner, startedAt, dueAt, completedAt }`
- **RiskSignal** `{ authorityId, factor, weight, direction, reason }` (factors limited to TFA-7.4-permitted criteria)
- **LaneDecision** `{ lane, perAuthority[], conflicts[], reasons[], recommendedChecks[], confidence, overriddenBy? }`
- **Exception** `{ id, shipmentId, kind, ownerId, openedAt, clockHours, escalationLevel, state }`
- **Outcome** `{ shipmentId, intervention, result: confirmed|false-alarm|none, findings[], missingEvidence[] }`

### 5.4 Key algorithms (all transparent)
1. **Evidence acceptance** — receipt R satisfies requirement Q for shipment S iff: type allowed; R not expired at `now`; R.scope covers S (HS chapter, origin, trader/product/shipment level); R.status = verified; R.custodian reachable (or snapshot within allowed age). Otherwise return the *specific* reason (`expired`, `scope-too-narrow`, `type-not-accepted`, `revoked`, `none`). Reuse is logged so we can report "checks avoided".
2. **Review graph** — each review lists `dependsOn`. Topological layering gives the parallel schedule; longest weighted path gives the critical path. We report `sequentialHours` vs `parallelHours`. Real dependencies are modelled (e.g. a conformity certificate may be needed before the customs examination decision) so the saving isn't faked.
3. **Risk combination** — per authority: score = Σ(weight × signal) → authority lane. Overall lane = highest-severity lane, but the *scope* of the intervention stays with the authority that raised it (so one authority's red does not silently turn the whole shipment red for everyone). Conflicts (e.g. one authority green + another red on the same item) are listed with the rule that resolved them. Trusted-operator status (AEO) lowers scores only within TFA-7.7-style benefits.
4. **Exception clocks** — each open dependency without activity beyond its SLA opens an exception with an owner (owner = authority named on the blocking review; fallback = customs duty officer). Escalation after N hours, configurable.
5. **Learning** — counts per (factor, category) of interventions vs confirmed findings → hit rate; recurring missing-evidence types per trader/forwarder; suggestions such as "raise evidence pre-check for X" or "lower weight of factor Y (hit rate 3% over 120 cases)". Suggestions need a human to approve; the engine never self-edits rules.
6. **Metrics** — pre-arrival-cleared %, median/p90 release time by lane, "inaction time" (waiting with no owner action), repeat verifications avoided, exceptions ageing, false-intervention rate. Definitions follow the WCO time-release approach.

### 5.5 The robotics seam
- Contract: `InspectionTask { id, shipmentId, containerId, requestedBy, scope[], constraints }` → `InspectionResult { taskId, performedBy(robot id|officer), sensors[], findings[], media[], seal{ intact, id }, completedAt }`.
- Madoun turns a red/amber lane into an `InspectionTask`; a cell (human, robot, drone, scanner) executes it; the result becomes an **EvidenceReceipt** (method = `robotic-inspection`) and an **Outcome**, which feeds the learning loop.
- Today: an inspection-cell **simulator**. Later: a ROS 2 bridge adapter. See `docs/robotics-extension.md`.

## 6. UI plan

**Hero element (the one memorable thing): the shipment file with rubber-stamp evidence receipts.** A receipt reads like a customs stamp: authority, what was verified, valid-until. Reused receipts show a second, lighter stamp for each authority that accepted them. The rest of the interface stays quiet.

Screens:
1. **Control tower** — lane board (counts and aging), pre-arrival-cleared %, repeat checks avoided, open exceptions.
2. **Shipment file** — container/consignment header, goods, required approvals vs receipts (with reasons for any gap), review timeline (parallel vs sequential), lane explanation, exceptions, audit trail.
3. **Exceptions** — owned, clocked, escalating.
4. **Evidence ledger** — all receipts, reuse counts, expiring soon, revoked.
5. **Learning** — hit rates by factor, recurring missing evidence, pending rule suggestions.
6. **Inspection** — tasks, simulated cell, result ingestion.
7. **Simulator** — replay a day of synthetic arrivals: "today" vs "with Madoun".

Cross-cutting: English + Arabic with RTL, light/dark via CSS variables, keyboard focus, reduced motion respected, mobile-friendly.

Visual direction: ink-dark slate base, paper-toned text, lane colours (green/amber/red) used *only* for lane meaning, steel blue for neutral emphasis. Type: Space Grotesk for interface, IBM Plex Sans Arabic for Arabic, a monospaced face for container numbers and hashes only. Stamps are the signature element; no decorative gradients.

## 7. Synthetic data
Seeded generator (same seed ⇒ same data). ~80 shipments over 5 days across sea/air/land, ~15 traders (some AEO-like, some with history), ~10 authorities, goods across chapters (food, electronics, pharma, chemicals, textiles, machinery, e-commerce parcels).
Planted edge cases:
- Same health certificate valid for several shipments of one trader (reuse).
- Certificate expired by one day.
- Certificate scope covers product A but shipment contains product B.
- Two authorities disagreeing on lane.
- Authority review idle past SLA with no owner.
- Inspection finds nothing (false alarm) repeatedly for one factor.
- Missing document that recurs for one forwarder.
- Red-lane shipment with robotic inspection result.

## 8. Milestones & tags

| Tag | Content |
|-----|---------|
| `v0.0.1-plan` | plan.md, README, license, repo metadata |
| `v0.1.0-engine` | types, events, reducer, evidence, requirements, reviews + tests |
| `v0.2.0-risk` | risk, exceptions, learning, metrics, simulator + tests, synthetic data |
| `v0.3.0-ui` | app shell, control tower, shipment file, bilingual |
| `v0.4.0-boards` | exceptions, evidence, learning, simulator screens |
| `v0.5.0-inspection` | inspection seam, simulator cell, ingest API |
| `v0.9.0-demo` | polish, docs, robotics one-pager, demo script |

## 9. Quality bar
- `npm run typecheck`, `npm test`, `npm run build` must pass before each tag.
- Engine coverage on the algorithms in §5.4, including each planted edge case.
- No real data, no secrets in the repo.
- Every UI string has an English and an Arabic version.
- Honest labelling: sample rules and synthetic data are labelled as such in the UI and README.

## 10. Risks and how we handle them

| Risk | Handling |
|------|----------|
| Authority mapping and rules are wrong for Abu Dhabi | Labelled illustrative; rules live in data files, editable; validate with a customs broker / contact |
| Judges know ATLP/MAMAR well | Position as a layer on top; adapter interface; never claim to replace |
| "AI" over-claim | The engine is transparent rules + counts; say so; explainability is the feature |
| Data-sharing objection | Federated receipts; custodian keeps documents; hash/verify at source |
| Scope creep overnight | Milestone tags; each tag is shippable; UI built on a stable engine |
| Legal/ethical bias in risk | Only TFA-7.4-permitted factors; every recommendation overridable with a recorded reason |

## 11. Open questions for a domain expert
1. Which approvals actually block release at Abu Dhabi sea, air and land entry points, and which can run after release?
2. Does ATLP expose APIs (or file exchanges) for status and document-validity checks?
3. What is the real legal basis for one authority to rely on another's verification?
4. Which risk factors are authorities legally allowed to share with each other?
5. Which hours do authorities operate (alignment of working hours is an Art. 8 lever)?

## 12. Reuse beyond this hackathon
The engine is domain-light: *evidence with validity + dependent reviews + risk lanes + owned exceptions + learning loop*. The same core fits free-zone licensing, port-of-entry food safety, air-cargo security, and multi-agency permits. Pitches: GovTech (trade facilitation), logistics/supply-chain, robotics-and-automation (inspection cell), responsible-AI (explainable recommendations).
