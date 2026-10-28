# Threat model (STRIDE)

Scope: the Madoun prototype as built here (browser app, REST API with optional bearer key authentication including the inspection gateway routes, pure TypeScript engine, reference robot gateway). All data is synthetic and the API is a mock; this document says what the design defends against **today**, what it only demonstrates, and what a production deployment must add. Nothing here claims the prototype is secure enough to hold real declarations. Last updated for v1.6.0.

## Assets
| Asset | Why it matters |
|---|---|
| Evidence ledger (receipts, hash chain, Merkle checkpoints, signatures) | Authorities rely on it instead of checking again; a forged or altered receipt releases cargo wrongly. |
| Inspection results from machines | A false serious finding delays legitimate trade; a suppressed one releases a violation. |
| Risk lane and its explanation | Decides who is inspected; must be explainable and not silently manipulable. |
| Shipment file and audit trail | Basis for post clearance audit and disputes. |
| Trader and declaration data | Commercially sensitive; in production, regulated. |
| Learned risk weights | A poisoned weight changes who gets inspected. |
| Signing keys | Whoever holds a key can vouch for receipts or checkpoints. |

## Trust boundaries
1. Browser to API (untrusted input, JSON bodies).
2. Adapter (ATLP or MAMAR side) to Madoun (in production: authenticated service identity).
3. Authority to ledger (each authority is trusted only for receipts it verified itself).
4. Robot, drone or scanner gateway to the inspection routes (device identity, media integrity, finding accuracy).
5. Ledger operator to verifiers (checkpoints and proofs checked offline with a public key obtained separately).

## STRIDE

| | Threat | Today | Production requirement |
|---|---|---|---|
| **S**poofing | Someone claims a receipt was verified by an authority | Receipts are Ed25519 signed over the chain hash; a signature from the wrong authority is rejected (`wrong-signer`). **Demo keys are public**, so this proves the mechanism only. | Per authority keys in an HSM or KMS, rotation, a published key registry, revocation (docs/key-custody.md). |
| | Anyone calls the API, including the gateway result route | With `MADOUN_AUTH=keys` every route except `/health` needs a bearer key, stored only as a SHA-256 hash and compared in constant time; each key has a role and scopes, a route answers 403 without its scope, and a missing or invalid key configuration refuses every request with 503 instead of falling back to open access (tested). **The public demo runs with authentication off.** | Mutual TLS or signed requests per device and adapter, key rotation, identity from the host organisation. |
| | One gateway reports under another device's name | With keys on, a gateway key may only post results whose `performedBy` equals its own key id (tested). This is an identity label, not device attestation. | Device keys held in hardware and signed results. |
| | A fake robot reports a serious finding | Cannot become verified evidence or a learning outcome without a customs officer upholding it (`requiresOfficerConfirmation` and `validateEvent`; the property test covers receipts issued early or under other ids, second results and early outcomes, after an independent review found those paths). The device route refuses officer results. A fake robot can still create a pending receipt and waste officer time, and a fake clean result is recorded as verified. | Device identity as above; per device rate limits; alerting on overturn rates. |
| | Ledger operator presents a forged checkpoint | Checkpoints are Ed25519 signed; the offline verifier uses a key supplied by the verifier, not by the proof. Default key is the public demo key; a file based development key is optional. | Operator key in an HSM or KMS; the public key distributed out of band. |
| | Role lens used as access control | The browser role lens is a demo of views, not access control; the UI says so. The API enforces roles when keys are on. | Keep. |
| **T**ampering | Edit a stored receipt, or drop, reorder or duplicate one | Hash chain detects every one of these (property tested). Signatures detect edits without the key. | Keep. |
| | Rewrite the whole ledger | RFC 6962 Merkle checkpoints with inclusion and consistency proofs (`/api/v1/ledger/checkpoint?from=N`, `scripts/verify-proof.mjs`); a rewrite is not consistent with any checkpoint kept earlier (tested). **Only effective if someone outside the operator keeps checkpoints.** | Independent witnesses or periodic publication of checkpoints to parties outside the operator. |
| | Change a receipt's status or summary text (for example revoked to verified) | **Not covered by hashes or proofs**: only the fields in `HASHED_RECEIPT_FIELDS` are hashed; status, summary text and revocation reason are not (stated in code, the API description, the verifier output and a test). Status changes are events in the audit log. | Sign status change events, or add a signed status log with its own checkpoints. |
| | Tampered inspection media | Results carry a SHA-256 digest and size per media file; the gateway computes them at capture. Madoun does not hold or check the media itself. | Media stored by the custodian and checked against the digest on retrieval; digests signed by the device key. |
| | Malformed or oversized request | Strict schema validation, unknown fields rejected at every level, string and array caps, byte caps checked on declared and actual bytes (256 KiB assessments, 64 KiB inspection results). Fuzzed with arbitrary JSON (never throws). | Keep; WAF in front. |
| | Spreadsheet formula injection through exports | CSV cells starting with `= + - @` are neutralised (tested). | Keep. |
| | Event with a bad reference silently "succeeds" | `validateEvent` rejects it before it reaches the log, at every ingestion path (UI actions, gateway route). | Same check at every new ingestion path. |
| **R**epudiation | An officer denies an override, a resolution or a confirmation | Every action is an event with actor, time and reason or note in an append only log; a confirmation without an officer id and a note is rejected. Actors are labels in the demo. | Authenticated identities; signed events. |
| **I**nformation disclosure | A regulator sees receipts not shared with it | Sharing policy filters the ledger in the UI. The API returns all receipts to everyone (mock). | Enforce on the server, not the client. |
| | Browser or server leaks data to third parties | CSP `default-src 'self'`, `connect-src 'self'`, no external origins; `scripts/security-check.mjs` checks the browser; `scripts/offline-check.mjs` preloads an egress guard into the server (DNS lookups, TCP and TLS connections, UDP sends from Node) and observes no outbound attempt while every page and API route is used successfully. It cannot see native add-ons or processes started without the guard. | Keep; add data residency controls (see governance.md). |
| | Server banner or framework fingerprint | `X-Powered-By` removed. | Keep. |
| **D**enial of service | Request flood | In-memory token bucket per instance and client (reads 600 burst, 100 per second; writes 120 burst, 20 per second), 429 with `Retry-After` (tested). **Per instance only and keyed on a forgeable forwarded address; without a forwarding proxy every caller shares one bucket, so one client can use up the write allowance for all.** | Rate limits at the gateway keyed on authenticated identity; queueing; autoscaling. |
| | Huge declaration or result | Body and array caps as above; engine scales linearly. | Keep the benchmark in CI. |
| | Robots fail and the queue grows | Modelled, not mitigated: in the cell experiment frequent faults move work back to officers and lengthen the tail (docs/cell-experiment.md). | Operational fallback plan and staffing rules agreed with customs. |
| **E**levation of privilege | XSS leading to action as an officer | React escaping; CSP blocks third party script and framing, forbids `object-src` and `base-uri` tricks. CSP still allows inline script (Next bootstrap); a nonce based CSP was assessed and deferred (docs/decisions.md, D8, with measurements). | Nonce based CSP via proxy once pages are dynamic anyway; Trusted Types. |
| | Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. | Keep. |
| | Vulnerable dependency | 0 known vulnerabilities in production dependencies (`npm audit --omit dev`), CycloneDX SBOM in `docs/sbom.cdx.json`, CI audit gate. No runtime dependency was added for this release. | Pin and review upgrades; provenance attestations. |
| | Container escape or tampering | Optional Dockerfile runs as the unprivileged `node` user with a read only root and tmpfs mounts. **Not built or run during this release** (D11). | Build in CI, pin the base image by digest, scan the image. |

