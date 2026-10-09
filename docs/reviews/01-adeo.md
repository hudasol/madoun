# Review 1: government-office AI engineer (ADEO lens)

Reviewer stance: an engineer in a government executive office who has to decide whether this could be adopted, integrated and defended in front of leadership and other entities. Cares about delivery, integration, governance, Arabic-first use, accessibility, and numbers that survive questions.

## Critique of v0.9.1
1. **No integration story.** The README says Madoun layers on ATLP/MAMAR, but nothing shows how data gets in or out. A claim without a contract.
2. **Everyone sees and can do everything.** The engine knows about sharing policies, but the UI shows one undifferentiated view. A multi-authority product has to show who may see and do what.
3. **No audit export.** Post-clearance audit is a named feature of the trade agreement the product cites, yet a shipment file cannot be exported or printed.
4. **No value case.** The simulator shows hours, not what they mean. Leadership asks what it is worth and what it excludes.
5. **No governance.** Data classes, custody, retention, location and legal basis are absent.
6. **Arabic is half done.** Interface text is Arabic, but goods, forwarders, actors, notes and issuers stay English. For an Arabic-first audience that reads as unfinished.
7. **A headline number that invites doubt.** "99% reuse across authorities" is an artefact of how the sample data was built.
8. **Accessibility unverified.** Government services are expected to be accessible; no check was ever run.
9. **No adoption plan.** Who uses it on day one, and what changes for them? (Addressed in the ATRC round.)

## Checklist
- [x] 1. Versioned REST API with an adapter endpoint that assesses a declaration without persisting it; OpenAPI 3.1; JSON Schemas; integration guide with sequence diagram; 9 API tests. (`/api/v1/*`, `public/openapi.yaml`, `docs/integration.md`)
- [x] 2. "Viewing as" role lens: customs, each regulator, auditor, trader or agent. Gates override, resolve, inspect and approve; filters the ledger by sharing policy; explains why an action is unavailable. Documented as a demo, not access control. (`src/lib/roles.ts`, tests)
- [x] 3. Clearance record export: JSON (versioned schema), audit-trail CSV with formula-injection protection, print stylesheet; evidence ledger CSV.
- [x] 4. "What it could be worth" panel with editable placeholder inputs, a stated formula, a half-share low case, and a list of what is not included.
- [x] 5. `docs/governance.md`: data classes, custody, sharing, location and law, risk governance, open questions.
- [x] 6. Arabic twins for goods, forwarders, carriers, vessels, inspection notes, actors and issuers; actor-name resolver; 17 tests incl. determinism hashes.
- [x] 7. Reuse metric rebuilt as "carried over from earlier shipments" vs "relied on within the same file".
- [x] 8. axe-core scan of 9 pages x EN/AR x dark/light: 214 violating nodes found, all fixed (contrast, logo accessible name); now 0. `npm run a11y`.
- [ ] 9. Adoption plan: deferred to Review 4.

## Honest limits after this round
- The API is a mock: no authentication, no persistence, no real ATLP/MAMAR connection.
- Roles are a demonstration in the browser.
- The value panel's defaults are placeholders; real figures must come from customs and port operators.
- Automated accessibility checks cover only part of WCAG; a manual keyboard and screen-reader pass is still needed.
