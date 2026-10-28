import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as listTasksRoute } from '@/app/api/v1/inspection-tasks/route';
import { POST as postResult } from '@/app/api/v1/inspection-tasks/[id]/result/route';
import type { MadounEvent } from '@/engine';
import { eventStore, gatewayWorld, resetGatewayStore } from '@/server/inspection-gateway';
import { FileEventStore, MemoryEventStore, openStore, type EventStore } from '@/server/store';
import { SqliteEventStore } from '@/server/store/sqlite';
import { simulateCell, type Task } from '../gateway/robot';

const ev = (n: number): MadounEvent => ({ type: 'ExceptionResolved', at: `2026-01-0${n}T00:00:00.000Z`, shipmentId: `S${n}`, exceptionId: `E${n}`, by: 'test' } as unknown as MadounEvent);

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'madoun-store-')); });
afterEach(() => { resetGatewayStore(); fs.rmSync(dir, { recursive: true, force: true }); });

const adapters: [string, () => EventStore, () => EventStore][] = [
  ['memory', () => new MemoryEventStore(), () => new MemoryEventStore()],
  ['file', () => new FileEventStore(path.join(dir, 'e.jsonl')), () => new FileEventStore(path.join(dir, 'e.jsonl'))],
  ['sqlite', () => new SqliteEventStore(path.join(dir, 'e.db')), () => new SqliteEventStore(path.join(dir, 'e.db'))],
];

describe.each(adapters)('event store contract: %s', (name, make, reopen) => {
  it('starts empty and stores events in order with gapless positions', () => {
    const s = make();
    expect(s.version()).toBe(0);
    expect(s.append([ev(1), ev(2)])).toEqual({ ok: true, seqs: [1, 2], version: 2, duplicate: false });
    expect(s.append([ev(3)])).toMatchObject({ ok: true, seqs: [3], version: 3 });
    expect(s.read().map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(s.read(2).map((r) => r.seq)).toEqual([3]);
    expect(s.read()[0].event).toEqual(ev(1));
    s.close();
  });

  it('refuses an append whose expected version is stale and stores nothing', () => {
    const s = make();
    s.append([ev(1)]);
    expect(s.append([ev(2)], { expectedVersion: 0 })).toEqual({ ok: false, reason: 'version_conflict', version: 1 });
    expect(s.version()).toBe(1);
    expect(s.append([ev(2)], { expectedVersion: 1 })).toMatchObject({ ok: true });
    s.close();
  });

  it('makes a retried append with the same key a no op that reports the first positions', () => {
    const s = make();
    const first = s.append([ev(1), ev(2)], { idempotencyKey: 'k1' });
    const again = s.append([ev(3)], { idempotencyKey: 'k1' });
    expect(first).toMatchObject({ ok: true, seqs: [1, 2], duplicate: false });
    expect(again).toEqual({ ok: true, seqs: [1, 2], version: 2, duplicate: true });
    expect(s.version()).toBe(2);
    s.close();
  });

  it('keeps events and keys after it is closed and opened again', function () {
    if (name === 'memory') return; // a memory store has nothing to reopen
    const s = make();
    s.append([ev(1), ev(2)], { idempotencyKey: 'k1' });
    s.close();
    const r = reopen();
    expect(r.version()).toBe(2);
    expect(r.read().map((x) => x.event)).toEqual([ev(1), ev(2)]);
    expect(r.append([ev(3)], { idempotencyKey: 'k1' })).toEqual({ ok: true, seqs: [1, 2], version: 2, duplicate: true });
    r.close();
  });
});

describe('file store failure handling', () => {
  it('ignores a torn last line and writes the next event over it', () => {
    const file = path.join(dir, 'torn.jsonl');
    const s = new FileEventStore(file);
    s.append([ev(1)]);
    s.close();
    fs.appendFileSync(file, '{"seq":2,"event":{"type":"Exce'); // a crash in the middle of a write
    const r = new FileEventStore(file);
    expect(r.version()).toBe(1);
    r.append([ev(2)]);
    r.close();
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l).seq)).toEqual([1, 2]);
  });

  it('refuses to open a log with a corrupt complete line or a gap', () => {
    const bad = path.join(dir, 'bad.jsonl');
    fs.writeFileSync(bad, '{"seq":1,"event":{}}\nnot json\n');
    expect(() => new FileEventStore(bad)).toThrow(/corrupt/);
    const gap = path.join(dir, 'gap.jsonl');
    fs.writeFileSync(gap, '{"seq":1,"event":{}}\n{"seq":3,"event":{}}\n');
    expect(() => new FileEventStore(gap)).toThrow(/gap or repeat/);
  });
});

describe('store selection', () => {
  it('defaults to memory and understands file and sqlite', () => {
    expect(openStore(undefined).kind).toBe('memory');
    expect(openStore('memory').kind).toBe('memory');
    const f = openStore(`file:${path.join(dir, 'a.jsonl')}`);
    expect(f.kind).toBe('file');
    f.close();
    const q = openStore(`sqlite:${path.join(dir, 'a.db')}`);
    expect(q.kind).toBe('sqlite');
    q.close();
  });

  it('rejects an unknown kind and a missing path', () => {
    expect(() => openStore('redis:x')).toThrow(/not one of/);
    expect(() => openStore('file')).toThrow(/needs a path/);
  });
});

describe('the gateway survives a restart when its store is durable', () => {
  const task = async (): Promise<Task> => ((await (await listTasksRoute(new Request('http://localhost/api/v1/inspection-tasks?pageSize=1'))).json()) as { data: Task[] }).data[0];
  const submit = (t: Task) => postResult(
    new Request(`http://localhost/api/v1/inspection-tasks/${t.id}/result`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...simulateCell(t, 1), findings: [{ kind: 'none', severity: 'info', note: 'Nothing found' }] }) }),
    { params: Promise.resolve({ id: t.id }) },
  );

  it.each(['file', 'sqlite'])('keeps a posted result after the %s store is reopened', async (kind) => {
    const target = path.join(dir, kind === 'file' ? 'g.jsonl' : 'g.db');
    resetGatewayStore(openStore(`${kind}:${target}`));
    const t = await task();
    expect((await submit(t)).status).toBe(201);
    const before = gatewayWorld().receipts.length;

    resetGatewayStore(openStore(`${kind}:${target}`)); // the process restarted
    expect(gatewayWorld().receipts.length).toBe(before);
    expect(gatewayWorld().shipments[t.shipmentId].inspectionResult).toBeDefined();
    expect((await submit(t)).status).toBe(409);
    expect(eventStore().version()).toBeGreaterThan(0);
  });
});
