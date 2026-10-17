import fc from 'fast-check';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listTasksRoute } from '@/app/api/v1/inspection-tasks/route';
import { POST as postResult } from '@/app/api/v1/inspection-tasks/[id]/result/route';
import { apply, inspectionReceiptId, outcomeFromInspection, validateEvent, type MadounEvent } from '@/engine';
import { gatewayWorld, resetGatewayStore } from '@/server/inspection-gateway';
import { validateInspectionResultRequest } from '@/server/validate';
import { getWorld } from '@/server/world';
import { pollOnce, simulateCell, type Fetch, type ResultBody, type Task } from '../gateway/robot';

const BASE = 'http://localhost';

/** Routes a gateway request to the route handlers directly: no server, no network. */
const fetchToHandlers: Fetch = async (url, init) => {
  const u = new URL(url);
  const req = new Request(u, { method: init?.method ?? 'GET', headers: init?.headers, body: init?.body });
  const m = u.pathname.match(/^\/api\/v1\/inspection-tasks\/([^/]+)\/result$/);
  if (m) return postResult(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]) }) });
  if (u.pathname === '/api/v1/inspection-tasks') return listTasksRoute(req);
  throw new Error(`no route for ${u.pathname}`);
};

const openTasks = async (): Promise<Task[]> => {
  const res = await listTasksRoute(new Request(`${BASE}/api/v1/inspection-tasks?status=open&pageSize=100`));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Task[] }).data;
};
const post = (id: string, body: string, headers: Record<string, string> = {}) =>
  postResult(new Request(`${BASE}/api/v1/inspection-tasks/${id}/result`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }), { params: Promise.resolve({ id }) });

const serious = (t: Task): ResultBody => ({
  ...simulateCell(t, 1),
  findings: [{ kind: 'undeclared-goods', severity: 'major', note: 'Undeclared pallets behind the declared load' }],
});
const clean = (t: Task): ResultBody => ({ ...simulateCell(t, 1), seal: { id: 'SEAL-X', intact: true }, findings: [{ kind: 'none', severity: 'info', note: 'Nothing found' }] });

beforeEach(() => resetGatewayStore());

describe('inspection gateway: task to result to officer confirmation', () => {
  it('lists open red lane tasks in a stable order', async () => {
    const tasks = await openTasks();
    expect(tasks.length).toBeGreaterThan(0);
    const w = getWorld().world;
    for (const t of tasks) {
      const f = w.shipments[t.shipmentId];
      expect(f.cleared).toBeUndefined();
      expect(f.override?.lane ?? f.assessment?.lane).toBe('red');
      expect(f.inspectionResult).toBeUndefined();
    }
    expect((await openTasks()).map((t) => t.id)).toEqual(tasks.map((t) => t.id));
    expect((await listTasksRoute(new Request(`${BASE}/api/v1/inspection-tasks?status=closed`))).status).toBe(400);
  });

  it('a serious machine finding is stored as pending and becomes verified only after an officer upholds it', async () => {
    const [task] = await openTasks();
    const res = await post(task.id, JSON.stringify(serious(task)));
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(b.persisted).toBe(false);
    expect(b.awaitingOfficerConfirmation).toBe(true);
    expect(b.receipt.status).toBe('pending');
    expect(b.result.media.every((m: { sha256: string }) => /^[0-9a-f]{64}$/.test(m.sha256))).toBe(true);

    // The task is no longer open, a second post conflicts, and the synthetic snapshot itself is untouched.
    expect((await openTasks()).some((t) => t.id === task.id)).toBe(false);
    expect((await post(task.id, JSON.stringify(serious(task)))).status).toBe(409);
    expect(getWorld().world.shipments[task.shipmentId].inspectionResult).toBeUndefined();

    let w = gatewayWorld();
    const f = w.shipments[task.shipmentId];
    const outcome: MadounEvent = { type: 'OutcomeRecorded', at: f.inspectionResult!.completedAt, outcome: outcomeFromInspection(f.shipment, f.assessment!, f.inspectionResult, [], f.inspectionResult!.completedAt) };
    expect(validateEvent(w, outcome)).not.toEqual([]);

    const confirm: MadounEvent = { type: 'InspectionConfirmed', at: f.inspectionResult!.completedAt, shipmentId: task.shipmentId, officerId: 'adc:officer-7', decision: 'upheld', note: 'Opened the container and counted the pallets' };
    expect(validateEvent(w, confirm)).toEqual([]);
    w = apply(w, confirm);
    expect(w.receipts.find((r) => r.id === inspectionReceiptId(task.id))?.status).toBe('verified');
    expect(validateEvent(w, { ...outcome, outcome: { ...(outcome as Extract<MadounEvent, { type: 'OutcomeRecorded' }>).outcome } })).toEqual([]);
  });

  it('a clean result is verified evidence straight away', async () => {
    const [task] = await openTasks();
    const b = await (await post(task.id, JSON.stringify(clean(task)))).json();
    expect(b.awaitingOfficerConfirmation).toBe(false);
    expect(b.receipt.status).toBe('verified');
  });

  it('the reference gateway drives the whole loop through the route handlers', async () => {
    const before = (await openTasks()).length;
    const report = await pollOnce(fetchToHandlers, BASE, { seed: 7, max: 3 });
    expect(report.polled).toBe(before);
    expect(report.posted).toHaveLength(Math.min(3, before));
    expect(report.posted.every((p) => p.status === 201)).toBe(true);
    expect((await openTasks()).length).toBe(before - report.posted.length);
    const completed = await (await listTasksRoute(new Request(`${BASE}/api/v1/inspection-tasks?status=completed&pageSize=100`))).json();
    for (const p of report.posted) expect(completed.data.some((t: Task) => t.id === p.taskId)).toBe(true);
  });

  it('the gateway is deterministic and its media digests are real SHA-256 values', async () => {
    const [task] = await openTasks();
    expect(simulateCell(task, 7)).toEqual(simulateCell(task, 7));
    expect(simulateCell(task, 7).media.map((m) => m.sha256)).not.toEqual(simulateCell(task, 8).media.map((m) => m.sha256));
  });

  it('the gateway imports nothing but Node built-ins', () => {
    const src = fs.readFileSync('gateway/robot.ts', 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).toMatch(/^node:/);
  });
});

