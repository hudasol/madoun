/**
 * Madoun domain model.
 * Vocabulary follows the WCO Data Model where practical (declaration, goods shipment,
 * consignment, border transport means) but is deliberately simplified.
 * All times are ISO-8601 strings; the engine never reads the system clock.
 */

export type ISODate = string;
export type Lane = 'green' | 'amber' | 'red';
export type TransportMode = 'sea' | 'air' | 'land';
export type AuthorityId = string;

export type GoodsCategory =
  | 'food'
  | 'electronics'
  | 'wireless'
  | 'pharma'
  | 'medical-device'
  | 'chemicals'
  | 'textiles'
  | 'machinery'
  | 'cosmetics'
  | 'general';

export interface Trader {
  id: string;
  name: string;
  nameAr: string;
  /** Authorised-operator-style status (TFA 7.7). */
  aeo: boolean;
  /** 0-100, higher is better. Based on past compliance outcomes. */
  complianceScore: number;
  /** Count of confirmed past findings in the last 24 months. */
  pastFindings: number;
}

export interface Forwarder {
  id: string;
  name: string;
}

export interface GoodsItem {
  id: string;
  hsCode: string; // digits only, 6 to 12
  description: string;
  category: GoodsCategory;
  origin: string; // ISO 3166-1 alpha-2
  value: number; // AED
  quantity: number;
  packages: number;
  /** Handling flags such as 'perishable', 'cold-chain', 'hazardous', 'high-risk-food'. */
  flags: string[];
}

export interface Consignment {
  id: string;
  transportDocRef: string; // bill of lading / air waybill / CMR
  containerIds: string[];
  items: GoodsItem[];
}

export interface Shipment {
  id: string;
  declarationRef: string;
  mode: TransportMode;
  carrier: string;
  conveyance: string; // vessel / flight / truck
  entryPoint: string; // e.g. Khalifa Port
  eta: ISODate;
  traderId: string;
  forwarderId: string;
  invoiceRef: string;
  incoterm: string;
  currency: 'AED';
  totalValue: number;
  /** Evidence types the trader or forwarder has already submitted for this shipment. */
  submitted: EvidenceType[];
  /** When the file was opened, i.e. when pre-arrival processing can start. */
  filedAt: ISODate;
  consignments: Consignment[];
}

export function allItems(s: Shipment): GoodsItem[] {
  return s.consignments.flatMap((c) => c.items);
}

/* ------------------------------------------------------------------ */
/* Authorities and requirements                                        */
/* ------------------------------------------------------------------ */

export type AuthorityRole = 'customs' | 'regulator' | 'terminal';

export interface Authority {
  id: AuthorityId;
  name: string;
  nameAr: string;
  role: AuthorityRole;
  /** Time the authority commits to act on a ready item. */
  slaHours: number;
  /** Typical time a ready item waits in the queue before a person starts. */
  queueWaitHours: number;
  /** Duty-officer identifier used as default owner for exceptions. */
  dutyOfficer: string;
}

export type EvidenceType =
  | 'commercial-invoice'
  | 'packing-list'
  | 'transport-document'
  | 'certificate-of-origin'
  | 'health-certificate'
  | 'lab-result'
  | 'conformity-certificate'
  | 'type-approval'
  | 'import-permit'
  | 'safety-data-sheet'
  | 'inspection-result'
  | 'release-order';

