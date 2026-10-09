import type { Directory } from './directory';
import { detectExceptions } from './exceptions';
import { createInspectionTask, outcomeFromInspection, resultToReceiptDraft, simulateInspectionCell, type Truth } from './inspection';
import { planShipment } from './plan';
import { WorldBuilder, emptyWorld, replay } from './reducer';
import { makeRng } from './rng';
import { addHours, ms, round1 } from './time';
import type {
  EvidenceReceipt,
  EvidenceType,
  InspectionResult,
  Lane,
  MadounEvent,
  PlannedReview,
  Shipment,
  World,
} from './types';
import { allItems } from './types';

export interface SimInput {
  seed: number;
  directory: Directory;
  shipments: Shipment[];
  truth: Record<string, { violation?: Truth['violation']; missing: EvidenceType[] }>;
  /** Start with these approved rule-weight multipliers (used to preview a learning suggestion). */
  weightOverrides?: Record<string, number>;
}

export interface ShipmentSimResult {
  shipmentId: string;
  lane: Lane;
  leadHours: number;
  todayHours: number;
  madounHours: number;
  todayPreArrival: boolean;
  madounPreArrival: boolean;
  /** Hours that shipment waited with nobody working on it (queue waits on the path to release). */
  todayInactionHours: number;
  madounInactionHours: number;
  repeatChecksAvoided: number;
  clearedAt: string;
}

export interface SimOutput {
  events: MadounEvent[];
  results: ShipmentSimResult[];
}

/** Extra effort for lane-specific checks, the same in both modes (so it cannot flatter Madoun). */
export const LANE_EXTRA_HOURS: Record<Lane, number> = { green: 0, amber: 2.5, red: 8 };

/** Illustrative validity (days) for reusable, product-level receipts. */
const REUSABLE: Partial<Record<EvidenceType, number>> = {
  'conformity-certificate': 365,
  'type-approval': 365,
  'safety-data-sheet': 365,
  'health-certificate': 90,
};

/**
 * Replays the whole story of every shipment: filing, lane, parallel reviews, receipts, reuse,
 * inspections, outcomes and clearance. Deterministic for a given seed.
 *
 * Modelling assumptions (also stated in the UI):
 *  - "Today" runs reviews one after another with full queue waits and duplicate re-checks.
 *  - Madoun runs independent reviews together and accepts trusted receipts. Queue waits for full
 *    reviews are not reduced. Lane-specific checks, missing-document chasing and stalls cost the
 *    same in both modes. The only extra advantage Madoun gets: it sees a missing document at filing,
 *    while today it is discovered when the owning authority first picks the item up.
 */
