# Contributing

Madoun is a shipment evidence file and risk lane layer for customs clearance. The engine in `src/engine` is pure TypeScript and event sourced, and most changes belong there first, with the interface following.

## Set up

```bash
npm ci
npm run check      # lint, typecheck and the full test suite
npm run dev        # http://localhost:3000
```

Node 22 or later is required.

## Rules that keep the project honest

- **Synthetic data only.** Nothing in this repository may contain real declarations, real traders or real officers. Datasets that come from outside are downloaded by a script and never committed.
- **Label what a number is.** A figure in a document or the interface is either measured here, taken from a named source, or assumed. Say which.
- **Do not move the fingerprint by accident.** `tests/fingerprint.test.ts` pins the release results and headline numbers of the default seed. If a change alters them on purpose, update the values and record the reason in `docs/decisions.md`.
- **Keep the engine pure.** No clock, network, file or randomness without a seed inside `src/engine`. Time and randomness are passed in.
- **Every serious machine finding needs an officer.** Do not add a path that records an outcome from a robot, drone or scanner without confirmation. The property test in `tests/properties.test.ts` exists to catch this.

## Commits and branches

- One logical change per commit, with a message that says what changed and why.
- Commit after each finished step and push regularly.
- Do not rewrite published history. Fix a mistake with a new commit.
- Small changes go straight to `main`. Open a pull request for anything risky or large, such as deleting data or changing a public contract.

## Before you push

```bash
npm run check
npm run build
```

For changes to pages, also run `npm start` in one terminal and `npm run a11y` and `npm run security` in another. The offline check (`npm run offline`) needs a local Chromium or Edge.

## Writing style

Documents are plain and formal. Use full sentences, no emojis, no em dashes, and avoid hyphens between words unless a term needs one.
