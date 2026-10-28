# Limitations

What Madoun is not yet, stated before anyone has to ask. Each row says what is missing, why it matters, and what would close it. Rows are grouped by the kind of risk, most serious first. When one of these is closed, change the row in the same commit that closes it.

## Evidence for the claims

| Limit | Why it matters | What closes it |
|---|---|---|
| Every shipment, trader, receipt and authority rule is synthetic. Authority mappings are illustrative. | No result here describes Abu Dhabi cargo. | A pilot on real filings with the authorities' own rules, as set out in [pilot-plan.md](pilot-plan.md). |
| The headline simulation result (median release down 41%) rests on assumed customs and regulator times. With customs at its published 13.86 minute speed the same simulation gives 9%. | The large figure should not be quoted without the small one. | Measured step times from a time release study ([baselines.md](baselines.md)). |
| No public figure exists for other authorities' review times, the inspection rate, or release times by lane. | The simulator needs all three. | Data from the authorities, not from the public record. |
| The risk benchmark uses a synthetic copy of Korean declarations that were already selected for inspection. | It compares methods on data Madoun did not generate. It does not measure performance on UAE traffic and cannot see uninspected cargo. | Labelled outcomes from Abu Dhabi, including a random inspection sample. |
| Two preregistered predictions missed (P5 and P8 in [benchmark-korea.md](benchmark-korea.md)); the explainable model keeps 68% of the skill above chance of an unconstrained reference. | The cost of using only permitted criteria is real. | A decision by customs on whether that cost is acceptable. |
| Reviews in [reviews](reviews) are self reviews. No outside body has reviewed, endorsed or commissioned this work. | They test the design, not the organisations they are named after. | An independent review by the real organisations. |

## Security

| Limit | Why it matters | What closes it |
|---|---|---|
| Authentication is a bearer key check. There is no mutual TLS, no identity provider, no key rotation tooling, and keys are not limited to one trader's shipments. | A leaked key works until its entry is removed. | Service identity and rotation at the gateway, as described in [integration.md](integration.md). |
| The public demo runs with authentication off (`MADOUN_AUTH` unset). `/api/v1/health` says so. | Safe only because the data is synthetic. | Set `MADOUN_AUTH=keys` for anything else. |
| Signing keys are public demo keys unless a development key file is configured, and a key file is not key custody. | A valid signature shows the mechanism works, not who signed. | A hardware security module or key management service ([key-custody.md](key-custody.md)). |
| Receipt status, summary text and revocation reason are not covered by hashes, signatures or proofs. | Someone with write access could change a status without breaking the chain. | Hash those fields in a new receipt version. |
| Checkpoints protect against a rewrite of the ledger only if a party outside the operator keeps them. | Otherwise the operator can rewrite history. | Witnesses that store checkpoints. |
| Rate limits are per process and keyed partly on a forwarded address a caller can change. | Weak against deliberate abuse. | Limits at the gateway keyed on the authenticated identity. |
| No penetration test has been run. Findings come from design analysis and automated checks ([threat-model.md](threat-model.md)). | Unknown unknowns. | An outside test. |
| The content security policy still allows inline script (decision D8). | Weaker XSS containment. | A nonce based policy when the framework supports it without dynamic rendering of every page. |

## Persistence and integration

| Limit | Why it matters | What closes it |
|---|---|---|
| The browser application reads a generated world and never reads the server's event store. Results posted by a gateway appear in the API, not in the officer interface. | The officer confirmation step for a posted result has to be driven by an event the UI does not yet load. | Load the store in a live mode of the application. |
| The event store (`MADOUN_STORE`) is memory by default. The file and SQLite adapters are for one machine. | A deployment of several machines would diverge. | A networked store with the same interface ([src/server/store](../src/server/store)). |
| The shipments, receipts and ledger served by the API are the generated snapshot. Only gateway results are stored. | There is no system of record. | An adapter that feeds real events in. |
| The declaration import maps a flat file to the assessment format. It is not a WCO or ATLP message and does not map a filer's own identifier to a trader id ([import.md](import.md)). | A real adapter is still needed. | Interface specifications for ATLP and MAMAR, which we have not seen. |
| Metrics and the request log are per process. | Several instances need a scraper and a log shipper. | Deployment configuration. |

## Operations and delivery

| Limit | Why it matters | What closes it |
|---|---|---|
| The Dockerfile has never been built or run. | It may not work. | Build and scan it in CI. |
| No load test beyond the micro benchmark in `npm run bench`. | Capacity is unknown. | A load test against a deployment sized for real volumes. |
| No high availability, backup or restore procedure for the event store. | A lost file is lost evidence. | Operational design with the host organisation. |
| Browser checks need a local Chromium or Edge. | They cannot run on a bare machine. | None needed. |

## Robotics

| Limit | Why it matters | What closes it |
|---|---|---|
| The robot is a simulator. The gateway, the ROS 2 messages and the cell model are reference designs. | No hardware has been connected. | A supervised trial with a real cell. |
| The digital twin missed one preregistered prediction (P5 in [cell-experiment.md](cell-experiment.md)). | Its numbers are assumptions made visible. | Measured fault and throughput rates. |
| Officer confirmation catches a false serious finding but cannot recover a violation the machine missed. | The cell can miss more than officers do under the assumptions tested. | Random audits on every lane and the pilot's measurements. |
