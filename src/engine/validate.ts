import { inspectionReceiptId, requiresOfficerConfirmation } from './inspection';
import type { MadounEvent, ShipmentFile, World } from './types';

/** True when the file holds a serious machine finding that no officer has confirmed yet. */
export function awaitingOfficerConfirmation(f: ShipmentFile | undefined): boolean {
  return !!f?.inspectionResult && requiresOfficerConfirmation(f.inspectionResult) && !f.inspectionConfirmation;
}

/**
 * Invariants an event must satisfy against the current world BEFORE it is appended.
 *
 * `apply` is deliberately total: it never throws and silently ignores an event that points at
 * something missing, so a replay can always finish. That is right for reading history and wrong
 * for accepting new input, where a typo'd id would be logged and then do nothing. Anything that
 * admits events from outside the engine (UI actions, a future adapter) runs this first.
 * Returns human-readable problems; an empty array means the event may be appended.
 */
export function validateEvent(world: World, ev: MadounEvent): string[] {
  const problems: string[] = [];
  const bad = (m: string) => problems.push(m);
  const nonEmpty = (v: unknown, name: string, max = 500) => {
    if (typeof v !== 'string' || v.trim() === '') bad(`${name} must be a non-empty string.`);
    else if (v.length > max) bad(`${name} must be at most ${max} characters.`);
  };

  if (typeof ev.at !== 'string' || Number.isNaN(Date.parse(ev.at))) bad('at must be an ISO timestamp.');

  const needFile = (id: string) => {
    if (!world.shipments[id]) bad(`Unknown shipment '${id}'.`);
  };

  switch (ev.type) {
    case 'ShipmentRegistered':
      if (world.shipments[ev.shipment.id]) bad(`Shipment '${ev.shipment.id}' is already registered.`);
      break;
    case 'ReceiptIssued': {
      const r = ev.receipt;
      if (world.receipts.some((x) => x.id === r.id)) bad(`Receipt '${r.id}' already exists.`);
      if (!(Date.parse(r.validUntil) > Date.parse(r.validFrom))) bad('validUntil must be after validFrom.');
      // An inspection receipt must belong to a recorded result, carry that result's ids, and have exactly the
      // status the confirmation rule gives it. The status a client supplies is never trusted.
      if (r.type === 'inspection-result') {
        const f = r.scope.level === 'shipment' && r.scope.shipmentId ? world.shipments[r.scope.shipmentId] : undefined;
        const res = f?.inspectionResult;
        if (!res) bad('An inspection receipt needs a recorded inspection result for its shipment.');
        else {
          if (r.id !== inspectionReceiptId(res.taskId) || r.subjectRef !== res.taskId) bad('An inspection receipt must carry the id and subject of its inspection result.');
          const decision = f.inspectionConfirmation?.decision;
          if (decision === 'overturned') bad('The finding was overturned; it cannot be issued as evidence.');
          const expected = requiresOfficerConfirmation(res) && decision !== 'upheld' ? 'pending' : 'verified';
          if (r.status !== expected) bad(`This inspection receipt must be issued as ${expected}.`);
        }
      }
      break;
    }
    case 'ReceiptRevoked':
      if (!world.receipts.some((x) => x.id === ev.receiptId)) bad(`Unknown receipt '${ev.receiptId}'.`);
      nonEmpty(ev.reason, 'reason');
      break;
    case 'ReceiptReused':
      if (!world.receipts.some((x) => x.id === ev.receiptId)) bad(`Unknown receipt '${ev.receiptId}'.`);
      break;
    case 'ReviewStarted':
      needFile(ev.shipmentId);
      nonEmpty(ev.officerId, 'officerId', 120);
      break;
    case 'ReviewCompleted':
      needFile(ev.shipmentId);
      nonEmpty(ev.officerId, 'officerId', 120);
      if (!['approved', 'rejected', 'needs-info'].includes(ev.result)) bad('result must be approved, rejected or needs-info.');
      if (ev.note !== undefined) nonEmpty(ev.note, 'note', 1000);
      break;
    case 'LaneAssigned':
    case 'ShipmentCleared':
      needFile(ev.shipmentId);
      break;
    case 'OfficerOverride':
      needFile(ev.shipmentId);
      nonEmpty(ev.officerId, 'officerId', 120);
      nonEmpty(ev.reason, 'reason', 1000);
      if (!['green', 'amber', 'red'].includes(ev.lane)) bad('lane must be green, amber or red.');
      break;
    case 'ExceptionOpened':
      needFile(ev.exception.shipmentId);
      break;
    case 'ExceptionResolved':
      nonEmpty(ev.officerId, 'officerId', 120);
      nonEmpty(ev.note, 'note', 1000);
      break;
    case 'InspectionRequested':
      needFile(ev.task.shipmentId);
      break;
    case 'InspectionCompleted':
      needFile(ev.result.shipmentId);
      if (!world.shipments[ev.result.shipmentId]?.inspectionTask) bad('No inspection was requested for this shipment.');
      // One result per shipment: a second result could otherwise inherit the first one's confirmation.
      if (world.shipments[ev.result.shipmentId]?.inspectionResult) bad('An inspection result is already recorded for this shipment.');
      if (world.shipments[ev.result.shipmentId]?.outcome) bad('The learning outcome is already recorded; a later result would bypass confirmation.');
      if (world.shipments[ev.result.shipmentId]?.inspectionTask && ev.result.taskId !== world.shipments[ev.result.shipmentId]!.inspectionTask!.id) bad('The result must answer the requested task.');
      break;
    case 'InspectionConfirmed': {
      needFile(ev.shipmentId);
      nonEmpty(ev.officerId, 'officerId', 120);
      nonEmpty(ev.note, 'note', 1000);
      if (!['upheld', 'overturned'].includes(ev.decision)) bad('decision must be upheld or overturned.');
      const f = world.shipments[ev.shipmentId];
      if (f && !awaitingOfficerConfirmation(f)) {
        bad(f.inspectionConfirmation ? 'This inspection result has already been confirmed.' : 'There is no unconfirmed machine finding on this shipment.');
      }
      if (f?.inspectionResult && Date.parse(ev.at) < Date.parse(f.inspectionResult.completedAt)) bad('A confirmation cannot predate the inspection result.');
      break;
    }
    case 'OutcomeRecorded':
      needFile(ev.outcome.shipmentId);
      // The learning loop only hears about a serious machine finding once a person has confirmed it.
      if (awaitingOfficerConfirmation(world.shipments[ev.outcome.shipmentId])) bad('Outcome cannot be recorded before an officer confirms the machine finding.');
      {
        const f = world.shipments[ev.outcome.shipmentId];
        if (f?.inspectionTask && !f.inspectionResult) bad('Outcome cannot be recorded while a requested inspection has no result.');
      }
      break;
    case 'RuleSuggestionApproved':
      nonEmpty(ev.key, 'key', 200);
      nonEmpty(ev.officerId, 'officerId', 120);
      if (!Number.isFinite(ev.multiplier) || ev.multiplier <= 0 || ev.multiplier > 5) bad('multiplier must be a number in (0, 5].');
      break;
  }
  return problems;
}
