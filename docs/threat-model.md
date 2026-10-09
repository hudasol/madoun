# Threat model (STRIDE)

Scope: the Madoun prototype as built here (browser app, mock REST API, pure TypeScript engine). All data is synthetic and the API is a mock; this document says what the design defends against **today**, what it only demonstrates, and what a production deployment must add. Nothing here claims the prototype is secure enough to hold real declarations.

## Assets
| Asset | Why it matters |
|---|---|
| Evidence ledger (receipts, hash chain, signatures) | Authorities rely on it instead of re-checking; a forged or altered receipt releases cargo wrongly. |
| Risk lane and its explanation | Decides who is inspected; must be explainable and not silently manipulable. |
| Shipment file and audit trail | Basis for post-clearance audit and disputes. |
| Trader and declaration data | Commercially sensitive; in production, regulated. |
| Learned risk weights | A poisoned weight changes who gets inspected. |

## Trust boundaries
1. Browser to API (untrusted input, JSON bodies).
2. Adapter (ATLP/MAMAR side) to Madoun (in production: authenticated service identity).
3. Authority to ledger (each authority is trusted only for receipts it verified itself).
4. Robot or scanner to inspection contract (device identity, media integrity).

## STRIDE

| | Threat | Today | Production requirement |
|---|---|---|---|
| **S**poofing | Someone claims a receipt was verified by an authority | Receipts are Ed25519-signed over the chain hash; a signature from the wrong authority is rejected (`wrong-signer`). **Demo keys are public**, so this proves the mechanism only. | Per-authority keys in an HSM/KMS, rotation, a published key registry, revocation. |
| | Anyone calls the API | `authorize()` seam exists and always allows. | OAuth2/mTLS service identities, per-authority scopes, enforced on the server. |
| | Role lens used as access control | Documented as demo only; the UI says so. | Server-side authorisation on every route. |
| **T**ampering | Edit a stored receipt, or drop/reorder/duplicate one | Hash chain detects every one of these (property-tested). Signatures detect edits without the key. | Anchor the head hash externally (e.g. periodic notarisation) so a whole-ledger rewrite is also detectable. |
| | Malformed or oversized request | Strict schema validation, unknown fields rejected, string/array caps, 256 KiB body limit checked on declared and actual bytes. Fuzzed with arbitrary JSON (never throws). | Rate limits and WAF in front. |
| | Spreadsheet formula injection through exports | CSV cells starting with `= + - @` are neutralised (tested). | Keep. |
| | Event with a bad reference silently "succeeds" | `validateEvent` rejects it before it reaches the log (replay stays total by design). | Same check at every ingestion path. |
| **R**epudiation | An officer denies an override or resolution | Every action is an event with actor, time and reason in an append-only log. Actors are labels in the demo. | Authenticated identities; signed events. |
| **I**nformation disclosure | A regulator sees receipts not shared with it | Sharing policy filters the ledger in the UI. | Enforce on the server, not the client. |
| | Browser leaks data to third parties | CSP `default-src 'self'`, `connect-src 'self'`, no external origins; a script verifies no request leaves the origin. `Referrer-Policy: no-referrer`. | Keep; add data-residency controls (see governance.md). |
| | Server banner / framework fingerprint | `X-Powered-By` removed. | Keep. |
| **D**enial of service | Huge declaration or request flood | Body and array caps; engine scales linearly (10,000 shipments simulate in ~6 s, replay of 185k events in ~0.7 s). | Rate limiting, queueing, autoscaling. |
| | Quadratic replay as the ledger grows | Found in review and fixed (indexes, in-place builder); a differential test keeps the fast path equal to the pure reducer. | Keep the benchmark in CI. |
| **E**levation of privilege | XSS leading to action as an officer | React escaping; CSP blocks third-party script and framing, forbids `object-src` and `base-uri` tricks. CSP still allows inline script (Next bootstrap), a known gap. | Nonce-based CSP via proxy (forces dynamic rendering); Trusted Types. |
| | Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. | Keep. |
| | Vulnerable dependency | 0 known vulnerabilities in production deps (`npm audit`), CycloneDX SBOM in `docs/sbom.cdx.json`, CI audit gate. | Pin and review upgrades; provenance attestations. |

## Learning loop specific threats
- **Poisoning:** repeated false outcomes could shift weights. Mitigations in place: suggestions only, a named officer approves, a multiplier is capped (0, 5], and the approval is an auditable event. Not yet in place: outlier detection on outcome streams and a cool-down between changes.
- **Gaming:** a trader learns which signals lower risk. Mitigation: random audits (hash-selected, so not predictable from outside) apply to every lane. Not covered: coordinated behaviour across traders.

## Residual risks, stated plainly
1. Demo signing keys are public. Do not read the green tick as identity.
2. No authentication on the mock API.
3. Inline-script allowance in the CSP.
4. The hash chain is only as strong as where its head hash is stored; there is no external anchor.
5. No penetration test has been run. Everything above is design analysis plus automated checks.
