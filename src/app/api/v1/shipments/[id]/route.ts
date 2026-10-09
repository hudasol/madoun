import { getWorld } from '@/server/world';
import { handle, json, notFound } from '@/server/http';
import { planShipment } from '@/engine';
import { laneOf } from '@/server/lane';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const { world, g, now } = getWorld();
    const file = world.shipments[id];
    if (!file) return notFound('Shipment', id);

    // Re-plan against the current receipts so checks reflect today's evidence, not the filing-time snapshot.
    const plan = planShipment(world, g.directory, file.shipment, now);
    const label = (rid: string) => g.directory.requirementById[rid]?.label;
    return json({
      evaluatedAt: now,
      shipment: file.shipment,
      trader: g.directory.traders[file.shipment.traderId],
      file: {
        registeredAt: file.registeredAt,
        lane: laneOf(file),
        override: file.override,
        reviews: file.reviews,
        inspectionTask: file.inspectionTask,
        inspectionResult: file.inspectionResult,
        outcome: file.outcome,
        cleared: file.cleared,
      },
      requirements: plan.instances.map((i) => ({ ...i, label: label(i.requirementId) })),
      evidenceChecks: plan.checks,
      reviewPlan: plan.reviewPlan,
      assessment: plan.assessment,
      exceptions: file.exceptions,
      auditTrail: file.audit,
    });
  });
}
