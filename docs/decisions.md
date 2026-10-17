# Decision log

Short records of decisions taken while building the Edge proposal package (v1.5.0). Each entry states the decision, the reason and what it affects. The most conservative reading was chosen whenever a requirement was ambiguous.

## D1. Raise the test timeout, keep every assertion
**Decision.** Set `testTimeout` and `hookTimeout` to 120 seconds in `vitest.config.ts`.
**Reason.** At the starting commit (0c3e0a5) six tests timed out at the 5 second default on the development machine (Windows, 16 parallel workers), although none failed an assertion. They build the full synthetic world or sign the whole ledger. A timeout is a harness setting, not a check, so raising it weakens nothing; no assertion was changed.
