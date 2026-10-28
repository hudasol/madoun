# Security policy

## Status

Madoun is a prototype that runs on synthetic data. It is not deployed against real customs systems and has not had an independent penetration test. Read the [threat model](docs/threat-model.md) for what is and is not defended, and [key custody](docs/key-custody.md) for how signing keys must be handled in any real deployment.

## Reporting a vulnerability

Please report privately. Use the "Report a vulnerability" button under the Security tab of this repository (GitHub private vulnerability reporting). Do not open a public issue for a security problem.

Include what you found, how to reproduce it, and the commit you tested. You can expect an acknowledgement within a few days. There is no bounty.

## Scope

In scope: the engine and its proofs (`src/engine`), the API routes (`src/app/api`), request validation and limits, the ledger and its Merkle proofs, and the build configuration.

Out of scope: the public demo signing keys (they are public on purpose), the synthetic data, denial of service by volume against a free hosting tier, and issues that need a modified build.

## Supported versions

Only the latest tag on `main` is maintained.
