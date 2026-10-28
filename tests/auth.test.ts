import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { GET as health } from '@/app/api/v1/health/route';
import { GET as listReceipts } from '@/app/api/v1/receipts/route';
import { GET as getReceipt } from '@/app/api/v1/receipts/[id]/route';
import { GET as getProof } from '@/app/api/v1/receipts/[id]/proof/route';
import { GET as listShipments } from '@/app/api/v1/shipments/route';
import { GET as kpis } from '@/app/api/v1/kpis/route';
import { GET as metrics } from '@/app/api/v1/metrics/route';
import { POST as postResult } from '@/app/api/v1/inspection-tasks/[id]/result/route';
import { authenticate, canSeeReceipt, hashKey, parseKeyConfig, ROLE_SCOPES, type KeyEntry } from '@/server/auth';
import { logEnabled, logRequest } from '@/server/log';
import { renderMetrics, resetMetrics, routeTemplate } from '@/server/metrics';
import { clientKey, resetRateLimits } from '@/server/rate-limit';
import { getWorld } from '@/server/world';

const KEYS = {
  auth: 'mdn_authority-key-for-tests-0000000000000000',
  other: 'mdn_other-authority-key-for-tests-00000000000',
  auditor: 'mdn_auditor-key-for-tests-000000000000000000',
  gateway: 'mdn_gateway-key-for-tests-00000000000000000',
  ops: 'mdn_ops-key-for-tests-0000000000000000000000',
  operator: 'mdn_operator-key-for-tests-00000000000000000',
};
const config: KeyEntry[] = [
  { id: 'adc', sha256: hashKey(KEYS.auth), role: 'authority', authority: 'adc' },
  { id: 'other', sha256: hashKey(KEYS.other), role: 'authority', authority: 'no-such-authority' },
  { id: 'auditor', sha256: hashKey(KEYS.auditor), role: 'auditor' },
  { id: 'gw', sha256: hashKey(KEYS.gateway), role: 'gateway' },
  { id: 'ops', sha256: hashKey(KEYS.ops), role: 'ops' },
  { id: 'op', sha256: hashKey(KEYS.operator), role: 'operator' },
];

const url = (p: string) => `http://localhost/api/v1/${p}`;
const withKey = (p: string, key?: string, extra: Record<string, string> = {}) =>
  new Request(url(p), { headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra } });

beforeEach(() => {
  vi.stubEnv('MADOUN_AUTH', 'keys');
  vi.stubEnv('MADOUN_API_KEYS', JSON.stringify(config));
  vi.stubEnv('MADOUN_API_KEYS_FILE', '');
  resetRateLimits();
  resetMetrics();
});
afterEach(() => vi.unstubAllEnvs());

describe('key configuration', () => {
  it('accepts a valid configuration', () => {
    expect('entries' in parseKeyConfig(config)).toBe(true);
  });

  it.each([
    ['not an array', {}],
    ['empty', []],
    ['bad id', [{ id: 'X', sha256: 'a'.repeat(64), role: 'ops' }]],
    ['bad hash', [{ id: 'ok-id', sha256: 'zz', role: 'ops' }]],
    ['bad role', [{ id: 'ok-id', sha256: 'a'.repeat(64), role: 'root' }]],
    ['authority without an authority id', [{ id: 'ok-id', sha256: 'a'.repeat(64), role: 'authority' }]],
    ['unknown scope', [{ id: 'ok-id', sha256: 'a'.repeat(64), role: 'ops', scopes: ['everything'] }]],
    ['duplicate id', [{ id: 'dup-id', sha256: 'a'.repeat(64), role: 'ops' }, { id: 'dup-id', sha256: 'b'.repeat(64), role: 'ops' }]],
    ['duplicate hash', [{ id: 'one-id', sha256: 'a'.repeat(64), role: 'ops' }, { id: 'two-id', sha256: 'a'.repeat(64), role: 'ops' }]],
  ])('rejects %s', (_name, raw) => {
    expect('problems' in parseKeyConfig(raw)).toBe(true);
  });

  it('gives every role a non empty set of known scopes', () => {
    for (const scopes of Object.values(ROLE_SCOPES)) expect(scopes.length).toBeGreaterThan(0);
  });
});

