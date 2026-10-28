import { authenticate, authMode, type Caller, type Scope } from './auth';
import { logRequest } from './log';
import { recordRequest } from './metrics';
import { clientKey, limiters, rateLimitNow } from './rate-limit';

export const API_VERSION = '1.1.0-mock';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Madoun-Synthetic': 'true',
  'X-Madoun-Api-Version': API_VERSION,
};

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extraHeaders } });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return json(body, status);
}

export const notFound = (what: string, id: string) => errorResponse(404, 'not_found', `${what} '${id}' was not found.`);

export interface ApiContext {
  caller: Caller;
  requestId: string;
}

export interface HandleOptions {
  /** The scope the route needs. Omit for a route any authenticated key may call. */
  scope?: Scope;
  /** Accept a request with no key (the key is still checked when one is sent). */
  isPublic?: boolean;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Uses the caller's request id when it is well formed, otherwise makes one. */
export function requestIdOf(request: Request): string {
  const given = request.headers.get('x-request-id');
  return given && REQUEST_ID.test(given) ? given : crypto.randomUUID();
}

/**
 * Runs a handler behind authentication, the per instance rate limiter (src/server/rate-limit.ts), a request
 * id, the request log and the request counters, with a catch-all that keeps the error shape consistent.
 */
export async function handle(request: Request, fn: (ctx: ApiContext) => Response | Promise<Response>, options: HandleOptions = {}): Promise<Response> {
  const started = performance.now();
  const requestId = requestIdOf(request);
  const url = new URL(request.url);
  let caller: Caller | undefined;
  let response: Response;
  try {
    const decision = authenticate(request, options.scope, options.isPublic);
    if (!decision.ok) {
      // Refused requests are limited too, per client address, so a flood of bad keys cannot be free.
      const refused = limiters().read.take(clientKey(request, 'unauthenticated'), rateLimitNow());
      response = refused.allowed
        ? errorResponse(decision.status, decision.code, decision.message)
        : json({ error: { code: 'rate_limited', message: `Too many requests. Retry after ${refused.retryAfterSeconds} second(s).` } } satisfies ApiErrorBody, 429, { 'Retry-After': String(refused.retryAfterSeconds) });
      if (decision.challenge && response.status === decision.status) response.headers.set('WWW-Authenticate', 'Bearer realm="madoun"');
    } else {
      caller = decision.caller;
      const kind = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
      const rate = limiters()[kind].take(clientKey(request, caller.id), rateLimitNow());
      if (!rate.allowed) {
        const body: ApiErrorBody = { error: { code: 'rate_limited', message: `Too many requests. Retry after ${rate.retryAfterSeconds} second(s).` } };
        response = json(body, 429, { 'Retry-After': String(rate.retryAfterSeconds) });
      } else {
        response = await fn({ caller, requestId });
      }
    }
  } catch (e) {
    console.error('[madoun-api]', requestId, e);
    response = errorResponse(500, 'internal_error', 'Unexpected server error.');
  }
  const ms = performance.now() - started;
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Madoun-Auth', authMode());
  recordRequest(request.method, url.pathname, response.status, ms);
  logRequest({ requestId, clientId: caller?.id ?? 'none', role: caller?.role ?? 'none', method: request.method, path: url.pathname, status: response.status, ms: Math.round(ms * 10) / 10 });
  return response;
}

/**
 * Reads a JSON request body under a byte cap. Rejects on the declared Content-Length before reading,
 * then re-checks the bytes actually received (multi-byte text counts as bytes, not characters).
 * Returns the parsed value, or an error Response (415, 413 or 400) in the standard error shape.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<{ body: unknown } | Response> {
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('json')) {
    return errorResponse(415, 'unsupported_media_type', "Content-Type must be 'application/json'.");
  }
  const text = await readCappedText(request, maxBytes);
  if (text instanceof Response) return text;
  try {
    return { body: JSON.parse(text) };
  } catch {
    return errorResponse(400, 'invalid_json', 'Body is not valid JSON.');
  }
}

/**
 * Reads a body as UTF-8 text without ever holding more than `maxBytes` plus one chunk: the declared
 * Content-Length is checked first, then the stream is counted as it arrives and cancelled at the cap, so a
 * chunked request with no length cannot make the server buffer it whole. Returns the text or a 413 Response.
 */
export async function readCappedText(request: Request, maxBytes: number): Promise<string | Response> {
  const tooLarge = () => errorResponse(413, 'payload_too_large', `Body must be at most ${maxBytes} bytes.`);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return tooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return tooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

export interface Paging { page: number; pageSize: number }

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Returns Paging or a 400 Response. */
export function parsePaging(sp: URLSearchParams): Paging | Response {
  const num = (name: string, def: number, min: number, max: number): number | Response => {
    const raw = sp.get(name);
    if (raw === null || raw === '') return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      return errorResponse(400, 'invalid_query', `'${name}' must be an integer between ${min} and ${max}.`, { parameter: name, value: raw });
    }
    return n;
  };
  const page = num('page', 1, 1, 1_000_000);
  if (page instanceof Response) return page;
  const pageSize = num('pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  if (pageSize instanceof Response) return pageSize;
  return { page, pageSize };
}

/** Validates an enum-like query parameter. Returns the value, undefined when absent, or a 400 Response. */
export function parseEnum<T extends string>(sp: URLSearchParams, name: string, allowed: readonly T[]): T | undefined | Response {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  return errorResponse(400, 'invalid_query', `'${name}' must be one of: ${allowed.join(', ')}.`, { parameter: name, value: v });
}

export function paginate<T>(items: T[], { page, pageSize }: Paging) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page: { page, pageSize, total, totalPages } };
}
