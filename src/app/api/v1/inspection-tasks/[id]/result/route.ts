import { getWorld } from '@/server/world';
import { errorResponse, handle, json, notFound, readJsonBody } from '@/server/http';
import { gatewayWorld, listTasks, storeInfo, submitResult } from '@/server/inspection-gateway';
import { validateInspectionResultRequest } from '@/server/validate';
import { inspectionReceiptId } from '@/engine';

/** A result carries notes and media digests, not media, so 64 KiB is ample. */
const MAX_RESULT_BYTES = 64 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/**
 * A gateway posts the result of an open inspection task. Stored in the configured event store
 * (memory by default, lost on restart). A serious machine finding waits for a customs officer.
 */
export async function POST(request: Request, ctx: Ctx) {
  return handle(request, async ({ caller }) => {
    const { id } = await ctx.params;
    const now = getWorld().now;
    const world = gatewayWorld();
    const task = listTasks(world, now, 'open').find((t) => t.id === id);
    if (!task) {
      if (listTasks(world, now, 'completed').some((t) => t.id === id)) {
        return errorResponse(409, 'conflict', `Inspection task '${id}' already has a result.`);
      }
      return notFound('Open inspection task', id);
    }
    const read = await readJsonBody(request, MAX_RESULT_BYTES);
    if (read instanceof Response) return read;
    const v = validateInspectionResultRequest(read.body, { task, now });
    if (!v.ok) return errorResponse(422, 'validation_failed', `Request body has ${v.issues.length} problem(s).`, v.issues);
    // A gateway key may only report as itself, so one device cannot answer for another.
    if (caller.role === 'gateway' && v.result.performedBy !== caller.id) {
      return errorResponse(422, 'validation_failed', 'The result was rejected.', [{ path: 'performedBy', message: `Must equal the id of the key making the request ('${caller.id}').` }]);
    }
    const out = submitResult(task, v.result);
    if (!out.ok && out.conflict) return errorResponse(409, 'conflict', out.problems[0]);
    if (!out.ok) {
      return errorResponse(422, 'validation_failed', 'The result was rejected by the engine.', out.problems.map((message) => ({ path: '$', message })));
    }
    const receipt = out.world.receipts.find((r) => r.id === inspectionReceiptId(task.id));
    return json(
      {
        ...storeInfo(),
        task,
        result: out.result,
        receipt,
        awaitingOfficerConfirmation: out.awaitingOfficerConfirmation,
        next: out.awaitingOfficerConfirmation
          ? 'A customs officer must uphold or overturn this finding, in the officer interface, before it becomes verified evidence or a learning outcome.'
          : 'Recorded as verified evidence.',
      },
      201,
    );
  }, { scope: 'tasks:write' });
}