describe('authentication', () => {
  it('is open in mode off and says who the caller is', () => {
    vi.stubEnv('MADOUN_AUTH', 'off');
    const r = authenticate(withKey('kpis'), 'kpis:read');
    expect(r.ok && r.caller.role).toBe('demo');
  });

  it('refuses a missing key with 401 and a challenge', async () => {
    const res = await kpis(withKey('kpis'));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Bearer/);
    expect((await res.json()).error.code).toBe('unauthorized');
  });

  it('refuses an unknown key and a key without the prefix', async () => {
    expect((await kpis(withKey('kpis', 'mdn_not-a-real-key-0000000000000000'))).status).toBe(401);
    expect((await kpis(withKey('kpis', 'plain-key'))).status).toBe(401);
  });

  it('accepts a known key and reports the auth mode', async () => {
    const res = await kpis(withKey('kpis', KEYS.ops));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Madoun-Auth')).toBe('keys');
  });

  it('answers 403 when the role lacks the scope', async () => {
    const res = await listShipments(withKey('shipments', KEYS.gateway));
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain('shipments:read');
  });

  it('keeps gateway keys to inspection tasks', async () => {
    const res = await postResult(new Request(url('inspection-tasks/x/result'), { method: 'POST', headers: { authorization: `Bearer ${KEYS.operator}`, 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ id: 'x' }) });
    expect(res.status).toBe(403);
  });

  it('refuses everything with 503 when the key configuration is invalid, never falling back to open', async () => {
    vi.stubEnv('MADOUN_API_KEYS', '{"broken":');
    const res = await kpis(withKey('kpis', KEYS.ops));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('auth_misconfigured');
    const none = await kpis(withKey('kpis'));
    expect(none.status).toBe(401);
  });

  it('refuses when no keys are configured at all', async () => {
    vi.stubEnv('MADOUN_API_KEYS', '');
    expect((await kpis(withKey('kpis', KEYS.ops))).status).toBe(503);
  });
});

describe('health', () => {
  it('is public, reports the mode and hides the dataset from anonymous callers', async () => {
    const res = await health(withKey('health'));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.auth.mode).toBe('keys');
    expect(b.dataset).toBeUndefined();
  });

  it('shows the dataset to a key with ops:read', async () => {
    const b = await (await health(withKey('health', KEYS.ops))).json();
    expect(b.dataset.shipments).toBe(getWorld().g.shipments.length);
  });

  it('reports a broken configuration as degraded with 503', async () => {
    vi.stubEnv('MADOUN_API_KEYS', 'nope');
    const res = await health(withKey('health'));
    expect(res.status).toBe(503);
    const b = await res.json();
    expect(b.status).toBe('degraded');
    expect(b.auth.problems.length).toBeGreaterThan(0);
  });

  it('warns when authentication is off', async () => {
    vi.stubEnv('MADOUN_AUTH', 'off');
    const b = await (await health(withKey('health'))).json();
    expect(b.auth.mode).toBe('off');
    expect(b.auth.warning).toContain('synthetic');
  });
});

describe('receipt visibility', () => {
  const receipts = () => getWorld().world.receipts;

  it('lets an auditor see every receipt and an operator none', async () => {
    const all = await (await listReceipts(withKey('receipts?pageSize=100', KEYS.auditor))).json();
    expect(all.page.total).toBe(receipts().length);
    expect((await listReceipts(withKey('receipts', KEYS.operator))).status).toBe(403);
  });

  it('limits an authority to what it issued or was given', async () => {
    const adc = await (await listReceipts(withKey('receipts?pageSize=100', KEYS.auth))).json();
    const expected = receipts().filter((r) => canSeeReceipt({ id: 'adc', role: 'authority', authority: 'adc', scopes: new Set() }, r)).length;
    expect(adc.page.total).toBe(expected);
    const none = await (await listReceipts(withKey('receipts', KEYS.other))).json();
    const open = receipts().filter((r) => r.sharedWith === 'all').length;
    expect(none.page.total).toBe(open);
  });

  it('answers 404, not 403, for a receipt the caller may not see', async () => {
    const hidden = receipts().find((r) => r.sharedWith !== 'all' && r.verifiedBy !== 'no-such-authority' && !r.sharedWith.includes('no-such-authority'));
    expect(hidden, 'the dataset has a restricted receipt').toBeDefined();
    const ctx = { params: Promise.resolve({ id: hidden!.id }) };
    expect((await getReceipt(withKey(`receipts/${hidden!.id}`, KEYS.other), ctx)).status).toBe(404);
    expect((await getProof(withKey(`receipts/${hidden!.id}/proof`, KEYS.other), ctx)).status).toBe(404);
    expect((await getReceipt(withKey(`receipts/${hidden!.id}`, KEYS.auditor), ctx)).status).toBe(200);
    expect((await getProof(withKey(`receipts/${hidden!.id}/proof`, KEYS.auditor), ctx)).status).toBe(200);
  });
});