describe('inspection result limits and strictness', () => {
  it('404 for an unknown task, 415 for the wrong content type, 400 for malformed JSON', async () => {
    const [task] = await openTasks();
    expect((await post('insp-NOPE', '{}')).status).toBe(404);
    expect((await post(task.id, '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    const bad = await post(task.id, '{nope');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('invalid_json');
  });

  it('413 on declared size and on multi-byte bodies over the byte cap', async () => {
    const [task] = await openTasks();
    expect((await post(task.id, '{}', { 'content-length': '999999' })).status).toBe(413);
    // 40k Arabic letters are 40k characters but 80k bytes, over the 64 KiB cap.
    expect((await post(task.id, JSON.stringify({ x: 'م'.repeat(40_000) }))).status).toBe(413);
  });

  it('422 with paths for unknown fields at every level and for schema errors', async () => {
    const [task] = await openTasks();
    const body = serious(task) as unknown as Record<string, unknown>;
    const res = await post(task.id, JSON.stringify({
      ...body,
      surprise: 1,
      performerKind: 'android',
      completedAt: '2020-01-01T00:00:00Z',
      seal: { id: 'S', intact: 'yes', colour: 'red' },
      findings: [{ kind: 'none', severity: 'major', note: 'x', extra: true }],
      media: [{ ref: 'a', sha256: 'XYZ', bytes: -1 }],
    }));
    expect(res.status).toBe(422);
    const b = await res.json();
    expect(b.error.code).toBe('validation_failed');
    const paths = b.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining([
      'surprise', 'performerKind', 'completedAt', 'seal.intact', 'seal.colour', 'findings[0].severity', 'findings[0].extra',
      'media[0].sha256', 'media[0].bytes',
    ]));
  });

  it('caps findings and media and requires at least one finding', async () => {
    const [task] = await openTasks();
    const b = serious(task);
    const many = (n: number) => Array.from({ length: n }, () => b.findings[0]);
    expect((await post(task.id, JSON.stringify({ ...b, findings: many(51) }))).status).toBe(422);
    expect((await post(task.id, JSON.stringify({ ...b, findings: [] }))).status).toBe(422);
    expect((await post(task.id, JSON.stringify({ ...b, media: Array.from({ length: 21 }, () => b.media[0]) }))).status).toBe(422);
    expect((await post(task.id, JSON.stringify(b))).status).toBe(201);
  });

  it('the validator never throws on arbitrary JSON', async () => {
    const [task] = await openTasks();
    const now = getWorld().now;
    fc.assert(fc.property(fc.jsonValue(), (v) => {
      const r = validateInspectionResultRequest(v, { task: task as never, now });
      return r.ok === true || r.issues.length > 0;
    }), { numRuns: 300 });
  });
});
