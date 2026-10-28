# Madoun · مدوّن

A shared shipment evidence file and risk lane layer for customs clearance. Authorities check a document once and record who verified it, what it covers and when it expires; every other authority can reuse that receipt, review in parallel, and see one named owner for every delay.

Built for challenge 21, Smart Customs Accelerated Clearance (Abu Dhabi Customs), TDRA UAE Hackathon 2026.

Live demo: https://madoun.vercel.app/ (synthetic data, authentication off).

> **Status.** The software is complete and tested as a prototype. Everything it serves is synthetic, authority mappings are illustrative samples, and the signing keys in the demo are public. Nothing here has been run on real cargo. [docs/limitations.md](docs/limitations.md) lists what is missing, why it matters and what would close each gap. Read it before relying on any number below.

## What it does

| | |
|---|---|
| Shipment file | One auditable file per shipment that every participating authority sees. |
| Evidence receipts | A verified document becomes a receipt with its custodian, scope and expiry. Another authority can accept it instead of asking again. Documents stay with their custodian; Madoun holds the receipt. |
| Parallel review | Reviews that do not depend on each other run side by side. |
| Risk lanes | Green clears before arrival, amber gets targeted checks, red gets a physical inspection. Every lane shows its reasons, and an officer can override it with a recorded reason. |
| Owned exceptions | Every stuck step has one named owner and a clock, with escalation. |
| Learning loop | Inspection outcomes feed back as suggestions that a named officer approves. |
| Inspection tasks | Red lane cargo becomes a task that a person, robot, drone or scanner can perform. A serious machine finding stays pending until a customs officer upholds or overturns it. |
| Evidence ledger | Receipts are hash chained and signed, and checkpoints use an RFC 6962 Merkle tree, so a proof can be checked offline with `scripts/verify-proof.mjs`. |

It is not a replacement for ATLP or MAMAR, not a central database every agency must feed, and not an autonomous decision maker. Officers keep every legal decision.

## What the numbers say, and what they do not

- **Simulation.** On a seeded synthetic week of 240 shipments the modelled median release falls from 27.3 hours to 16.0 hours (41%) and the share cleared before arrival rises from 62.5% to 77.1%. Those figures assume slow customs steps. With customs at the published Abu Dhabi Customs average of 13.86 minutes and the filing lead time calibrated to the published 71% pre arrival share, the median falls 9% (13.6 hours to 12.4 hours). Both are model output on invented data, not a performance claim. The method and the full grid are in [docs/baselines.md](docs/baselines.md).
- **Risk scoring.** The explainable factor model was tested against simple baselines, a plain logistic regression and an unconstrained gradient boosted reference on a published customs dataset it did not generate (a synthetic copy of Korean declarations). Predictions were committed before any model was fitted: 8 of 10 hit, 2 missed, and the misses are reported. At a 10 percent inspection budget the explainable model finds fraud 46.6% of the time against 21.6% for random order (AUC 0.716), while the unconstrained reference reaches 75.8% (AUC 0.820). That gap is the price of using only criteria the WTO Trade Facilitation Agreement permits. See [docs/benchmark-korea.md](docs/benchmark-korea.md) and [docs/preregistration-benchmark.md](docs/preregistration-benchmark.md).
- **Inspection cell.** A preregistered digital twin of a supervised robotic cell reports 12 of 13 predictions hit ([docs/cell-experiment.md](docs/cell-experiment.md)).

## Run it

Requires Node 22.5 or later.

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # lint, type check and the test suite
npm run build && npm start
```

Other commands: `npm run test:coverage`, `npm run benchmark`, `npm run baselines`, `npm run cell`, `npm run bench`, `npm run offline` (after a build; needs a local Chromium or Edge), `npm run a11y` and `npm run security` (with the app running).

## The API

A REST API is served under `/api/v1`; the contract is `public/openapi.yaml` and a test keeps it in step with the routes. Endpoints cover shipments, receipts, ledger checkpoints and proofs, exceptions, KPIs, assessments, batch declaration import from CSV, inspection tasks and results, health and metrics.

Authentication is chosen with `MADOUN_AUTH`:

```bash
# Issue a key. It is printed once; the configuration entry holds only its hash.
node scripts/new-api-key.mjs --id adc-officers --role authority --authority adc

# Run with keys required (put the printed entry in a JSON array in keys.json).
MADOUN_AUTH=keys MADOUN_API_KEYS_FILE=keys.json MADOUN_STORE=sqlite:data/events.db npm start