export interface Requirement {
  id: string;
  authorityId: AuthorityId;
  label: string;
  labelAr: string;
  /** Goods categories this requirement applies to; empty = all. */
  categories: GoodsCategory[];
  /** Only items carrying at least one of these flags (empty = no flag filter). */
  anyFlags: string[];
  evidenceTypes: EvidenceType[];
  /** Other requirement ids that must finish first. '*regulators' = all applicable regulator requirements. */
  dependsOn: string[];
  /** Nominal effort for a full review. */
  reviewHours: number;
  /** Effort to accept an existing, trusted receipt. */
  acceptHours: number;
  /** Requirement ids whose fresh verification in the same file this one relies on instead of repeating it. */
  relyOn?: string[];
  /** Does this requirement block release? */
  blocksRelease: boolean;
  /** Effort of re-verifying shared documents in today's sequential process. */
  duplicateCheckHours: number;
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export type EvidenceMethod =
  | 'document-check'
  | 'lab-test'
  | 'system-lookup'
  | 'officer-inspection'
  | 'robotic-inspection'
  | 'scanner-review';

export interface EvidenceScope {
  level: 'shipment' | 'trader' | 'trader-product';
  shipmentId?: string;
  traderId?: string;
  /** HS chapters (2 digits) covered; empty/undefined = all chapters. */
  hsChapters?: string[];
  /** 6-digit HS prefixes covered when level is trader-product. */
  hs6?: string[];
  origins?: string[];
}

export interface ReuseEntry {
  shipmentId: string;
  acceptedByAuthorityId: AuthorityId;
  at: ISODate;
  requirementId: string;
}

export interface EvidenceReceipt {
  id: string;
  type: EvidenceType;
  subjectRef: string; // document number or claim id
  summary: string;
  summaryAr: string;
  /** Authority or external body that issued the underlying document. */
  issuer: string;
  /** Authority that verified it and holds the document. */
  verifiedBy: AuthorityId;
  method: EvidenceMethod;
  scope: EvidenceScope;
  validFrom: ISODate;
  validUntil: ISODate;
  status: 'verified' | 'pending' | 'revoked';
  revokedReason?: string;
  /** Custodian's sharing policy: authorities that may rely on this receipt. 'all' = any participating authority. */
  sharedWith: AuthorityId[] | 'all';
  hash: string;
  prevHash: string;
  reuseLog: ReuseEntry[];
}

/* ------------------------------------------------------------------ */
/* Evaluation results                                                  */
/* ------------------------------------------------------------------ */

export type EvidenceVerdict =
  | 'satisfied-own'
  | 'satisfied-reuse'
  | 'missing'
  | 'expired'
  | 'expires-before-eta'
  | 'scope-partial'
  | 'not-shared'
  | 'revoked'
  | 'pending'
  /** Documents were submitted but no authority has verified them yet (normal state). */
  | 'awaiting-review';

export interface EvidenceCheck {
  requirementId: string;
  verdict: EvidenceVerdict;
  receiptId?: string;
  /** For reuse: which authority originally verified. */
  reusedFrom?: AuthorityId;
  /** Items not covered when scope is partial. */
  uncoveredItemIds?: string[];
  reason: string;
  reasonAr: string;
}

export interface RequirementInstance {
  requirementId: string;
  authorityId: AuthorityId;
  itemIds: string[];
}

export type ReviewMode = 'full-review' | 'accept-receipt' | 'no-action';

export interface PlannedReview {
  requirementId: string;
  authorityId: AuthorityId;
  dependsOn: string[];
  mode: ReviewMode;
  hours: number; // effort in Madoun mode
  layer: number;
  /** Earliest start, hours from file opening, under Madoun parallel scheduling. */
  startHour: number;
  endHour: number;
  onCriticalPath: boolean;
  blocksRelease: boolean;
  verdict: EvidenceVerdict;
  /** Set when this review accepts another authority's verification in the same file. */
  reliesOn?: string[];
}

export interface ReviewPlan {
  reviews: PlannedReview[];
  layers: string[][];
  criticalPath: string[];
  /** Today's process: sequential, queue waits, duplicate checks. */
  sequentialHours: number;
  /** Madoun: parallel layers, reuse, queue waits per layer. */
  parallelHours: number;
  hoursSaved: number;
  duplicateChecksAvoided: number;
}

/* ------------------------------------------------------------------ */
/* Risk                                                                */
/* ------------------------------------------------------------------ */

/** Factors limited to criteria that WTO TFA 7.4 treats as permissible (plus operational completeness). */
export type RiskFactor =
  | 'goods-category'
  | 'origin'
  | 'value'
  | 'trader-history'
  | 'authorised-operator'
  | 'transport-mode'
  | 'documentation-completeness'
  | 'prior-findings';

export interface RiskSignal {
  authorityId: AuthorityId;
  factor: RiskFactor;
  /** Stable key for learning, e.g. 'origin:XX' or 'goods-category:food'. */
  key: string;
  /** Signed points added to the authority's score. */
  points: number;
  reason: string;
  reasonAr: string;
}

export interface AuthorityRisk {
  authorityId: AuthorityId;
  score: number;
  lane: Lane;
  signals: RiskSignal[];
}

export interface LaneConflict {
  authorities: AuthorityId[];
  lanes: Lane[];
  rule: string;
  ruleAr: string;
}

export interface RiskAssessment {
  shipmentId: string;
  lane: Lane;
  perAuthority: AuthorityRisk[];
  conflicts: LaneConflict[];
  /** Plain-language reasons, strongest first. */
  reasons: { text: string; textAr: string; points: number; authorityId: AuthorityId }[];
  recommendedChecks: { text: string; textAr: string; authorityId: AuthorityId }[];
  /** Pathway wording. */
  pathway: 'pre-arrival-release' | 'targeted-checks' | 'physical-inspection';
  auditFlag: boolean; // blue: post-clearance audit
  assessedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Exceptions, inspection, outcomes                                    */
/* ------------------------------------------------------------------ */

export type ExceptionKind =
  | 'idle-review'
  | 'missing-evidence'
  | 'evidence-expiring'
  | 'authority-conflict'
  | 'unowned-handoff';

export interface ExceptionItem {
  id: string;
  shipmentId: string;
  kind: ExceptionKind;
  requirementId?: string;
  authorityId?: AuthorityId;
  ownerId: string;
  openedAt: ISODate;
  /** Hours since it became actionable. */
  clockHours: number;
  escalationLevel: number;
  state: 'open' | 'resolved';
  resolvedAt?: ISODate;
  detail: string;
  detailAr: string;
}

export interface InspectionTask {
  id: string;
  shipmentId: string;
  containerIds: string[];
  requestedAt: ISODate;
  requestedBy: string;
  scope: string[];
  priority: 'normal' | 'high';
  constraints: string[];
}

export interface InspectionFinding {
  kind: 'seal-broken' | 'undeclared-goods' | 'quantity-mismatch' | 'damage' | 'temperature-excursion' | 'prohibited-item' | 'none';
  severity: 'info' | 'minor' | 'major';
  note: string;
}

export interface InspectionResult {
  taskId: string;
  shipmentId: string;
  performedBy: string; // robot id, drone id, scanner id or officer id
  performerKind: 'robot' | 'drone' | 'scanner' | 'officer';
  completedAt: ISODate;
  seal: { id: string; intact: boolean };
  findings: InspectionFinding[];
  mediaRefs: string[];
}

export type OutcomeResult = 'confirmed' | 'false-alarm' | 'not-inspected';

export interface Outcome {
  shipmentId: string;
  lane: Lane;
  traderId: string;
  forwarderId: string;
  /** Risk signal keys that contributed to an intervention. */
  triggerKeys: string[];
  result: OutcomeResult;
  /** Evidence types that were missing at first submission. */
  missingEvidence: EvidenceType[];
  recordedAt: ISODate;
}

/* ------------------------------------------------------------------ */
/* Events and world state                                              */
/* ------------------------------------------------------------------ */

export type MadounEvent =
  | { type: 'ShipmentRegistered'; at: ISODate; shipment: Shipment }
  | { type: 'ReceiptIssued'; at: ISODate; receipt: Omit<EvidenceReceipt, 'hash' | 'prevHash' | 'reuseLog'> }
  | { type: 'ReceiptRevoked'; at: ISODate; receiptId: string; reason: string }
  | { type: 'ReceiptReused'; at: ISODate; receiptId: string; entry: ReuseEntry }
  | { type: 'ReviewStarted'; at: ISODate; shipmentId: string; requirementId: string; authorityId: AuthorityId; officerId: string }
  | {
      type: 'ReviewCompleted';
      at: ISODate;
      shipmentId: string;
      requirementId: string;
      authorityId: AuthorityId;
      officerId: string;
      result: 'approved' | 'rejected' | 'needs-info';
      note?: string;
    }
  | { type: 'LaneAssigned'; at: ISODate; shipmentId: string; assessment: RiskAssessment }
  | { type: 'OfficerOverride'; at: ISODate; shipmentId: string; lane: Lane; officerId: string; reason: string }
  | { type: 'ExceptionOpened'; at: ISODate; exception: ExceptionItem }
  | { type: 'ExceptionResolved'; at: ISODate; exceptionId: string; officerId: string; note: string }
  | { type: 'InspectionRequested'; at: ISODate; task: InspectionTask }
  | { type: 'InspectionCompleted'; at: ISODate; result: InspectionResult }
  | { type: 'OutcomeRecorded'; at: ISODate; outcome: Outcome }
  | { type: 'ShipmentCleared'; at: ISODate; shipmentId: string; preArrival: boolean }
  | { type: 'RuleSuggestionApproved'; at: ISODate; key: string; multiplier: number; officerId: string };

export interface ReviewState {
  requirementId: string;
  authorityId: AuthorityId;
  startedAt?: ISODate;
  startedBy?: string;
  completedAt?: ISODate;
  result?: 'approved' | 'rejected' | 'needs-info';
  note?: string;
}

export interface AuditEntry {
  at: ISODate;
  actor: string;
  action: string;
  actionAr: string;
}

export interface ShipmentFile {
  shipment: Shipment;
  registeredAt: ISODate;
  reviews: Record<string, ReviewState>;
  assessment?: RiskAssessment;
  override?: { lane: Lane; officerId: string; reason: string; at: ISODate };
  exceptions: ExceptionItem[];
  inspectionTask?: InspectionTask;
  inspectionResult?: InspectionResult;
  outcome?: Outcome;
  cleared?: { at: ISODate; preArrival: boolean };
  audit: AuditEntry[];
}

export interface World {
  shipments: Record<string, ShipmentFile>;
  receipts: EvidenceReceipt[];
  /** Approved weight multipliers per signal key. */
  weightOverrides: Record<string, number>;
  log: MadounEvent[];
}
