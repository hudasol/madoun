import { sha256Hex } from './hash';
import { hoursBetween, ms } from './time';
import type {
  AuthorityId,
  EvidenceCheck,
  EvidenceReceipt,
  EvidenceType,
  EvidenceVerdict,
  GoodsItem,
  Requirement,
  RequirementInstance,
  Shipment,
} from './types';

export const GENESIS_HASH = '0'.repeat(64);

type ReceiptDraft = Omit<EvidenceReceipt, 'hash' | 'prevHash' | 'reuseLog'>;

function canonical(d: ReceiptDraft): string {
  // Stable field order for hashing.
  return JSON.stringify([
    d.id,
    d.type,
    d.subjectRef,
    d.issuer,
    d.verifiedBy,
    d.method,
    d.scope,
    d.validFrom,
    d.validUntil,
    d.sharedWith,
  ]);
}

export function computeReceiptHash(d: ReceiptDraft, prevHash: string): string {
  return sha256Hex(prevHash + canonical(d));
}

/** Append a receipt to the ledger and link it to the previous receipt's hash. */
/** Builds the next receipt in a chain whose current head hash is `prev` (undefined for an empty ledger). */
export function makeReceipt(prev: string | undefined, draft: ReceiptDraft): EvidenceReceipt {
  const prevHash = prev ?? GENESIS_HASH;
  return { ...draft, prevHash, hash: computeReceiptHash(draft, prevHash), reuseLog: [] };
}

export function appendReceipt(ledger: EvidenceReceipt[], draft: ReceiptDraft): EvidenceReceipt[] {
  return [...ledger, makeReceipt(ledger.length ? ledger[ledger.length - 1].hash : undefined, draft)];
}

/**
 * Candidate lookup by (type, shipment) and (type, trader). The index is cached per ledger array and
 * extended when the array grows (receipts are append-only; positions never change), so a lookup is
 * proportional to the matches, not to the size of the ledger.
 */
interface LedgerIndex {
  len: number;
  byShipment: Map<string, number[]>;
  byTrader: Map<string, number[]>;
}
const INDEX = new WeakMap<EvidenceReceipt[], LedgerIndex>();

function ledgerIndex(receipts: EvidenceReceipt[]): LedgerIndex {
  let ix = INDEX.get(receipts);
  if (!ix) {
    ix = { len: 0, byShipment: new Map(), byTrader: new Map() };
    INDEX.set(receipts, ix);
  }
  for (; ix.len < receipts.length; ix.len++) {
    const r = receipts[ix.len];
    const key = r.scope.level === 'shipment' ? r.scope.shipmentId : r.scope.traderId;
    if (key === undefined) continue;
    const map = r.scope.level === 'shipment' ? ix.byShipment : ix.byTrader;
    const k = `${r.type}|${key}`;
    const list = map.get(k);
    if (list) list.push(ix.len);
    else map.set(k, [ix.len]);
  }
  return ix;
}

function candidatesFor(receipts: EvidenceReceipt[], type: EvidenceType, shipment: Shipment): EvidenceReceipt[] {
  const ix = ledgerIndex(receipts);
  const a = ix.byShipment.get(`${type}|${shipment.id}`) ?? [];
  const b = ix.byTrader.get(`${type}|${shipment.traderId}`) ?? [];
  // Merge two ascending position lists so the result keeps ledger order, as the old filter did.
  const out: EvidenceReceipt[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) out.push(receipts[j >= b.length || (i < a.length && a[i] < b[j]) ? a[i++] : b[j++]]);
  return out;
}

