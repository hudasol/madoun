import type { Directory } from './directory';
import { checkRequirement } from './evidence';
import { requirementsFor } from './requirements';
import { buildReviewPlan } from './reviews';
import { assessRisk } from './risk';
import type {
  EvidenceCheck,
  RequirementInstance,
  ReviewPlan,
  RiskAssessment,
  Shipment,
  World,
} from './types';
import { allItems } from './types';

export interface ShipmentPlan {
  shipment: Shipment;
  instances: RequirementInstance[];
  checks: EvidenceCheck[];
  reviewPlan: ReviewPlan;
  assessment: RiskAssessment;
}

/** The brain: from a shipment and the current world, work out approvals, evidence status, schedule and lane. */
export function planShipment(world: World, dir: Directory, shipment: Shipment, now: string): ShipmentPlan {
  const instances = requirementsFor(shipment, dir.requirements);
  const checks = instances.map((inst) =>
    checkRequirement(inst, dir.requirementById[inst.requirementId], shipment, world.receipts, now),
  );

  const file = world.shipments[shipment.id];
  const completed = new Set<string>(
    Object.values(file?.reviews ?? {})
      .filter((r) => r.completedAt && r.result === 'approved')
      .map((r) => r.requirementId),
  );

  const reviewPlan = buildReviewPlan({
    instances,
    checks,
    requirements: dir.requirementById,
    authorities: dir.authorities,
    completed,
  });

  const trader = dir.traders[shipment.traderId];
  const knownOrigins = [
    ...new Set(
      Object.values(world.shipments)
        .filter((f) => f.shipment.traderId === shipment.traderId && f.shipment.id !== shipment.id)
        .flatMap((f) => allItems(f.shipment).map((i) => i.origin)),
    ),
  ];

  const assessment = assessRisk(shipment, {
    trader,
    knownOrigins,
    instances,
    checks,
    authorities: dir.authorities,
    weightOverrides: world.weightOverrides,
    now,
  });

  return { shipment, instances, checks, reviewPlan, assessment };
}