export function simulate(input: SimInput): SimOutput {
  const { directory: dir, shipments, truth } = input;
  const rng = makeRng(input.seed + 17);
  const builder = new WorldBuilder({ ...emptyWorld(), weightOverrides: input.weightOverrides ?? {} });
  const world = builder.world; // mutated in place by the builder; planShipment only reads it
  const events: MadounEvent[] = [];
  const results: ShipmentSimResult[] = [];

  const push = (ev: MadounEvent) => {
    events.push(ev);
    builder.apply(ev);
  };

  for (const shipment of shipments) {
    const filedAt = shipment.filedAt;
    push({ type: 'ShipmentRegistered', at: filedAt, shipment });
    const plan = planShipment(world, dir, shipment, filedAt);
    push({ type: 'LaneAssigned', at: filedAt, shipmentId: shipment.id, assessment: plan.assessment });

    const lane = plan.assessment.lane;
    const laneExtra = LANE_EXTRA_HOURS[lane];
    const t = truth[shipment.id] ?? { missing: [] };

    // Delays that exist in both modes.
    const missingReviews = plan.reviewPlan.reviews.filter((r) => r.verdict === 'missing');
    const chaseDelay = missingReviews.length ? 6 + Math.floor(rng.next() * 18) : 0;
    const fullReviews = plan.reviewPlan.reviews.filter((r) => r.mode === 'full-review' && r.requirementId !== 'cus-release');
    const stallTarget = fullReviews.length && rng.chance(0.12) ? rng.pick(fullReviews).requirementId : undefined;
    const stall = stallTarget ? 14 + Math.floor(rng.next() * 16) : 0;

    // Madoun schedule with the extra delays included.
    const end = new Map<string, number>();
    const startAt = new Map<string, number>();
    const ordered = [...plan.reviewPlan.reviews].sort((a, b) => a.layer - b.layer || a.startHour - b.startHour);
    for (const r of ordered) {
      const auth = dir.authorities[r.authorityId];
      const depEnd = r.dependsOn.reduce((m, d) => Math.max(m, end.get(d) ?? 0), 0);
      let begin = depEnd;
      if (r.requirementId === 'cus-release') begin += laneExtra;
      if (r.verdict === 'missing') begin += chaseDelay;
      const wait = r.mode === 'full-review' ? auth.queueWaitHours : r.mode === 'accept-receipt' ? auth.queueWaitHours * 0.25 : 0;
      const dur = r.hours + (r.requirementId === stallTarget ? stall : 0);
      startAt.set(r.requirementId, begin + wait);
      end.set(r.requirementId, begin + wait + dur);
    }
    const blocking = plan.reviewPlan.reviews.filter((r) => r.blocksRelease);
    const madounHours = blocking.reduce((m, r) => Math.max(m, end.get(r.requirementId) ?? 0), 0);

    // Today's sequential baseline.
    const waitsToday = blocking.reduce((a, r) => a + dir.authorities[r.authorityId].queueWaitHours, 0);
    const discoveryLag = missingReviews.length ? Math.max(...missingReviews.map((r) => dir.authorities[r.authorityId].queueWaitHours)) : 0;
    const todayHours = plan.reviewPlan.sequentialHours + laneExtra + chaseDelay + discoveryLag + stall;

    // Madoun inaction: queue waits for items on the critical path only.
    const madounWaits = plan.reviewPlan.reviews
      .filter((r) => r.onCriticalPath)
      .reduce((a, r) => a + (r.mode === 'full-review' ? dir.authorities[r.authorityId].queueWaitHours : r.mode === 'accept-receipt' ? dir.authorities[r.authorityId].queueWaitHours * 0.25 : 0), 0);

    const lead = (ms(shipment.eta) - ms(filedAt)) / 3_600_000;

    // ---- Events for reviews, receipts, reuse ----
    for (const r of ordered) {
      if (r.mode === 'no-action') continue;
      const req = dir.requirementById[r.requirementId];
      const s = startAt.get(r.requirementId)!;
      const e = end.get(r.requirementId)!;
      const officer = `${r.authorityId}:officer-${(shipment.id.length + r.requirementId.length + Math.floor(s)) % 5 + 1}`;
      push({ type: 'ReviewStarted', at: addHours(filedAt, s), shipmentId: shipment.id, requirementId: r.requirementId, authorityId: r.authorityId, officerId: officer });
      push({ type: 'ReviewCompleted', at: addHours(filedAt, e), shipmentId: shipment.id, requirementId: r.requirementId, authorityId: r.authorityId, officerId: officer, result: 'approved' });

      if (r.mode === 'accept-receipt') {
        const check = plan.checks.find((c) => c.requirementId === r.requirementId);
        if (check?.receiptId && check.verdict !== 'awaiting-review' && check.verdict !== 'missing') {
          push({ type: 'ReceiptReused', at: addHours(filedAt, s), receiptId: check.receiptId, entry: { shipmentId: shipment.id, acceptedByAuthorityId: r.authorityId, at: addHours(filedAt, s), requirementId: r.requirementId } });
        } else if (r.reliesOn) {
          for (const relied of r.reliesOn) {
            for (const type of dir.requirementById[relied].evidenceTypes) {
              if (!req.evidenceTypes.includes(type)) continue;
              push({ type: 'ReceiptReused', at: addHours(filedAt, s), receiptId: `rcpt-${shipment.id}-${relied}-${type}`, entry: { shipmentId: shipment.id, acceptedByAuthorityId: r.authorityId, at: addHours(filedAt, s), requirementId: r.requirementId } });
            }
          }
        }
        // Reviews that accepted a receipt issue nothing new.
      } else {
        issueReceipts(r, req.evidenceTypes, addHours(filedAt, e));
      }
    }

    function issueReceipts(r: PlannedReview, types: EvidenceType[], at: string) {
      const inst = plan.instances.find((i) => i.requirementId === r.requirementId)!;
      const items = allItems(shipment).filter((i) => inst.itemIds.includes(i.id));
      for (const type of types) {
        const reusableDays = REUSABLE[type];
        const id = `rcpt-${shipment.id}-${r.requirementId}-${type}`;
        let sharedWith: EvidenceReceipt['sharedWith'] = 'all';
        if (rng.chance(0.08)) sharedWith = [r.authorityId];
        let validDays = reusableDays ?? 30;
        let hs6 = [...new Set(items.map((i) => i.hsCode.slice(0, 6)))];
        if (reusableDays) {
          if (rng.chance(0.06)) validDays = 1 + Math.floor(rng.next() * 3); // short-lived: will expire soon
          if (hs6.length > 1 && rng.chance(0.15)) hs6 = hs6.slice(0, 1); // narrower scope than a later multi-item shipment
        }
        const scope = reusableDays
          ? ({ level: 'trader-product', traderId: shipment.traderId, hs6 } as const)
          : ({ level: 'shipment', shipmentId: shipment.id } as const);
        push({
          type: 'ReceiptIssued',
          at,
          receipt: {
            id,
            type,
            subjectRef: `${type}:${shipment.id}`,
            summary: `${dir.requirementById[r.requirementId].label} verified for ${items.map((i) => i.description).join(', ')}`,
            summaryAr: `تم التحقق من ${dir.requirementById[r.requirementId].labelAr} للبضائع: ${items.map((i) => i.descriptionAr ?? i.description).join('، ')}`,
            issuer: `${shipment.traderId} supplier`,
            verifiedBy: r.authorityId,
            method: 'document-check',
            scope,
            validFrom: at,
            validUntil: addHours(at, validDays * 24),
            status: 'verified',
            sharedWith,
          },
        });
      }
    }

    // ---- Inspection / targeted checks ----
    const releaseStart = startAt.get('cus-release') ?? madounHours;
    let result: InspectionResult | undefined;
    const truthForInspection = { violation: t.violation };
    if (lane === 'red') {
      const task = createInspectionTask(shipment, plan.assessment, addHours(filedAt, releaseStart - laneExtra));
      push({ type: 'InspectionRequested', at: task.requestedAt, task });
      result = simulateInspectionCell(task, truthForInspection, rng, task.requestedAt, { id: `cell-${rng.pick(['A1', 'A2', 'B1'])}`, kind: rng.pick(['robot', 'robot', 'drone', 'scanner'] as const) });
      push({ type: 'InspectionCompleted', at: result.completedAt, result });
      push({ type: 'ReceiptIssued', at: result.completedAt, receipt: resultToReceiptDraft(result) });
    } else if (lane === 'amber') {
      const task = createInspectionTask(shipment, plan.assessment, addHours(filedAt, Math.max(0, releaseStart - laneExtra)));
      result = simulateInspectionCell(task, truthForInspection, rng, task.requestedAt, { id: `${plan.assessment.recommendedChecks[0]?.authorityId ?? 'adc'}:officer`, kind: 'officer' }, { detectionRate: 0.6, falsePositiveRate: 0.02 });
    }

    const clearedAtHours = madounHours;
    const clearedAt = addHours(filedAt, clearedAtHours);
    const missingAtFirst = t.missing;
    push({
      type: 'OutcomeRecorded',
      at: clearedAt,
      outcome: outcomeFromInspection(shipment, plan.assessment, result, missingAtFirst, clearedAt),
    });
    push({ type: 'ShipmentCleared', at: clearedAt, shipmentId: shipment.id, preArrival: clearedAtHours <= lead });

    results.push({
      shipmentId: shipment.id,
      lane,
      leadHours: round1(lead),
      todayHours: round1(todayHours),
      madounHours: round1(madounHours),
      todayPreArrival: todayHours <= lead,
      madounPreArrival: madounHours <= lead,
      todayInactionHours: round1(waitsToday + discoveryLag),
      madounInactionHours: round1(madounWaits),
      repeatChecksAvoided: plan.reviewPlan.duplicateChecksAvoided,
      clearedAt,
    });
  }

  events.sort((a, b) => ms(a.at) - ms(b.at));
  return { events, results };
}

/** Time travel: the world as it stood at a given moment. */
export function worldAt(events: MadounEvent[], at: string): World {
  const cut = ms(at);
  return replay(events.filter((e) => ms(e.at) <= cut));
}

export { detectExceptions };
