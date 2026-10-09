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
import type { MadounEvent } from './types';

export interface ShipmentPlan {
  shipment: Shipment;
  instances: RequirementInstance[];
  checks: EvidenceCheck[];
  reviewPlan: ReviewPlan;
  assessment: RiskAssessment;
}

/**
 * Origins a trader has already shipped from, excluding one shipment. Indexed per event log and extended
 * as the log grows, so planning a shipment costs the trader's own history, not the size of the world.
 */
interface OriginIndex {
  len: number;
  byTrader: Map<string, Map<string, string[]>>;
}
const ORIGINS = new WeakMap<MadounEvent[], OriginIndex>();

function knownOriginsFor(world: World, shipment: Shipment): string[] {
  let ix = ORIGINS.get(world.log);
  if (!ix) {
    ix = { len: 0, byTrader: new Map() };
    ORIGINS.set(world.log, ix);
  }
  for (; ix.len < world.log.length; ix.len++) {
    const ev = world.log[ix.len];
    if (ev.type !== 'ShipmentRegistered') continue;
    const t = ev.shipment.traderId;
    const m = ix.byTrader.get(t) ?? new Map<string, string[]>();
    m.set(ev.shipment.id, allItems(ev.shipment).map((i) => i.origin));
    ix.byTrader.set(t, m);
  }
  const out = new Set<string>();
  for (const [id, origins] of ix.byTrader.get(shipment.traderId) ?? []) if (id !== shipment.id) for (const o of origins) out.add(o);
  return [...out];
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
  const knownOrigins = knownOriginsFor(world, shipment);

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
