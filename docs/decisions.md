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
