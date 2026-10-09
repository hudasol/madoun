# Data model

All data is synthetic. Authority names are generic stand-ins; rules are illustrative and must be validated with the real authorities.

## Core entities
- **Shipment**: trader, forwarder, consignments (containers, items with category and flags), entry point, ETA, `submitted`/`filedAt`.
- **Requirement**: authority, goods categories/flags it applies to, accepted evidence types, `dependsOn` (other requirements, or `*blocking`), `relyOn` (reuse another authority's finding), review and accept hours.
- **EvidenceReceipt**: type, subject, summary (EN/AR), issuer, method, scope (`shipment` | `trader` | `trader-product`), validity window, custodian, `sharedWith`, `reuseLog`, `prevHash`, `hash`.
- **ReviewPlan**: per-authority reviews with layer, whether reviewed in full or accepted from a receipt, predicted start/finish, critical path, sequential baseline.
- **RiskAssessment**: signals (key, points, reason EN/AR, owning authority), score, lane (green/amber/red), blue audit flag, conflicts, recommended checks.
- **ExceptionItem**: kind, shipment, owner, opened/resolved, escalation level.
- **InspectionTask / InspectionResult**: see `robotics-extension.md`.
- **Outcome**: result (`confirmed` | `false-alarm` | `not-inspected`), trigger keys, missing evidence.

## Evidence verdicts
`satisfied-own`, `satisfied-reuse`, `missing`, `expired`, `expires-before-eta`, `scope-partial`, `not-shared`, `revoked`, `pending`, `awaiting-review`.

## Hash chain
Each receipt hash covers its canonical content (status excluded) plus the previous hash, so tampering with history is detectable (`verifyChain`). Demo-grade SHA-256, not PKI or a qualified signature.

## Risk factors
Only objective criteria of the kind WTO TFA Art. 7.4 allows: goods type, value against a reference band, origin new for the trader, trader compliance history, transport mode, plus regulator-owned flags. There is no country blacklist. Thresholds: amber 28, red 48. Random audit: 1 in 20, chosen by hash so it is reproducible.
