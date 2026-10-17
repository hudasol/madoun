# Threat model (STRIDE)

Scope: the Madoun prototype as built here (browser app, mock REST API including the inspection gateway routes, pure TypeScript engine, reference robot gateway). All data is synthetic and the API is a mock; this document says what the design defends against **today**, what it only demonstrates, and what a production deployment must add. Nothing here claims the prototype is secure enough to hold real declarations. Last updated for v1.5.0.

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
| | Anyone calls the API, including the gateway result route | `authorize()` seam exists and always allows. **Anyone can post an inspection result today.** | Mutual TLS or signed requests per device and per adapter, scoped to the routes each may call. |
| | A fake robot reports a serious finding | Cannot become verified evidence or a learning outcome without a customs officer upholding it (`requiresOfficerConfirmation`, property tested). It can still create a pending receipt and waste officer time. | Device identity as above; per device rate limits; alerting on overturn rates. |
| | Ledger operator presents a forged checkpoint | Checkpoints are Ed25519 signed; the offline verifier uses a key supplied by the verifier, not by the proof. Default key is the public demo key; a file based development key is optional. | Operator key in an HSM or KMS; the public key distributed out of band. |
| | Role lens used as access control | Documented as demo only; the UI says so. | Server side authorisation on every route. |
| **T**ampering | Edit a stored receipt, or drop, reorder or duplicate one | Hash chain detects every one of these (property tested). Signatures detect edits without the key. | Keep. |
| | Rewrite the whole ledger | RFC 6962 Merkle checkpoints with inclusion and consistency proofs (`/api/v1/ledger/checkpoint?from=N`, `scripts/verify-proof.mjs`); a rewrite is not consistent with any checkpoint kept earlier (tested). **Only effective if someone outside the operator keeps checkpoints.** | Independent witnesses or periodic publication of checkpoints to parties outside the operator. |
| | Change a receipt's status (for example revoked to verified) | **Not covered by hashes or proofs**: status is not part of the receipt hash (stated in code, API description and a test). Status changes are events in the audit log. | Sign status change events, or add a signed status log with its own checkpoints. |
| | Tampered inspection media | Results carry a SHA-256 digest and size per media file; the gateway computes them at capture. Madoun does not hold or check the media itself. | Media stored by the custodian and checked against the digest on retrieval; digests signed by the device key. |
| | Malformed or oversized request | Strict schema validation, unknown fields rejected at every level, string and array caps, byte caps checked on declared and actual bytes (256 KiB assessments, 64 KiB inspection results). Fuzzed with arbitrary JSON (never throws). | Keep; WAF in front. |
| | Spreadsheet formula injection through exports | CSV cells starting with `= + - @` are neutralised (tested). | Keep. |
| | Event with a bad reference silently "succeeds" | `validateEvent` rejects it before it reaches the log, at every ingestion path (UI actions, gateway route). | Same check at every new ingestion path. |
| **R**epudiation | An officer denies an override, a resolution or a confirmation | Every action is an event with actor, time and reason or note in an append only log; a confirmation without an officer id and a note is rejected. Actors are labels in the demo. | Authenticated identities; signed events. |
| **I**nformation disclosure | A regulator sees receipts not shared with it | Sharing policy filters the ledger in the UI. The API returns all receipts to everyone (mock). | Enforce on the server, not the client. |
| | Browser or server leaks data to third parties | CSP `default-src 'self'`, `connect-src 'self'`, no external origins; `scripts/security-check.mjs` checks the browser; `scripts/offline-check.mjs` preloads an egress guard into the server and proves zero outbound attempts while every page and API route is used. | Keep; add data residency controls (see governance.md). |
| | Server banner or framework fingerprint | `X-Powered-By` removed. | Keep. |
| **D**enial of service | Request flood | In-memory token bucket per instance and client (reads 600 burst, 100 per second; writes 120 burst, 20 per second), 429 with `Retry-After` (tested). **Per instance only and keyed on a forgeable forwarded address.** | Rate limits at the gateway keyed on authenticated identity; queueing; autoscaling. |
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
2. No authentication on the mock API, including the gateway result route.
3. Inline script allowance in the CSP.
4. Checkpoints protect against a rewrite only if parties outside the operator keep them.
5. Receipt status is not covered by hashes, signatures or proofs.
6. Rate limits are per instance and can be sidestepped by changing the forwarded address.
7. No penetration test has been run. Everything above is design analysis plus automated checks.
