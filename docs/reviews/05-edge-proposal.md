# Review 5: Edge proposal package (autonomous systems and secure software lens)

> Self review written by the author from an assumed professional viewpoint, followed by an independent adversarial review. The independent reviewer was given only the repository and its hard constraints, not the reasoning behind the build. Edge Group did not write, commission or endorse either review.

Reviewer stance: an engineer who ships autonomy that people must be able to trust. Asks who has the last word when a machine reports something serious, whether evidence can be quietly altered, whether the system runs with no outside services, and whether claims rest on experiments that could have failed.

## Critique of v1.4.0
1. **Machine findings flowed straight into evidence and learning.** A robot, drone or scanner result became a verified receipt and a learning outcome with no person in between. The research programme listed "which findings an officer must always confirm" as an open question.
2. **The robot seam was an interface in prose.** No route a gateway could call, no message definitions, no reference client.
3. **Robot benefits were asserted, not modelled.** Nothing compared a robot cell with officers or a scanner, and nothing said what happens when robots fail.
4. **Tamper evidence stopped at a hash chain.** There was no compact proof that one receipt is in the ledger, no signed checkpoint, and no way to show that a later ledger extends an earlier one.
5. **Hardening gaps listed in review 2 were still open:** no rate limiting, no key custody option beyond demo keys, no measured case for or against a nonce based CSP, no proof that the build runs without outbound connections.

## Checklist
- [x] 1. Officer confirmation: `requiresOfficerConfirmation`, the `InspectionConfirmed` event in both reducers, validation rules, pending receipts until upheld, outcomes only after confirmation, banner and uphold or overturn form for the customs role, a property test, and a simulator change that leaves the `results` and `kpis` fingerprints unchanged (D2, D3).
- [x] 2. Gateway contract: mock task and result routes with strict validation and byte caps, a dependency free reference gateway, ROS 2 message definitions, OpenAPI and JSON Schemas with a structural contract test, a mapping table and a rosbridge example (D5, D6).
- [x] 3. Preregistered digital twin: predictions committed before the model, 30 seeds, four scenarios, intervals, every prediction marked; a comparison table on the Inspection page (`docs/preregistration-cell.md`, `docs/cell-experiment.md`).
- [x] 4. RFC 6962 Merkle checkpoints, inclusion and consistency proofs, proof and checkpoint routes, a standalone offline verifier, known answer tests, a "Copy inclusion proof" action (D7).
- [x] 5. Per instance rate limiter, optional development keystore and a custody design, static CSP kept with measurements, an offline egress check, an optional container, threat model updated, SBOM checked (D8 to D12).
- [x] 6. Two page proposal, architecture and evidence flow diagram, README opening, six minute demo script, with a test that ties every quoted number to its source.
- [x] 7. Independent adversarial review; every high and medium finding fixed; lower findings fixed or logged with a reason (D13).
- [ ] 8. Not done, on purpose: authentication on the API, real key custody, a real robot, external checkpoint witnesses, a penetration test, a container build (the Docker daemon was not running, D11).

## What the independent review found, and what changed
The reviewer reported 35 findings. The most serious, reproduced against the engine, showed that the first version of the confirmation rule could be bypassed in four ways:
- a verified receipt issued before the result;
- a verified receipt under another id or subject;
- a second result that inherited the first result's confirmation;
- an outcome recorded before the result.

The gateway route also accepted `performerKind: officer`, which needs no confirmation. The headline claim was therefore false until these were fixed (commits 31c2153 and 649e46c). The property test now generates all of these event orders, and while it was being widened it found a fifth (the early outcome). Other fixes:
- **Proofs.** Proofs now state which fields they cover; the summary text and the status are not covered. The browser fetches proofs from the server ledger, which now includes gateway receipts. The verifiers check the checkpoint origin, and an empty tree is consistent only under the empty root.
- **Cell experiment.** The model now uses the separate random streams the preregistration promised (amendment A1), and P6, which cannot fail by construction, is reported as a structural check rather than a prediction (amendment A2). The pattern of results did not change: P5 is still the only miss.
- **Offline check.** It now runs a real assessment, requires every route to succeed, and claims only what its guard can observe.
- **Framing.** The README and every review say these are self reviews. Older documents were brought up to date.

## Result
- **Tests.** 218 passing, up from 139 at v1.4.0; the start of this release also needed a timeout change on this machine (D1).
- **Checks.** Typecheck clean. The accessibility scan finds 0 violations on 11 pages in four language and theme variants, plus the confirmation banner, the form and the proof action. The security check passes on 10 pages and 6 API routes. The offline check observes no outbound attempt.
- **Fingerprints.** `results 500aad9e9dad8311` and `kpis 232a6abfa98ad394` are unchanged.
- **Cell experiment.** 12 of 13 preregistered predictions hit, P5 missed, and the structural check held.
- **Benchmark.** Medians of three interleaved runs at 10,000 shipments, against v1.4.0 on the same machine: simulate about 12.1 s before and 10.0 s after, replay about 1.23 s and 1.21 s. No regression beyond the 20 percent limit; the machine is noisy, so treat these as orders of magnitude.

## Honest limits after this round
- Everything is still synthetic, the API is unauthenticated, keys are public demo keys, and the robot and the cell are simulations with assumed parameters.
- The confirmation rule was wrong in its first version and an outside reader found it; other gaps of that kind may remain. The property test covers the event orders we know about, not every possible one.
- A Merkle proof covers the hashed fields of a receipt, not its status or summary, and checkpoints protect against a rewrite only if someone outside the operator keeps them.
- The experiment's author also wrote the model and the predictions, and the git history is the only evidence of when the predictions were written.
