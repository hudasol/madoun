# Decision log

Short records of decisions taken while building the Edge proposal package (v1.5.0). Each entry states the decision, the reason and what it affects. The most conservative reading was chosen whenever a requirement was ambiguous.

## D1. Raise the test timeout, keep every assertion
**Decision.** Set `testTimeout` and `hookTimeout` to 120 seconds in `vitest.config.ts`.
**Reason.** At the starting commit (0c3e0a5) six tests timed out at the 5 second default on the development machine (Windows, 16 parallel workers), although none failed an assertion. They build the full synthetic world or sign the whole ledger. A timeout is a harness setting, not a check, so raising it weakens nothing; no assertion was changed.

## D2. Officer confirmation of serious machine findings
**Decision.** A result from a robot, drone or scanner that contains a finding of severity `major`, or reports a broken seal, needs a customs officer's decision (`InspectionConfirmed`, upheld or overturned, with a required note) before it counts. Until then its receipt is `pending`, no outcome may be recorded for the learning loop, and a receipt for it may not be issued as `verified`. Upheld makes the receipt `verified`; overturned revokes it with the officer's note as the reason and records the outcome as a false alarm. Results reported by an officer need no second confirmation.
**Reason.** This closes the open question in the research programme ("which findings an officer must always confirm") with the most conservative rule that still lets routine, clean results flow. Minor and informational findings are not gated because they do not change a lane, a release or a learned weight on their own.
**Details.** The first confirmation stands; `validateEvent` rejects a second one, one that predates the result, and one for a file with no unconfirmed machine finding. Receipt status is not part of the receipt hash, so confirmation never breaks the hash chain.

## D3. How the simulator models confirmation, and which fingerprints changed
**Decision.** In the simulator the duty officer (`adc:duty`) confirms every serious machine finding one hour after the result (`CONFIRMATION_DELAY_HOURS`). The red lane release review starts eight hours after the task (`LANE_EXTRA_HOURS.red`) and the result arrives after two, so the confirmation always falls inside the existing release window. The officer is assumed to establish the truth on site: a real violation is upheld, anything else is overturned. No random draw is added.
**Reason.** The requirement is that release times, and therefore the `results` and `kpis` fingerprints, do not change. A test checks that every confirmation lands before the release review starts and before the outcome is recorded.
**Effect.** `results 500aad9e9dad8311` and `kpis 232a6abfa98ad394` are unchanged, and so is `exceptions 4f53cda18c2baa0c`. The `events` fingerprint changes (58f9ff46c2197616 to 53c127114a83cab5) because confirmation events are new, and the `world` fingerprint changes (cbf02e42c3389948 to 93bb4a8c2483573a) because files now carry the confirmation and its audit line. The one hour delay and the perfect officer are assumptions, not measurements; the cell experiment (W3) varies the delay.

## D4. Scan scripts find a browser on Windows
**Decision.** `scripts/a11y.mjs` and `scripts/security-check.mjs` now share `scripts/browser.mjs`, which tries `PW_CHROMIUM`, the Linux CI image paths, the Playwright cache and finally the Microsoft Edge that ships with Windows.
**Reason.** The scripts only looked under `/opt/pw-browsers` and failed on Windows before scanning anything. Nothing is downloaded and no new dependency is added.

## D5. Robot gateway routes: what they store and what they never do
**Decision.** `GET /api/v1/inspection-tasks` lists as open the red lane shipments still in flight without a result, the same set the Inspection page shows as waiting. `POST /api/v1/inspection-tasks/{id}/result` stores the task, the result and the receipt in an in-memory list layered over the synthetic snapshot, and never records a learning outcome.
**Reason.** The conservative reading of "non persistent, in memory" is one process, lost on restart, invisible to the other read routes, so the synthetic snapshot and its fingerprints stay untouched. Recording outcomes is a customs action that, for serious machine findings, must follow an officer's confirmation (D2), so the gateway has no path to the learning loop at all.

## D6. Contract checks without a YAML parser
**Decision.** `tests/contract.test.ts` checks the OpenAPI file structurally (every route file documented with exactly the methods it exports, every internal `$ref` resolves, version 3.1.0) and checks the inspection result JSON Schema against the server validator (fields, required fields and its own example).
**Reason.** A full OpenAPI validator would add a dependency for a test only. These checks catch the drift that actually happens (a new route not documented, a renamed schema) with no new package. This is stated as a structural check, not as full schema validation.

