import { appendReceipt } from './evidence';
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

/** Pure reducer: apply one event to the world. */
export function apply(world: World, ev: MadounEvent): World {
  const next: World = { ...world, log: [...world.log, ev] };
  switch (ev.type) {
    case 'ShipmentRegistered': {
      const file: ShipmentFile = {
        shipment: ev.shipment,
        registeredAt: ev.at,
        reviews: {},
        exceptions: [],
        audit: [{ at: ev.at, actor: 'system', action: 'Shipment file opened', actionAr: 'فتح ملف الشحنة' }],
      };
      return { ...next, shipments: { ...next.shipments, [ev.shipment.id]: file } };
    }
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
    case 'ReviewStarted':
      return mapFile(next, ev.shipmentId, (f) => ({
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
      }));
    case 'ReviewCompleted':
      return mapFile(next, ev.shipmentId, (f) => ({
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
      }));
    case 'LaneAssigned':
      return mapFile(next, ev.shipmentId, (f) => ({
        ...f,
        assessment: ev.assessment,
        audit: audit(f, ev.at, 'madoun', `Lane recommended: ${ev.assessment.lane}`, `المسار الموصى به: ${ar(LANE_AR, ev.assessment.lane)}`),
      }));
    case 'OfficerOverride':
      return mapFile(next, ev.shipmentId, (f) => ({
        ...f,
        override: { lane: ev.lane, officerId: ev.officerId, reason: ev.reason, at: ev.at },
        audit: audit(f, ev.at, ev.officerId, `Lane overridden to ${ev.lane}: ${ev.reason}`, `تم تعديل المسار إلى ${ar(LANE_AR, ev.lane)}: ${ev.reason}`),
      }));
    case 'ExceptionOpened':
      return mapFile(next, ev.exception.shipmentId, (f) => ({
        ...f,
        exceptions: [...f.exceptions.filter((e) => e.id !== ev.exception.id), ev.exception],
        audit: audit(f, ev.at, 'madoun', `Exception opened (${ev.exception.kind}), owner ${ev.exception.ownerId}`, `فتح استثناء (${ar(KIND_AR, ev.exception.kind)})، المسؤول ${ev.exception.ownerId}`),
      }));
    case 'ExceptionResolved': {
      const shipments = Object.fromEntries(
        Object.entries(next.shipments).map(([id, f]) => {
          if (!f.exceptions.some((e) => e.id === ev.exceptionId)) return [id, f];
          return [
            id,
            {
              ...f,
              exceptions: f.exceptions.map((e) => (e.id === ev.exceptionId ? { ...e, state: 'resolved' as const, resolvedAt: ev.at } : e)),
              audit: audit(f, ev.at, ev.officerId, `Exception resolved: ${ev.note}`, `تم حل الاستثناء: ${ev.note}`),
            },
          ];
        }),
      );
      return { ...next, shipments };
    }
    case 'InspectionRequested':
      return mapFile(next, ev.task.shipmentId, (f) => ({
        ...f,
        inspectionTask: ev.task,
        audit: audit(f, ev.at, ev.task.requestedBy, 'Inspection task requested', 'طلب مهمة فحص'),
      }));
    case 'InspectionCompleted':
      return mapFile(next, ev.result.shipmentId, (f) => ({
        ...f,
        inspectionResult: ev.result,
        audit: audit(f, ev.at, ev.result.performedBy, `Inspection completed: ${ev.result.findings.map((x) => x.kind).join(', ')}`, 'اكتمل الفحص'),
      }));
    case 'OutcomeRecorded':
      return mapFile(next, ev.outcome.shipmentId, (f) => ({
        ...f,
        outcome: ev.outcome,
        audit: audit(f, ev.at, 'madoun', `Outcome recorded: ${ev.outcome.result}`, `تسجيل النتيجة: ${ar(OUTCOME_AR, ev.outcome.result)}`),
      }));
    case 'ShipmentCleared':
      return mapFile(next, ev.shipmentId, (f) => ({
        ...f,
        cleared: { at: ev.at, preArrival: ev.preArrival },
        audit: audit(f, ev.at, 'system', ev.preArrival ? 'Cleared before arrival' : 'Cleared after arrival', ev.preArrival ? 'تم الإفراج قبل الوصول' : 'تم الإفراج بعد الوصول'),
      }));
    case 'RuleSuggestionApproved':
      return { ...next, weightOverrides: { ...next.weightOverrides, [ev.key]: ev.multiplier } };
  }
}

export function replay(events: MadounEvent[], from: World = emptyWorld()): World {
  return events.reduce(apply, from);
}
