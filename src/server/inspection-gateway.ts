import {
  createInspectionTask, replay, requiresOfficerConfirmation, resultToReceiptDraft, validateEvent,
  type InspectionResult, type InspectionTask, type MadounEvent, type ShipmentFile, type World,
} from '@/engine';
import { getWorld } from './world';

/**
 * MOCK INSPECTION GATEWAY STORE. IN MEMORY AND NOT PERSISTENT.
 *
 * Results posted by an inspection gateway (a robot, drone or scanner adapter) are appended as events to
 * a list held in this server process only. They are layered over the read-only synthetic world for the
 * inspection task routes, are lost on restart, and are not shared between server instances. The other
 * API routes keep serving the unmodified synthetic snapshot. A real deployment needs a durable,
 * replicated event store and authenticated device identities (docs/threat-model.md).
 */
interface GatewayStore { events: MadounEvent[] }
const KEY = Symbol.for('madoun.api.inspection-gateway');
type Holder = { [KEY]?: GatewayStore };

function store(): GatewayStore {
  const h = globalThis as unknown as Holder;
  return (h[KEY] ??= { events: [] });
}

/** Clears the in-memory store. Used by tests. */
export function resetGatewayStore(): void {
  store().events = [];
}

/** The synthetic world at the snapshot time with every accepted gateway event applied. */
export function gatewayWorld(): World {
  return replay(store().events, getWorld().world);
}

const laneOf = (f: ShipmentFile) => f.override?.lane ?? f.assessment?.lane;

/** The task a red lane file has (or would be given now). */
function taskFor(f: ShipmentFile, now: string): InspectionTask | undefined {
  if (f.inspectionTask) return f.inspectionTask;
  return f.assessment ? createInspectionTask(f.shipment, f.assessment, now) : undefined;
}

/**
 * Open tasks: shipments still in flight whose effective lane is red and that have no inspection result
 * yet, the same set the Inspection page lists as waiting for a physical inspection. Completed tasks are
 * those with a result. Ordered by request time, then id, so paging is stable.
 */
export function listTasks(world: World, now: string, status: 'open' | 'completed'): InspectionTask[] {
  const out: InspectionTask[] = [];
  for (const f of Object.values(world.shipments)) {
    if (status === 'open' && (f.cleared || f.inspectionResult || laneOf(f) !== 'red')) continue;
    if (status === 'completed' && !f.inspectionResult) continue;
    const t = taskFor(f, now);
    if (t) out.push(t);
  }
  return out.sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt) || a.id.localeCompare(b.id));
}

export type SubmitOutcome =
  | { ok: true; result: InspectionResult; awaitingOfficerConfirmation: boolean; world: World }
  | { ok: false; problems: string[] };

/**
 * Records a validated result for an open task: the task (if it was only derived), the result and its
 * evidence receipt. A serious machine finding produces a pending receipt that waits for an officer.
 * The gateway never records a learning outcome; that stays a customs action after confirmation.
 * Every event passes validateEvent first; nothing is stored unless all of them pass.
 */
export function submitResult(task: InspectionTask, result: InspectionResult): SubmitOutcome {
  let w = gatewayWorld();
  const f = w.shipments[task.shipmentId];
  const events: MadounEvent[] = [];
  if (!f?.inspectionTask) events.push({ type: 'InspectionRequested', at: task.requestedAt, task });
  events.push({ type: 'InspectionCompleted', at: result.completedAt, result });
  events.push({ type: 'ReceiptIssued', at: result.completedAt, receipt: resultToReceiptDraft(result) });
  for (const e of events) {
    const problems = validateEvent(w, e);
    if (problems.length) return { ok: false, problems };
    w = replay([e], w);
  }
  store().events.push(...events);
  return { ok: true, result, awaitingOfficerConfirmation: requiresOfficerConfirmation(result), world: w };
}
