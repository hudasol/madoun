import { getWorld } from '@/server/world';
import { errorResponse, handle, json, readJsonBody } from '@/server/http';
import { validateAssessmentRequest } from '@/server/validate';
import { planShipment } from '@/engine';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Adapter endpoint. Accepts a declaration as an ATLP/MAMAR adapter would map it, runs the engine
 * and returns the result. It never writes: nothing is added to the world, ledger or any file.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    const read = await readJsonBody(request, MAX_BODY_BYTES);
    if (read instanceof Response) return read;
    const body = read.body;

    const { world, g, now } = getWorld();
    const v = validateAssessmentRequest(body, {
      traderIds: new Set(Object.keys(g.directory.traders)),
      forwarderIds: new Set(Object.keys(g.directory.forwarders)),
      now,
      idPrefix: 'ASSESS-1',
    });
    if (!v.ok) return errorResponse(422, 'validation_failed', `Request body has ${v.issues.length} problem(s).`, v.issues);

    const plan = planShipment(world, g.directory, v.shipment, now);
    return json({
      persisted: false,
      evaluatedAt: now,
      shipment: v.shipment,
      requirements: plan.instances.map((i) => ({ ...i, label: g.directory.requirementById[i.requirementId]?.label })),
      evidenceChecks: plan.checks,
      reviewPlan: plan.reviewPlan,
      assessment: plan.assessment,
    });
  }, { scope: 'assessments:write' });
}
