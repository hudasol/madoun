import { afterEach, describe, expect, it } from 'vitest';
import { POST as assess } from '@/app/api/v1/assessments/route';
import { GET as health } from '@/app/api/v1/health/route';
import { POLICIES, TokenBucketLimiter, clientKey, resetRateLimits, setRateLimitClock } from '@/server/rate-limit';

describe('token bucket', () => {
  it('allows a burst up to capacity, then refuses with a retry time', () => {
    const l = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 1 });
    expect([0, 0, 0].map(() => l.take('a', 1000).allowed)).toEqual([true, true, true]);
    const denied = l.take('a', 1000);
    expect(denied).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('refills over time, never above capacity', () => {
    const l = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 2 });
    l.take('a', 0); l.take('a', 0);
    expect(l.take('a', 0).allowed).toBe(false);
    expect(l.take('a', 500).allowed).toBe(true);
    expect(l.take('a', 500).allowed).toBe(false);
    // A long pause refills to capacity, not beyond it.
    expect([0, 0, 0].map(() => l.take('a', 60_000).allowed)).toEqual([true, true, false]);
  });

  it('keeps clients independent and ignores a clock that goes backwards', () => {
    const l = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(l.take('a', 5000).allowed).toBe(true);
    expect(l.take('b', 5000).allowed).toBe(true);
    expect(l.take('a', 1000).allowed).toBe(false);
  });

  it('bounds memory by dropping the least recently seen client', () => {
    const l = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 }, 100);
    for (let i = 0; i < 250; i++) l.take(`c${i}`, 0);
    expect(l.size).toBe(100);
  });

  it('keys on client id and the first forwarded address, truncated', () => {
    const r = new Request('http://x', { headers: { 'x-forwarded-for': ' 10.0.0.1 , 10.0.0.2' } });
    expect(clientKey(r, 'anon')).toBe('anon|10.0.0.1');
    expect(clientKey(new Request('http://x', { headers: { 'x-forwarded-for': 'a'.repeat(500) } }), 'anon').length).toBeLessThan(80);
  });
});

describe('API rate limiting (per instance)', () => {
  afterEach(() => resetRateLimits());

  it('answers 429 with Retry-After and the standard error shape once the write allowance is spent, while reads continue', async () => {
    resetRateLimits();
    setRateLimitClock(() => 1_000_000); // frozen: no refill while the loop runs, however slow the machine
    const post = () => assess(new Request('http://x/api/v1/assessments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: '{nope' }));
    const statuses: number[] = [];
    for (let i = 0; i < POLICIES.write.capacity + 5; i++) statuses.push((await post()).status);
    expect(statuses.slice(0, POLICIES.write.capacity).every((s) => s === 400)).toBe(true);
    const last = await post();
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(last.headers.get('X-Madoun-Synthetic')).toBe('true');
    expect((await last.json()).error.code).toBe('rate_limited');
    expect((await health(new Request('http://x/api/v1/health', { headers: { 'x-forwarded-for': '203.0.113.9' } }))).status).toBe(200);
    // Another client is unaffected.
    const other = await assess(new Request('http://x/api/v1/assessments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' }, body: '{nope' }));
    expect(other.status).toBe(400);
  });
});
