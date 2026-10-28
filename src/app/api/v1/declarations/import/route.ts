import { getWorld } from '@/server/world';
import { errorResponse, handle, json, readCappedText } from '@/server/http';
import { IMPORT_LIMITS, csvToPayloads } from '@/server/import';
import { validateAssessmentRequest, type ValidationIssue } from '@/server/validate';
import { planShipment } from '@/engine';

/**
 * Batch assessment of declarations supplied as CSV (one row per item, see docs/import.md) or as a JSON
 * array of the same payload POST /assessments takes. Every declaration is validated and assessed on its
 * own and answered on its own; nothing is stored. Send `Content-Type: text/csv` or `application/json`.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    const type = (request.headers.get('content-type') ?? '').toLowerCase();
    const text = await readCappedText(request, IMPORT_LIMITS.bytes);
    if (text instanceof Response) return text;

    let payloads: { declarationRef: string; payload: unknown }[];
    if (type.includes('csv')) {
      const parsed = csvToPayloads(text);
      if (!parsed.ok) return errorResponse(422, 'validation_failed', `The file has ${parsed.issues.length} problem(s).`, parsed.issues);
      payloads = parsed.payloads;
    } else if (type.includes('json')) {
      let body: unknown;
      try { body = JSON.parse(text); } catch { return errorResponse(400, 'invalid_json', 'Body is not valid JSON.'); }
      if (!Array.isArray(body) || body.length === 0) return errorResponse(422, 'validation_failed', 'Body must be a non-empty JSON array of declarations.');
      if (body.length > IMPORT_LIMITS.declarations) return errorResponse(422, 'validation_failed', `At most ${IMPORT_LIMITS.declarations} declarations per import.`);
      payloads = body.map((p, i) => ({ declarationRef: typeof p?.declarationRef === 'string' ? p.declarationRef : `#${i + 1}`, payload: p }));
    } else {
      return errorResponse(415, 'unsupported_media_type', "Content-Type must be 'text/csv' or 'application/json'.");
    }

    const { world, g, now } = getWorld();
    const ctx = { traderIds: new Set(Object.keys(g.directory.traders)), forwarderIds: new Set(Object.keys(g.directory.forwarders)), now };
    const results = payloads.map(({ declarationRef, payload }, i) => {
      const v = validateAssessmentRequest(payload, { ...ctx, idPrefix: `IMPORT-${i + 1}` });
      if (!v.ok) return { declarationRef, accepted: false as const, issues: v.issues as ValidationIssue[] };
      const plan = planShipment(world, g.directory, v.shipment, now);
      return {
        declarationRef,
        accepted: true as const,
        lane: plan.assessment.lane,
        pathway: plan.assessment.pathway,
        assessment: plan.assessment,
        unsatisfiedEvidence: plan.checks.filter((c) => !c.verdict.startsWith('satisfied')).length,
      };
    });
    const accepted = results.filter((r) => r.accepted).length;
    return json({ persisted: false, evaluatedAt: now, total: results.length, accepted, rejected: results.length - accepted, results });
  }, { scope: 'assessments:write' });
}
