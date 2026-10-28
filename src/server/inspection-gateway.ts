import {
  createInspectionTask, replay, requiresOfficerConfirmation, resultToReceiptDraft, validateEvent,
  type InspectionResult, type InspectionTask, type MadounEvent, type ShipmentFile, type World,
} from '@/engine';
import { getWorld } from './world';
import { MemoryEventStore, openStore, type EventStore } from './store';

/**
 * Inspection gateway events. Results posted by a gateway (a robot, drone or scanner adapter) are appended
 * to an event store and layered over the read-only synthetic world for the inspection task and ledger
 * routes. The other API routes keep serving the unmodified synthetic snapshot.
 *
 * The store is chosen by MADOUN_STORE (src/server/store). By default it is memory: lost on restart and
 * not shared between instances. `file:<path>` or `sqlite:<path>` keep the events across restarts for one
 * server process or machine. A deployment with several machines needs a networked store, which this
 * repository does not provide (docs/limitations.md).
 */
const KEY = Symbol.for('madoun.api.inspection-gateway');
type Holder = { [KEY]?: EventStore };

export function eventStore(): EventStore {
  const h = globalThis as unknown as Holder;
  return (h[KEY] ??= openStore());
}

/** Replaces the store with an empty in-memory one, closing the old one. Used by tests. */
export function resetGatewayStore(next: EventStore = new MemoryEventStore()): void {
  const h = globalThis as unknown as Holder;
  h[KEY]?.close();
  h[KEY] = next;
}

/** The synthetic world at the snapshot time with every accepted gateway event applied. */
export function gatewayWorld(): World {
  return replay(eventStore().read().map((r) => r.event), getWorld().world);
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

const CONFLICT = 'Another result was recorded at the same time. Read the task again and retry.';

/**
 * Records a validated result for an open task: the task (if it was only derived), the result and its
 * evidence receipt. A serious machine finding produces a pending receipt that waits for an officer.
 * The gateway never records a learning outcome; that stays a customs action after confirmation.
 * Every event passes validateEvent first; nothing is stored unless all of them pass.
 */
export function submitResult(task: InspectionTask, result: InspectionResult): SubmitOutcome {
  const store = eventStore();
  const version = store.version();
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
  const stored = store.append(events, { expectedVersion: version, idempotencyKey: `result:${task.id}` });
  if (!stored.ok) return { ok: false, problems: [CONFLICT] };
  return { ok: true, result, awaitingOfficerConfirmation: requiresOfficerConfirmation(result), world: w };
}