## D7. What a Merkle leaf is, and what a proof does not cover
**Decision.** Each leaf is the RFC 6962 leaf hash of the 32 bytes of a receipt's existing chain hash, in ledger order. The hash chain is unchanged. Checkpoints sign a line based message (`madoun/checkpoint/v1`, origin, tree size, root, time) with the existing `Signer` interface; consistency proofs are served through `GET /api/v1/ledger/checkpoint?from=N` rather than a separate route.
**Reason.** Reusing the chain hash means a proof also commits to the receipt's content through the same canonical form the chain already uses, and the offline verifier can recompute it in a few lines. The construction was checked against the text of RFC 6962 (section 2.1) and RFC 9162 (sections 2.1.3.2 and 2.1.4.2), and the roots match the published known answer vectors of the transparency-dev/merkle reference implementation.
**Limit, stated in the code, the API description and a test.** A receipt's status (verified, pending, revoked) is not part of its hash, so a proof shows that a receipt was recorded with this content, not whether it is still valid. Status changes are events in the audit log. Including status would change every existing receipt hash and the release fingerprints.

## D8. Keep the static CSP; do not move to a nonce based CSP for the demo
**Decision.** Keep the static `Content-Security-Policy` (`script-src 'self' 'unsafe-inline'`, no third party origins) rather than a per request nonce.
**Reason, with measurements.** The Next.js guide shipped in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` states that nonces require dynamic rendering, because a nonce must be unique per request and static pages are generated at build time. In the current production build 10 of the 11 pages are prerendered (`.next/prerender-manifest.json`: `/`, `/shipments`, `/exceptions`, `/evidence`, `/learning`, `/inspection`, `/simulator`, `/pilot`, `/method`, plus the not found page); only `/shipments/[id]` renders per request. Measured on the development machine with `next start`, 200 sequential requests each after warm up: prerendered `/` median 3.0 ms (90th percentile 3.9 ms), prerendered `/pilot` median 3.9 ms (5.3 ms), per request `/shipments/SHP-0005` median 9.1 ms (11.3 ms). Moving to nonces would put every page in the slower group (about two to three times the server time per page on this machine) and would stop a CDN from caching them. The benefit is removing `'unsafe-inline'` for scripts; the remaining exposure is limited because the app renders no user supplied HTML (React escapes text) and loads nothing from other origins.
**When to revisit.** Before any deployment that handles real declarations, where authenticated pages are dynamic anyway; then add a proxy that issues nonces with `'strict-dynamic'`, as in the guide, and Trusted Types.

## D9. Rate limiting is per instance and keyed on a forgeable address
**Decision.** An in-memory token bucket in `src/server/rate-limit.ts`, applied to every API route in `handle()`: reads burst 600 and refill 100 per second, writes burst 120 and refill 20 per second, per client key (client id plus the first `X-Forwarded-For` address), at most 10,000 clients tracked. Over the limit: 429 `rate_limited` with `Retry-After`.
**Reason.** It closes the cheapest abuse of the mock (a loop of POSTs that each run the engine) without a new dependency or service. The limits are generous enough that the scans and tests never hit them. It is documented as per instance in the code, the OpenAPI description and the threat model: it resets on restart, is not shared across instances, and a client can change its forwarded address. Production limits belong at the gateway, keyed on authenticated identity.

## D10. Development keystore only for the ledger checkpoint
**Decision.** `MADOUN_LEDGER_KEY_FILE` switches the checkpoint signer from the public demo key to a key read from a file (`src/server/keystore.ts`, created by `scripts/dev-keystore.mjs`). Receipt attestations stay on demo keys.
**Reason.** The checkpoint key is the one a verifier is asked to trust in the new offline proof, so it is the one worth taking off a public seed first. A file key is still not custody; `docs/key-custody.md` sets out the HSM or KMS design and says plainly that it is not implemented.

## D11. Dockerfile written but not built here
**Decision.** Add an optional `Dockerfile` (two stages, runs as the unprivileged `node` user, root owned read only files, writable only through tmpfs mounts, telemetry off) that no script requires.
**Reason and limit.** Docker is installed on the development machine but its daemon was not running, and starting it is outside this work, so the image was not built or run during this session. The no outbound request property was proved for the plain production build (`scripts/offline-check.mjs`), not for the container.

## D12. SBOM kept as generated on the deployment platform
**Decision.** `docs/sbom.cdx.json` is unchanged in this release. It was regenerated with `npm run sbom` on the development machine and compared: the only differences were platform specific optional binaries (`@img/sharp-win32-x64` and `@next/swc-win32-x64-msvc` instead of their Linux variants). A lockfile based SBOM (`--package-lock-only`) lists every platform's binaries (53 components) and so overstates what ships.
**Reason.** The site is built and served on Linux (CI and the hosting platform), so the Linux SBOM describes what actually runs. No runtime dependency was added or changed in this release (`package.json` changed only in its scripts), and `npm audit --omit dev` reports 0 vulnerabilities.
