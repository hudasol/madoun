import { appendReceipt, makeReceipt } from './evidence';
import type { AuditEntry, MadounEvent, ShipmentFile, World } from './types';

export function emptyWorld(): World {
  return { shipments: {}, receipts: [], weightOverrides: {}, log: [] };
}

/** Arabic words for engine enum values that appear inside audit sentences. */
const LANE_AR: Record<string, string> = { green: 'الأخضر', amber: 'الكهرماني', red: 'الأحمر' };
const REVIEW_AR: Record<string, string> = { approved: 'تمت الموافقة', rejected: 'مرفوضة', 'needs-info': 'تحتاج معلومات إضافية' };
const KIND_AR: Record<string, string> = {
  'idle-review': 'مراجعة متوقفة',
  'missing-evidence': 'دليل ناقص',
  'evidence-expiring': 'دليل قارب على الانتهاء',
  'authority-conflict': 'خلاف بين الجهات',
  'unowned-handoff': 'تسليم بلا مسؤول',
};
const OUTCOME_AR: Record<string, string> = { confirmed: 'مخالفة مؤكدة', 'false-alarm': 'إنذار خاطئ', 'not-inspected': 'لم يُفحص' };
const ar = (m: Record<string, string>, k: string) => m[k] ?? k;

function audit(file: ShipmentFile, at: string, actor: string, action: string, actionAr: string): AuditEntry[] {
  return [...file.audit, { at, actor, action, actionAr }];
}

function mapFile(world: World, id: string, fn: (f: ShipmentFile) => ShipmentFile): World {
  const file = world.shipments[id];
  if (!file) return world; // Events for unknown shipments are ignored (and still logged).
  return { ...world, shipments: { ...world.shipments, [id]: fn(file) } };
}

/** Which shipment file an event belongs to, if it is a per-shipment event. */
function shipmentIdOf(ev: MadounEvent): string | undefined {
  switch (ev.type) {
    case 'ReviewStarted':
    case 'ReviewCompleted':
    case 'LaneAssigned':
    case 'OfficerOverride':
    case 'ShipmentCleared':
      return ev.shipmentId;
    case 'ExceptionOpened':
      return ev.exception.shipmentId;
    case 'InspectionRequested':
      return ev.task.shipmentId;
    case 'InspectionCompleted':
      return ev.result.shipmentId;
    case 'OutcomeRecorded':
      return ev.outcome.shipmentId;
    default:
      return undefined;
  }
}

/** The one place that defines how a per-shipment event changes a shipment file. */
function fileEvent(f: ShipmentFile, ev: MadounEvent): ShipmentFile {
  switch (ev.type) {
    case 'ReviewStarted':
      return {
        ...f,
        reviews: {
          ...f.reviews,
          [ev.requirementId]: {
            ...f.reviews[ev.requirementId],
            requirementId: ev.requirementId,
            authorityId: ev.authorityId,
            startedAt: ev.at,
            startedBy: ev.officerId,
          },
        },
        audit: audit(f, ev.at, ev.officerId, `Started review ${ev.requirementId}`, `بدء المراجعة ${ev.requirementId}`),
      };
    case 'ReviewCompleted':
      return {
        ...f,
        reviews: {
          ...f.reviews,
          [ev.requirementId]: {
            ...f.reviews[ev.requirementId],
            requirementId: ev.requirementId,
            authorityId: ev.authorityId,
            completedAt: ev.at,
            result: ev.result,
            note: ev.note,
          },
        },
        audit: audit(f, ev.at, ev.officerId, `Completed review ${ev.requirementId}: ${ev.result}`, `اكتملت المراجعة ${ev.requirementId}: ${ar(REVIEW_AR, ev.result)}`),
      };
    case 'LaneAssigned':
      return {
        ...f,
        assessment: ev.assessment,
        audit: audit(f, ev.at, 'madoun', `Lane recommended: ${ev.assessment.lane}`, `المسار الموصى به: ${ar(LANE_AR, ev.assessment.lane)}`),
      };
    case 'OfficerOverride':
      return {
        ...f,
        override: { lane: ev.lane, officerId: ev.officerId, reason: ev.reason, at: ev.at },
        audit: audit(f, ev.at, ev.officerId, `Lane overridden to ${ev.lane}: ${ev.reason}`, `تم تعديل المسار إلى ${ar(LANE_AR, ev.lane)}: ${ev.reason}`),
      };
    case 'ExceptionOpened':
      return {
        ...f,
        exceptions: [...f.exceptions.filter((e) => e.id !== ev.exception.id), ev.exception],
        audit: audit(f, ev.at, 'madoun', `Exception opened (${ev.exception.kind}), owner ${ev.exception.ownerId}`, `فتح استثناء (${ar(KIND_AR, ev.exception.kind)})، المسؤول ${ev.exception.ownerId}`),
      };
    case 'InspectionRequested':
      return {
        ...f,
        inspectionTask: ev.task,
        audit: audit(f, ev.at, ev.task.requestedBy, 'Inspection task requested', 'طلب مهمة فحص'),
      };
    case 'InspectionCompleted':
      return {
        ...f,
        inspectionResult: ev.result,
        audit: audit(f, ev.at, ev.result.performedBy, `Inspection completed: ${ev.result.findings.map((x) => x.kind).join(', ')}`, 'اكتمل الفحص'),
      };
    case 'OutcomeRecorded':
      return {
        ...f,
        outcome: ev.outcome,
        audit: audit(f, ev.at, 'madoun', `Outcome recorded: ${ev.outcome.result}`, `تسجيل النتيجة: ${ar(OUTCOME_AR, ev.outcome.result)}`),
      };
    case 'ShipmentCleared':
      return {
        ...f,
        cleared: { at: ev.at, preArrival: ev.preArrival },
        audit: audit(f, ev.at, 'system', ev.preArrival ? 'Cleared before arrival' : 'Cleared after arrival', ev.preArrival ? 'تم الإفراج قبل الوصول' : 'تم الإفراج بعد الوصول'),
      };
    default:
      return f;
  }
}