describe('request ids, rate limiting and metrics', () => {
  it('echoes a well formed request id and replaces a malformed one', async () => {
    const good = await kpis(withKey('kpis', KEYS.ops, { 'x-request-id': 'trace-abc-12345' }));
    expect(good.headers.get('X-Request-Id')).toBe('trace-abc-12345');
    const bad = await kpis(withKey('kpis', KEYS.ops, { 'x-request-id': 'x y\n' }));
    expect(bad.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keys the rate limiter by caller, so one key cannot spend another key\'s budget', () => {
    const r = new Request(url('kpis'), { headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(clientKey(r, 'adc')).not.toBe(clientKey(r, 'gw'));
  });

  it('serves metrics only to ops:read and never records ids or keys', async () => {
    const id = getWorld().world.receipts[0].id;
    await getReceipt(withKey(`receipts/${id}`, KEYS.auditor), { params: Promise.resolve({ id }) });
    expect((await metrics(withKey('metrics', KEYS.auditor))).status).toBe(403);
    const res = await metrics(withKey('metrics', KEYS.ops));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('madoun_requests_total{method="GET",route="/api/v1/receipts/:id",status="200"} 1');
    expect(text).not.toContain(id);
    expect(text).not.toContain('mdn_');
  });

  it('reduces paths to route templates', () => {
    expect(routeTemplate('/api/v1/shipments/SHP-0005')).toBe('/api/v1/shipments/:id');
    expect(routeTemplate('/api/v1/receipts/abc/proof')).toBe('/api/v1/receipts/:id/proof');
    expect(renderMetrics()).toContain('madoun_uptime_seconds');
  });
});

describe('request log', () => {
  it('is off under test and on in production unless switched off', () => {
    expect(logEnabled({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(logEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(logEnabled({ NODE_ENV: 'production', MADOUN_LOG: 'off' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('writes one JSON line with no body, query or key', () => {
    const lines: string[] = [];
    logRequest({ requestId: 'r-12345678', clientId: 'adc', role: 'authority', method: 'GET', path: '/api/v1/kpis', status: 200, ms: 1.2 }, { MADOUN_LOG: 'json' } as unknown as NodeJS.ProcessEnv, (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    const o = JSON.parse(lines[0]);
    expect(o).toMatchObject({ event: 'api_request', clientId: 'adc', status: 200 });
    expect(Object.keys(o).sort()).toEqual(['clientId', 'event', 'method', 'ms', 'path', 'requestId', 'role', 'status', 't']);
  });
});

describe('key generator', () => {
  const run = (...a: string[]) => execFileSync('node', ['scripts/new-api-key.mjs', ...a], { encoding: 'utf8' });

  it('prints a key whose hash is the configured hash', () => {
    const out = run('--id', 'test-gateway', '--role', 'gateway');
    const key = /mdn_[A-Za-z0-9_-]{43}/.exec(out)![0];
    const entry = JSON.parse(out.slice(out.indexOf('{')));
    expect(entry.sha256).toBe(hashKey(key));
    expect('entries' in parseKeyConfig([entry])).toBe(true);
    expect(out.split(key).length - 1).toBe(1);
  });

  it('refuses an authority key without an authority id', () => {
    expect(() => run('--id', 'no-authority', '--role', 'authority')).toThrow(/authority/);
  });
});

describe('fixes from the independent review', () => {
  it('fails closed when MADOUN_AUTH is misspelled', async () => {
    for (const v of ['Keys', 'KEYS', 'on', 'true']) {
      vi.stubEnv('MADOUN_AUTH', v);
      expect((await kpis(withKey('kpis'))).status, v).toBe(401);
      expect((await kpis(withKey('kpis', KEYS.ops))).status, v).toBe(503);
      const h = await (await health(withKey('health'))).json();
      expect(h.status).toBe('degraded');
    }
  });

  it('does not buffer a chunked body past the cap', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(32);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { sent += chunk.length; c.enqueue(chunk); if (sent > 5_000_000) c.close(); } });
    const req = new Request(url('assessments'), { method: 'POST', headers: { authorization: `Bearer ${KEYS.operator}`, 'content-type': 'application/json' }, body, duplex: 'half' } as RequestInit);
    const { POST: assess } = await import('@/app/api/v1/assessments/route');
    const res = await assess(req);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(1_000_000); // stopped reading soon after 256 KiB
  });

  it('limits refused requests too', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 700; i++) statuses.push((await kpis(withKey('kpis', undefined, { 'x-forwarded-for': '198.51.100.7' }))).status);
    expect(statuses[0]).toBe(401);
    expect(statuses).toContain(429);
  });

  it('shows an authority key only its own exceptions and hides unshared receipts in shipment detail', async () => {
    const { GET: listExceptions } = await import('@/app/api/v1/exceptions/route');
    const { GET: shipment } = await import('@/app/api/v1/shipments/[id]/route');
    const ex = await (await listExceptions(withKey('exceptions?pageSize=100', KEYS.auth))).json();
    for (const e of ex.data) expect(e.authorityId).toBe('adc');
    const all = await (await listExceptions(withKey('exceptions?pageSize=100', KEYS.auditor))).json();
    expect(all.page.total).toBeGreaterThan(ex.page.total);

    const other = { id: 'x1', sha256: hashKey('mdn_x'), role: 'authority' as const, authority: 'adc', scopes: ['shipments:read' as const, 'receipts:read' as const] };
    vi.stubEnv('MADOUN_API_KEYS', JSON.stringify([...config, { ...other, sha256: hashKey('mdn_shipment-reader-key-0000000000000000') }]));
    const key = 'mdn_shipment-reader-key-0000000000000000';
    const world = getWorld();
    const visible = (id: string) => {
      const r = world.world.receipts.find((x) => x.id === id);
      return !r || canSeeReceipt({ id: 'x1', role: 'authority', authority: 'adc', scopes: new Set() }, r);
    };
    let hidden = 0;
    for (const s of world.g.shipments.slice(0, 80)) {
      const d = await (await shipment(withKey(`shipments/${s.id}`, key), { params: Promise.resolve({ id: s.id }) })).json();
      for (const c of d.evidenceChecks) {
        if (c.receiptId) expect(visible(c.receiptId), c.receiptId).toBe(true);
        else if (c.verdict === 'not-shared' && /custodian has not shared/.test(c.reason)) hidden++;
      }
    }
    expect(hidden).toBeGreaterThan(0);
  });

  it('numbers CSV rows by file line', async () => {
    const { csvToPayloads } = await import('@/server/import');
    const header = 'declarationRef,mode,carrier,conveyance,entryPoint,eta,traderId,forwarderId,invoiceRef,incoterm,currency,transportDocRef,hsCode,description,category,origin,value,quantity,packages';
    const r = csvToPayloads(`${header}\n\nA,sea,"multi\nline",c,e,2026-10-30T00:00:00Z,tr-01,fw-harbour,I,CIF,AED,T,85176200,d,wireless,KR,x,1,1`);
    expect(r.ok === false && r.issues[0]).toMatchObject({ row: 3, path: 'value' });
  });
});

describe('gateway identity and ledger consistency', () => {
  it('rejects a result reported under another device id and agrees across ledger routes after a result', async () => {
    const { GET: listTasks } = await import('@/app/api/v1/inspection-tasks/route');
    const { resetGatewayStore } = await import('@/server/inspection-gateway');
    const { simulateCell } = await import('../gateway/robot');
    resetGatewayStore();
    const task = (await (await listTasks(withKey('inspection-tasks?pageSize=1', KEYS.gateway))).json()).data[0];
    const send = (performedBy: string) => postResult(
      new Request(url(`inspection-tasks/${task.id}/result`), { method: 'POST', headers: { authorization: `Bearer ${KEYS.gateway}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...simulateCell(task, 1), performedBy, findings: [{ kind: 'none', severity: 'info', note: 'Nothing found' }] }) }),
      { params: Promise.resolve({ id: task.id }) },
    );
    expect((await send('someone-else')).status).toBe(422);
    const ok = await send('gw');
    expect(ok.status).toBe(201);
    const rid = (await ok.json()).receipt.id as string;
    const ctx = { params: Promise.resolve({ id: rid }) };
    expect((await getReceipt(withKey(`receipts/${rid}`, KEYS.auditor), ctx)).status).toBe(200);
    expect((await getProof(withKey(`receipts/${rid}/proof`, KEYS.auditor), ctx)).status).toBe(200);
    const { GET: verifyChain } = await import('@/app/api/v1/receipts/verify/route');
    const { GET: checkpoint } = await import('@/app/api/v1/ledger/checkpoint/route');
    const v = await (await verifyChain(withKey('receipts/verify', KEYS.auditor))).json();
    const c = await (await checkpoint(withKey('ledger/checkpoint', KEYS.auditor))).json();
    expect(v.length).toBe(c.checkpoint.treeSize);
    resetGatewayStore();
  });
});
