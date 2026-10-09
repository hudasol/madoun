# Data governance (draft for discussion)

Madoun is a demo on synthetic data. This page sets out how a real deployment should handle data, so the design questions are visible early. It is not legal advice; every point needs confirmation with Abu Dhabi Customs, the participating authorities and their legal and data teams.

## Principle: carry receipts, not documents
The custodian authority keeps the document. Madoun stores a receipt: who verified what, for which goods, until when, and who may rely on it. This keeps the sensitive material where it already is and shrinks what Madoun must protect.

## Data classes
| Class | Examples | Where it lives | Retention (proposal) |
|---|---|---|---|
| Declaration data | parties, goods, values, ETA | read from the customs platform, minimal copy | as long as the shipment is open plus the audit period set by customs |
| Evidence receipts | issuer, scope, validity, hash | Madoun ledger | audit period; revoked receipts stay, marked revoked |
| Evidence documents | certificates, lab results, permits | custodian authority only | custodian's own rules |
| Risk assessments | signals and reasons | Madoun | audit period |
| Officer actions | overrides, resolutions, approvals | Madoun audit trail, append-only | audit period |
| Inspection media | images, sensor data | custodian or inspection operator | short, with an officer-approved extension |

## Sharing
Each receipt carries a sharing policy (`sharedWith`: a list of authorities or all). The ledger shows each role only the receipts that its sharing policy allows (see "Viewing as" in the demo). Auditors see all for post-clearance audit (WTO TFA Art. 7.5). Sharing agreements between authorities are a legal instrument, not a software setting; the software should record which agreement a policy rests on.

## Location and law
- Hosting should be on UAE-resident, government-approved infrastructure. Cross-border transfer should not be needed.
- The UAE Personal Data Protection Law (Federal Decree-Law 45 of 2021) states that it does not apply to government data and public entities, but traders and forwarders are private parties and some of their data may be personal. Which regime applies to which data is a question for the data owners. Public summaries say cross-border transfers need an adequacy basis or a contract or consent route.
- Names of Abu Dhabi data and AI policies that apply should be taken from the policy owners, not from this repository.

## Risk model governance
- Only objective criteria permitted by WTO TFA Art. 7.4 are used. There is no country blacklist.
- Every lane has written reasons. An officer can override with a reason, and the reason is kept.
- The learning loop only suggests; a named person approves; the change is logged as an event.
- Overrides and outcomes are the basis for reviewing whether the model is fair across traders and forwarders. That review is not built yet.

## Security (see also docs/integration.md)
Authentication, mutual TLS, server-side role enforcement, signing of receipts and tamper-evident storage are described but not implemented in the mock API. The "Viewing as" selector is a demonstration, not access control.

## Open questions
1. Which customs fields are the minimum Madoun needs from a filing?
2. Which authorities will sign a sharing agreement first, and for which document types?
3. How long must audit records be kept, and who may export them?
4. Who is the data controller for the ledger?
