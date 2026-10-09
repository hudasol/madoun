# Review 2: defence and security-systems AI engineer (Edge lens)

Reviewer stance: an engineer who ships software that must keep working under load, adversaries and audit, and who distrusts any "tamper-proof" or "scales fine" claim that has not been attacked. Cares about integrity, provenance, input handling, performance under realistic volume, supply chain, and a written threat model.

## Critique of v1.1.0
1. **The hash chain proves "unchanged since written", not "written by whom".** Anyone can recompute a chain. The README sold receipts as provenance; nothing bound a receipt to the authority that vouched for it.
2. **The engine did not scale.** Replay and simulation copied the whole log, ledger and shipment map for every event and scanned the ledger and shipment list for every lookup. Measured at 3,000 shipments: about 45 seconds to replay. A national port flow is far above the demo's 240 shipments, so the headline "runs in the browser" would fail first at exactly the volume that matters.
3. **Replay silently accepts nonsense.** An event pointing at a missing shipment or receipt is logged and ignored. Fine for reading history, wrong for accepting new input: a mistyped id looks like it worked.
4. **The API validates fields but not size.** The body limit counted characters, not bytes (Arabic text slips past), and array lengths were unbounded, so one request could ask the engine for unbounded work.
5. **No security headers, no CSP.** The app is same-origin only, but nothing enforced that, and nothing proved no request leaves the page.
6. **A hand-written SHA-256 in a security-relevant path.** It was correct (checked against test vectors) but unaudited code is a liability when a maintained, audited library exists.
7. **Tests are examples, not properties.** Tamper detection was tested on one hand-picked edit.
8. **No threat model, no SBOM, no CI.** A reviewer cannot see what was considered, what the dependencies are, or that tests run on every change.
9. **Learning loop is a poisoning surface.** Approved weights change who is inspected; the bounds on a multiplier were implicit.

## Checklist
- [x] 1. Ed25519 receipt attestations signed by the verifying authority, verified with public keys only; wrong-signer, forged, missing, unknown-key and malformed inputs fail closed. Kept beside the ledger so the world state stays deterministic. Demo keys are labelled DEMO ONLY everywhere. UI "Check signatures" (979 receipts in about 3 s), API `signatures` field. (`src/engine/sign.ts`, `tests/sign.test.ts`)
- [x] 2. Removed the quadratic replay: in-place `WorldBuilder`, ledger index, known-origins index. 3,000 shipments replay: about 45 s to 0.42 s; 10,000 shipments simulate in about 6 s. Behaviour unchanged, proved by identical hashes of events, results, world, exceptions and KPIs before and after. (`scripts/bench.ts`, `scripts/worldhash.ts`)
- [x] 3. Differential test: the fast replay equals a fold of the pure reducer on the full history and on prefixes, and never mutates its input. (`tests/scale.test.ts`)
- [x] 4. `validateEvent`: referential and range checks before any event is accepted from outside; wired into every UI action (batches validated in order). Every simulator event passes it. (`src/engine/validate.ts`, tests)
- [x] 5. API limits: byte-accurate body cap checked on `Content-Length` and on received bytes; at most 20 consignments, 200 items, 100 containers; reflected in OpenAPI. Tests incl. multi-byte payload.
- [x] 6. Security headers: CSP (`default-src 'self'`, no third-party origins, no framing, no plugins), nosniff, frame deny, no referrer, permissions policy, COOP/CORP; `X-Powered-By` removed. `scripts/security-check.mjs` verifies headers on 9 pages and 3 API routes, that no request leaves the origin, and that no console or CSP error appears.
- [x] 7. SHA-256 now from `@noble/hashes`; output identical (hashes and Arabic-twin tests unchanged).
- [x] 8. Property tests (fast-check): any appended ledger verifies; any edit to a hashed field is detected at that receipt; drop, swap and duplicate are detected; a flipped signature byte is detected; the request validator never throws on arbitrary JSON or hostile keys.
- [x] 9. `docs/threat-model.md` (STRIDE, trust boundaries, learning-loop abuse, residual risks); CycloneDX SBOM (`docs/sbom.cdx.json`); `npm audit` shows 0 production vulnerabilities; CI workflow (typecheck, tests, audit gate, build). Weight multipliers bounded to (0, 5] by validation.
- [ ] 10. Not done, on purpose: real key custody (HSM/KMS), external anchoring of the ledger head, nonce-based CSP, rate limiting, a penetration test. Each is listed in the threat model as a production requirement.

## Result
110 tests (86 before), 0 axe violations, 0 production vulnerabilities, behaviour hashes unchanged by the performance work.

## Honest limits after this round
- The signatures use public demo keys. They prove the mechanism, not identity.
- The CSP still permits inline scripts because Next inlines bootstrap data.
- The benchmark is on synthetic data on one machine; treat the numbers as orders of magnitude.
- This is design analysis plus automated checks, not an assurance claim.
