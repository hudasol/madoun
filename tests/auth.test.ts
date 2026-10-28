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
