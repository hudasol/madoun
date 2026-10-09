# Review 4: national research-and-strategy engineer (ATRC lens)

Reviewer stance: someone who funds and steers programmes, not features. Asks whether a prototype has a route to a real trial, what would make it stop, how ready each part really is, whether the robotics claim is a research programme or a slogan, and whether the responsible-AI work is a gate or a footnote.

## Critique of v1.3.0
1. **No path from prototype to trial.** Round 1 deferred the adoption plan. A strong demo with no pilot design is a demo.
2. **No success or stop criteria.** Nothing said what number would justify scaling and what would end the trial. Without stop criteria, enthusiasm decides.
3. **Readiness never stated.** Parts at very different maturity (a validated engine, a mock API, a robot contract) were presented as one product.
4. **Robotics was a seam, not a programme.** An interface contract is a start. There were no hypotheses, protocol, sample-size plan, safety case or stop rules, and the key open question (which findings an officer must always confirm) stayed open.
5. **Responsible-AI work was scattered.** The model card existed but there was no assessment that gates the pilot, names affected parties, or fixes human oversight.
6. **Measurement planning stopped at the simulator.** Trusting the safety of the green lane needs an audit sample of a computable size; nobody had computed it.
7. **Sovereignty and independence were implicit.** For a government customer, where data lives, who can inspect the code, and what stops it being locked in need to be explicit.
8. **No change management.** Who does what differently on day one, who is trained, and how feedback changes the rules.

## Checklist
- [x] 1. Pilot plan (docs and in the app at `/pilot`, English and Arabic): scope, four gates from baseline to a narrow real effect, each with a pass condition; every threshold labelled a proposal.
- [x] 2. Stop criteria: five written conditions, including a veto for any participating authority.
- [x] 3. Readiness by component on the Pilot page and in the plan, with what is missing for each (validated engine at level 4; ATLP/MAMAR adapters at level 1 to 2).
- [x] 4. Research programme for robotic inspection: hypotheses, readiness ladder R0 to R3, paired and blinded protocol, sample-size reasoning, safety-case outline, data and sovereignty rules, deliverables, stop criteria. The officer-confirmation rule is now a stated requirement. (`docs/research-programme.md`)
- [x] 5. AI impact assessment as a pilot gate: purpose, affected parties, decisions (none automatic), data, risks with controls, oversight, contestability, decision to proceed to shadow mode only. (`docs/ai-impact-assessment.md`)
- [x] 6. Audit sample-size calculator on the Pilot page (tested): about 380 audits for a 1% rate within one point, about 1,100 for 3%.
- [x] 7. Sovereignty stated: data stays in the UAE on government-chosen infrastructure; no third-party origins at runtime (checked by script); open-source dependencies with a published SBOM; adapters rather than replacement.
- [x] 8. Day-one view by role, training and feedback loop.
- [ ] 9. Not done, on purpose: real adapters to ATLP and MAMAR (needs specifications and a test environment), a working robot, validation on real data, cost figures beyond the editable placeholders. The pilot plan schedules the first of these as the long pole.

## What the programme view changes about the claim
The honest summary is now one line a sponsor can repeat: *a validated-on-synthetic-data prototype (level 3 to 4) with a mock API, a designed integration, a robotics contract and a ninety-day plan whose first thirty days change nothing.* The ask is access and a corridor, not a purchase.

## Honest limits after this round
- The plan and thresholds are proposals written without customs' input. They need to be argued with.
- The research programme has no partner, robot or budget yet.
- Nothing here has been reviewed by lawyers or security assessors; the assessment documents are drafts for that review.
