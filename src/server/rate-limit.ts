/**
 * In-memory token bucket rate limiter for the mock API.
 *
 * PER INSTANCE ONLY. Buckets live in the memory of one server process: they reset on restart, are not
 * shared between instances, and a client spread over several instances gets each instance's allowance.
 * The client key is the authenticated client id when auth exists (today always 'anonymous-mock') plus
 * the first X-Forwarded-For address, which a client can forge; in production the limit belongs at the
 * gateway in front of the API, keyed on the authenticated service identity (docs/threat-model.md).
 */

export interface BucketPolicy {
  /** Largest burst a client may send. */
  capacity: number;
  /** Tokens added per second, up to capacity. */
  refillPerSecond: number;
}

/** Reads are cheap and the UI scans call many; writes (POST) run the engine or change the gateway store. */
export const POLICIES: Record<'read' | 'write', BucketPolicy> = {
  read: { capacity: 600, refillPerSecond: 100 },
  write: { capacity: 120, refillPerSecond: 20 },
};

/** Clients tracked at most; the least recently seen is dropped first so memory stays bounded. */
export const MAX_CLIENTS = 10_000;

export class TokenBucketLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private policy: BucketPolicy, private maxClients = MAX_CLIENTS) {}

  /** Takes one token for `key` at time `nowMs`. Returns whether the request may proceed and, if not, seconds until it may. */
  take(key: string, nowMs: number): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const { capacity, refillPerSecond } = this.policy;
    const b = this.buckets.get(key) ?? { tokens: capacity, at: nowMs };
    const elapsed = Math.max(0, nowMs - b.at) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSecond);
    b.at = nowMs;
    this.buckets.delete(key); // re-insert so Map order tracks recency
    this.buckets.set(key, b);
    if (this.buckets.size > this.maxClients) this.buckets.delete(this.buckets.keys().next().value!);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true };
    }
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSecond)) };
  }

  get size() { return this.buckets.size; }
}

const KEY = Symbol.for('madoun.api.rate-limit');
type Holder = { [KEY]?: Record<'read' | 'write', TokenBucketLimiter> };

/** Shared by every route bundle in one server process. */
export function limiters(): Record<'read' | 'write', TokenBucketLimiter> {
  const h = globalThis as unknown as Holder;
  return (h[KEY] ??= { read: new TokenBucketLimiter(POLICIES.read), write: new TokenBucketLimiter(POLICIES.write) });
}

export function resetRateLimits(): void {
  delete (globalThis as unknown as Holder)[KEY];
  clock = () => Date.now();
}

/** The limiter's clock. The server layer may read time; tests freeze it so refill does not depend on machine speed. */
let clock: () => number = () => Date.now();
export const rateLimitNow = () => clock();
export function setRateLimitClock(fn: () => number): void {
  clock = fn;
}

export function clientKey(request: Request, clientId: string): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return `${clientId}|${fwd.slice(0, 64)}`;
}