function newFile(ev: Extract<MadounEvent, { type: 'ShipmentRegistered' }>): ShipmentFile {
  return {
    shipment: ev.shipment,
    registeredAt: ev.at,
    reviews: {},
    exceptions: [],
    audit: [{ at: ev.at, actor: 'system', action: 'Shipment file opened', actionAr: 'فتح ملف الشحنة' }],
  };
}

function resolveInFile(f: ShipmentFile, ev: Extract<MadounEvent, { type: 'ExceptionResolved' }>): ShipmentFile {
  return {
    ...f,
    exceptions: f.exceptions.map((e) => (e.id === ev.exceptionId ? { ...e, state: 'resolved' as const, resolvedAt: ev.at } : e)),
    audit: audit(f, ev.at, ev.officerId, `Exception resolved: ${ev.note}`, `تم حل الاستثناء: ${ev.note}`),
  };
}

/** Pure reducer: apply one event to the world, returning a new world and leaving the input untouched. */
export function apply(world: World, ev: MadounEvent): World {
  const next: World = { ...world, log: [...world.log, ev] };
  switch (ev.type) {
    case 'ShipmentRegistered':
      return { ...next, shipments: { ...next.shipments, [ev.shipment.id]: newFile(ev) } };
    case 'ReceiptIssued':
      return { ...next, receipts: appendReceipt(next.receipts, ev.receipt) };
    case 'ReceiptRevoked':
      return {
        ...next,
        receipts: next.receipts.map((r) => (r.id === ev.receiptId ? { ...r, status: 'revoked', revokedReason: ev.reason } : r)),
      };
    case 'ReceiptReused':
      return {
        ...next,
        receipts: next.receipts.map((r) => (r.id === ev.receiptId ? { ...r, reuseLog: [...r.reuseLog, ev.entry] } : r)),
      };
    case 'ExceptionResolved': {
      const shipments = Object.fromEntries(
        Object.entries(next.shipments).map(([id, f]) => [id, f.exceptions.some((e) => e.id === ev.exceptionId) ? resolveInFile(f, ev) : f]),
      );
      return { ...next, shipments };
    }
    case 'RuleSuggestionApproved':
      return { ...next, weightOverrides: { ...next.weightOverrides, [ev.key]: ev.multiplier } };
    default: {
      const id = shipmentIdOf(ev);
      return id ? mapFile(next, id, (f) => fileEvent(f, ev)) : next; // unknown shipments are ignored but still logged
    }
  }
}

/**
 * Same semantics as `apply`, but mutates `world` instead of copying it. Replaying n events with the
 * pure reducer copies the log and ledger every time (quadratic); this is linear. Only for a world the
 * caller exclusively owns (replay and the simulator); `tests/scale.test.ts` proves both paths agree.
 */
export class WorldBuilder {
  readonly world: World;
  private receiptPos = new Map<string, number>();
  private exceptionOwner = new Map<string, string>();

  constructor(from: World = emptyWorld()) {
    this.world = { ...from, shipments: { ...from.shipments }, receipts: [...from.receipts], log: [...from.log] };
    from.receipts.forEach((r, i) => this.receiptPos.set(r.id, i));
    for (const [id, f] of Object.entries(from.shipments)) for (const e of f.exceptions) this.exceptionOwner.set(e.id, id);
  }

  apply(ev: MadounEvent): this {
    const w = this.world;
    w.log.push(ev);
    switch (ev.type) {
      case 'ShipmentRegistered':
        w.shipments[ev.shipment.id] = newFile(ev);
        break;
      case 'ReceiptIssued': {
        const ledger = w.receipts;
        const r = makeReceipt(ledger.length ? ledger[ledger.length - 1].hash : undefined, ev.receipt);
        this.receiptPos.set(r.id, ledger.length);
        ledger.push(r);
        break;
      }
      case 'ReceiptRevoked': {
        const i = this.receiptPos.get(ev.receiptId);
        if (i !== undefined) w.receipts[i] = { ...w.receipts[i], status: 'revoked', revokedReason: ev.reason };
        break;
      }
      case 'ReceiptReused': {
        const i = this.receiptPos.get(ev.receiptId);
        if (i !== undefined) w.receipts[i] = { ...w.receipts[i], reuseLog: [...w.receipts[i].reuseLog, ev.entry] };
        break;
      }
      case 'ExceptionResolved': {
        const id = this.exceptionOwner.get(ev.exceptionId);
        const f = id ? w.shipments[id] : undefined;
        if (id && f) w.shipments[id] = resolveInFile(f, ev);
        break;
      }
      case 'RuleSuggestionApproved':
        w.weightOverrides = { ...w.weightOverrides, [ev.key]: ev.multiplier };
        break;
      default: {
        const id = shipmentIdOf(ev);
        const f = id ? w.shipments[id] : undefined;
        if (id && f) {
          w.shipments[id] = fileEvent(f, ev);
          if (ev.type === 'ExceptionOpened') this.exceptionOwner.set(ev.exception.id, id);
        }
      }
    }
    return this;
  }
}

export function replay(events: MadounEvent[], from: World = emptyWorld()): World {
  const b = new WorldBuilder(from);
  for (const ev of events) b.apply(ev);
  return b.world;
}