export function verifyChain(ledger: EvidenceReceipt[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS_HASH;
  for (let i = 0; i < ledger.length; i++) {
    const r = ledger[i];
    const { hash: _h, prevHash: _p, reuseLog: _r, ...draft } = r;
    void _h;
    void _p;
    void _r;
    if (r.prevHash !== prev || r.hash !== computeReceiptHash(draft, prev)) return { valid: false, brokenAt: i };
    prev = r.hash;
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Scope and sharing                                                   */
/* ------------------------------------------------------------------ */

export function receiptCoversItem(r: EvidenceReceipt, shipment: Shipment, item: GoodsItem): boolean {
  const sc = r.scope;
  const chapter = item.hsCode.slice(0, 2);
  const chapterOk = !sc.hsChapters?.length || sc.hsChapters.includes(chapter);
  const originOk = !sc.origins?.length || sc.origins.includes(item.origin);
  switch (sc.level) {
    case 'shipment':
      return sc.shipmentId === shipment.id;
    case 'trader':
      return sc.traderId === shipment.traderId && chapterOk && originOk;
    case 'trader-product':
      return (
        sc.traderId === shipment.traderId && !!sc.hs6?.includes(item.hsCode.slice(0, 6)) && chapterOk && originOk
      );
  }
}

export function isSharedWith(r: EvidenceReceipt, authorityId: AuthorityId): boolean {
  return r.verifiedBy === authorityId || r.sharedWith === 'all' || r.sharedWith.includes(authorityId);
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

const SEVERITY: Record<EvidenceVerdict, number> = {
  missing: 10,
  revoked: 9,
  expired: 8,
  'not-shared': 7,
  'scope-partial': 6,
  pending: 5,
  'awaiting-review': 4,
  'expires-before-eta': 3,
  'satisfied-reuse': 2,
  'satisfied-own': 1,
};

interface TypeResult {
  verdict: EvidenceVerdict;
  receiptIds: string[];
  reusedFrom?: AuthorityId;
  uncovered?: string[];
  detail?: string;
}

function evaluateType(
  type: EvidenceType,
  inst: RequirementInstance,
  authorityId: AuthorityId,
  shipment: Shipment,
  receipts: EvidenceReceipt[],
  now: string,
  eta: string,
): TypeResult {
  const items = shipment.consignments.flatMap((c) => c.items).filter((i) => inst.itemIds.includes(i.id));
  // Only receipts that concern this shipment or this trader can be candidates.
  const candidates = candidatesFor(receipts, type, shipment);

  if (candidates.length === 0) {
    return { verdict: shipment.submitted.includes(type) ? 'awaiting-review' : 'missing', receiptIds: [] };
  }

  const used = new Set<string>();
  const uncovered: string[] = [];
  let worst: EvidenceVerdict = 'satisfied-own';
  let reusedFrom: AuthorityId | undefined;
  let anyCoveringButBad: EvidenceVerdict | undefined;

  for (const item of items) {
    const covering = candidates.filter((r) => receiptCoversItem(r, shipment, item));
    const good = covering.filter(
      (r) =>
        r.status === 'verified' &&
        ms(r.validFrom) <= ms(now) &&
        ms(r.validUntil) >= ms(now) &&
        isSharedWith(r, authorityId),
    );
    if (good.length === 0) {
      uncovered.push(item.id);
      if (covering.some((r) => r.status === 'revoked')) anyCoveringButBad = pickWorse(anyCoveringButBad, 'revoked');
      else if (covering.some((r) => r.status === 'pending' || ms(r.validFrom) > ms(now))) anyCoveringButBad = pickWorse(anyCoveringButBad, 'pending');
      else if (covering.some((r) => ms(r.validUntil) < ms(now))) anyCoveringButBad = pickWorse(anyCoveringButBad, 'expired');
      else if (covering.length > 0 && covering.every((r) => !isSharedWith(r, authorityId)))
        anyCoveringButBad = pickWorse(anyCoveringButBad, 'not-shared');
      continue;
    }
    // Prefer the receipt valid the longest.
    good.sort((a, b) => ms(b.validUntil) - ms(a.validUntil));
    const best = good[0];
    used.add(best.id);
    if (best.verifiedBy !== authorityId) {
      reusedFrom = best.verifiedBy;
      worst = pickWorse(worst, 'satisfied-reuse');
    }
    if (ms(best.validUntil) < ms(eta)) worst = pickWorse(worst, 'expires-before-eta');
  }

  if (uncovered.length === items.length) {
    // Nothing covered: report the most specific reason we found, else scope too narrow.
    return {
      verdict: anyCoveringButBad ?? 'scope-partial',
      receiptIds: [],
      uncovered,
    };
  }
  if (uncovered.length > 0) {
    return { verdict: anyCoveringButBad ?? 'scope-partial', receiptIds: [...used], uncovered };
  }
  return { verdict: worst, receiptIds: [...used], reusedFrom };
}

function pickWorse(a: EvidenceVerdict | undefined, b: EvidenceVerdict): EvidenceVerdict {
  if (!a) return b;
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

const REASONS: Record<EvidenceVerdict, [string, string]> = {
  'satisfied-own': ['Valid receipt already held by this authority.', 'يوجد إيصال ساري لدى هذه الجهة.'],
  'satisfied-reuse': ['Accepting a valid receipt verified by another authority; no repeat check.', 'قبول إيصال ساري تحققت منه جهة أخرى دون إعادة الفحص.'],
  missing: ['Required document has not been submitted.', 'المستند المطلوب لم يُقدَّم.'],
  expired: ['The matching receipt has expired.', 'انتهت صلاحية الإيصال المطابق.'],
  'expires-before-eta': ['Receipt is valid now but expires before the expected arrival.', 'الإيصال ساري حالياً لكنه ينتهي قبل الوصول المتوقع.'],
  'scope-partial': ['An existing receipt does not cover every item in this shipment.', 'إيصال موجود لا يغطي جميع بنود هذه الشحنة.'],
  'not-shared': ['A receipt exists but its custodian has not shared it with this authority.', 'يوجد إيصال لكن الجهة الحافظة لم تشاركه مع هذه الجهة.'],
  revoked: ['The matching receipt was revoked.', 'تم إلغاء الإيصال المطابق.'],
  pending: ['A receipt exists but is not yet verified.', 'يوجد إيصال لكنه لم يُعتمد بعد.'],
  'awaiting-review': ['Documents received; waiting for a review.', 'تم استلام المستندات وبانتظار المراجعة.'],
};

export function reasonFor(verdict: EvidenceVerdict): [string, string] {
  return REASONS[verdict];
}

export function checkRequirement(
  inst: RequirementInstance,
  req: Requirement,
  shipment: Shipment,
  receipts: EvidenceReceipt[],
  now: string,
): EvidenceCheck {
  const eta = shipment.eta;
  if (req.evidenceTypes.length === 0) {
    const [en, ar] = reasonFor('awaiting-review');
    return { requirementId: req.id, verdict: 'awaiting-review', reason: en, reasonAr: ar };
  }

  const results = req.evidenceTypes.map((t) => evaluateType(t, inst, req.authorityId, shipment, receipts, now, eta));
  let verdict: EvidenceVerdict = 'satisfied-own';
  for (const r of results) verdict = pickWorse(verdict, r.verdict);

  const reuse = results.find((r) => r.reusedFrom);
  const uncovered = [...new Set(results.flatMap((r) => r.uncovered ?? []))];
  const receiptId = results.flatMap((r) => r.receiptIds)[0];
  const [reason, reasonAr] = reasonFor(verdict);
  return {
    requirementId: req.id,
    verdict,
    receiptId,
    reusedFrom: verdict === 'satisfied-reuse' || verdict === 'expires-before-eta' ? reuse?.reusedFrom : undefined,
    uncoveredItemIds: uncovered.length ? uncovered : undefined,
    reason,
    reasonAr,
  };
}

/** Hours until a receipt stops being valid (negative if already expired). */
export function hoursToExpiry(r: EvidenceReceipt, now: string): number {
  return hoursBetween(now, r.validUntil);
}
