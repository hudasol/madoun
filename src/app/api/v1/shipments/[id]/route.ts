import { getWorld } from '@/server/world';
import { canSeeReceipt } from '@/server/auth';
import { gatewayWorld } from '@/server/inspection-gateway';
import { handle, json, notFound } from '@/server/http';
import { planShipment } from '@/engine';
import { laneOf } from '@/server/lane';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return handle(request, async ({ caller }) => {
    const { id } = await ctx.params;
    const { world, g, now } = getWorld();
    const file = world.shipments[id];
    if (!file) return notFound('Shipment', id);

    // Re-plan against the current receipts so checks reflect today's evidence, not the filing-time snapshot.
    const receipts = gatewayWorld().receipts;
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
        inspectionConfirmation: file.inspectionConfirmation,
        outcome: file.outcome,
        cleared: file.cleared,
      },
      requirements: plan.instances.map((i) => ({ ...i, label: label(i.requirementId) })),
      // A check that rests on a receipt this caller may not see is reported as not shared, without the receipt.
      evidenceChecks: plan.checks.map((c) => {
        const r = c.receiptId ? receipts.find((x) => x.id === c.receiptId) : undefined;
        if (!r || canSeeReceipt(caller, r)) return c;
        return { requirementId: c.requirementId, verdict: 'not-shared' as const, reason: 'Evidence exists but its custodian has not shared it with this caller.', reasonAr: 'الدليل موجود لكن الجهة المودعة لم تشاركه مع هذا المستخدم.' };
      }),
      reviewPlan: plan.reviewPlan,
      assessment: plan.assessment,
      exceptions: file.exceptions,
      auditTrail: file.audit,
    });
  }, { scope: 'shipments:read' });
}