## Human machine teaming specific threats
- **Automation bias:** an officer may uphold whatever the machine says. Mitigations in place: a required note, the overturn path, and every decision in the audit log. Not yet in place: tracking overturn rates per device and per officer, and blind re-inspection samples (described in docs/research-programme.md).
- **Missed violations:** officer confirmation only checks findings a machine reported; it cannot recover a violation the machine missed. The cell experiment shows the robot cell missing more violations than officers under its assumptions. Mitigation: random audits on every lane, and the pilot's measured detection rates before any reliance.

## Learning loop specific threats
- **Poisoning:** repeated false outcomes could shift weights. Mitigations in place: suggestions only, a named officer approves, a multiplier is capped (0, 5], the approval is an auditable event, and a serious machine finding reaches the learning loop only after an officer confirms it. Not yet in place: outlier detection on outcome streams and a cool down between changes.
- **Gaming:** a trader learns which signals lower risk. Mitigation: random audits (hash selected, so not predictable from outside) apply to every lane. Not covered: coordinated behaviour across traders.

## Residual risks, stated plainly
1. Demo signing keys are public. Do not read a green tick or a VALID proof as identity.
2. The public demo runs with authentication off. With keys on, the check is bearer keys only, with no mutual TLS and no rotation tooling.
3. Inline script allowance in the CSP.
4. Checkpoints protect against a rewrite only if parties outside the operator keep them.
5. Receipt status is not covered by hashes, signatures or proofs.
6. Rate limits are per instance and can be sidestepped by changing the forwarded address.
7. No penetration test has been run. Everything above is design analysis plus automated checks.
