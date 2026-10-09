import { getWorld } from '@/server/world';
import { errorResponse, handle, json } from '@/server/http';
import { validateAssessmentRequest } from '@/server/validate';
import { planShipment } from '@/engine';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Adapter endpoint. Accepts a declaration as an ATLP/MAMAR adapter would map it, runs the engine
 * and returns the result. It never writes: nothing is added to the world, ledger or any file.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    const ct = request.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('json')) {
      return errorResponse(415, 'unsupported_media_type', "Content-Type must be 'application/json'.");
    }
    // Reject on the declared size before reading anything, then re-check the bytes actually received.
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', `Body must be at most ${MAX_BODY_BYTES} bytes.`);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return errorResponse(413, 'payload_too_large', `Body must be at most ${MAX_BODY_BYTES} bytes.`);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return errorResponse(400, 'invalid_json', 'Body is not valid JSON.');
    }

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
  });
}