curl -H "Authorization: Bearer $KEY" http://localhost:3000/api/v1/kpis
```

| Setting | Meaning |
|---|---|
| `MADOUN_AUTH` | `off` (default, the public demo) or `keys`. In `keys` mode a missing or invalid key configuration refuses every request with 503 instead of falling back to open access. |
| `MADOUN_API_KEYS`, `MADOUN_API_KEYS_FILE` | JSON array of key entries: id, SHA 256 hash, role, optional authority and scopes. |
| `MADOUN_STORE` | `memory` (default), `file:<path>` or `sqlite:<path>`. Where inspection results are kept. |
| `MADOUN_LOG` | `json` or `off`. One JSON line per request, with no bodies, queries or keys. On by default in production. |
| `MADOUN_LEDGER_KEY_FILE` | Development signing key, see below. |

Roles are authority, auditor, operator, gateway and ops, each with a fixed set of scopes. Receipts follow their sharing policy: an authority key sees only receipts it issued or that were shared with it. Every response carries `X-Request-Id`, and `GET /api/v1/metrics` serves Prometheus text per process. Details: [docs/integration.md](docs/integration.md), [docs/import.md](docs/import.md), [docs/threat-model.md](docs/threat-model.md).

## How it is built

- **Engine** (`src/engine`): pure TypeScript and event sourced. Every change is an event and state is derived, so results are deterministic and replayable. A behaviour fingerprint test pins the simulation output.
- **Application** (`src/app`): Next.js interface in English and Arabic (right to left).
- **Server** (`src/server`): validation, authentication, rate limiting, request log and metrics, the event store and the ledger checkpoint.
- **Data** (`src/data`): a seeded synthetic generator with planted edge cases such as an expired certificate, a scope mismatch, an authority conflict and an idle review.
- **Gateway** (`gateway`): a dependency free reference inspection gateway, with ROS 2 message definitions in [docs/robotics-extension.md](docs/robotics-extension.md).

Continuous integration runs lint, type check, tests with coverage floors, the production build, accessibility and security scans, and a dependency audit. [CONTRIBUTING.md](CONTRIBUTING.md) describes the workflow and [SECURITY.md](SECURITY.md) how to report a problem.

## Signing keys: demo by default

> **Warning.** Every signature in this repository is made with public demo keys unless you configure otherwise. Anyone can reproduce those keys, so a valid signature or a VALID proof shows that the mechanism works, not who signed.

```bash
node scripts/dev-keystore.mjs .keys/ledger.key
MADOUN_LEDGER_KEY_FILE=.keys/ledger.key npm start
```

A key in a file is not key custody. Production keys belong in a hardware security module or a key management service ([docs/key-custody.md](docs/key-custody.md)).

## Aligned with

WTO Trade Facilitation Agreement (pre arrival processing 7.1, release separate from final determination 7.3, risk management 7.4, post clearance audit 7.5, release time measurement 7.6, authorised operators 7.7, border agency cooperation Article 8); WCO Data Model vocabulary and the WCO Time Release Study approach; the UAE National AI Strategy 2031 and the Abu Dhabi logistics direction named in the challenge profile. Risk logic uses only objective criteria the TFA lists as permissible (tariff code, goods type, origin, shipping country, value, trader compliance history, transport mode) and does not profile individuals.

## Documentation

Start with [limitations](docs/limitations.md), the [plan](docs/plan.md), [architecture](docs/architecture.md) and [integration](docs/integration.md). Evidence and method: [baselines](docs/baselines.md), [benchmark](docs/benchmark-korea.md), [evaluation](docs/evaluation.md), [model card](docs/model-card.md), [cell experiment](docs/cell-experiment.md), [decision log](docs/decisions.md). Assurance: [threat model](docs/threat-model.md), [key custody](docs/key-custody.md), [AI impact assessment](docs/ai-impact-assessment.md), [governance](docs/governance.md), [pilot plan](docs/pilot-plan.md). Also the [Edge proposal](docs/edge-proposal.md) and its [architecture](docs/edge-architecture.md), the [robotics extension](docs/robotics-extension.md), [data model](docs/data-model.md), [declaration import](docs/import.md) and the [demo script](docs/demo-script.md).

The review rounds in [docs/reviews](docs/reviews) are self reviews written from an assumed professional viewpoint. No outside body wrote or endorsed them. Edge Group has not reviewed, endorsed or commissioned this work.

Milestones are listed in the [plan](docs/plan.md#8-milestones--tags) and the [changelog](CHANGELOG.md).

## Licence

MIT, see [LICENSE](LICENSE).
