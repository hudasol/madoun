import { authorize } from './auth';
import { clientKey, limiters, rateLimitNow } from './rate-limit';

export const API_VERSION = '1.0.0-mock';

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

/**
 * Runs a handler behind the auth seam and the per instance rate limiter (src/server/rate-limit.ts),
 * with a catch-all that keeps the error shape consistent.
 */
export async function handle(request: Request, fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    const decision = authorize(request);
    if (!decision.allowed) return errorResponse(401, 'unauthorized', 'Authentication required.');
    const kind = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
    const rate = limiters()[kind].take(clientKey(request, decision.clientId), rateLimitNow());
    if (!rate.allowed) {
      const body: ApiErrorBody = { error: { code: 'rate_limited', message: `Too many requests. Retry after ${rate.retryAfterSeconds} second(s).` } };
      return json(body, 429, { 'Retry-After': String(rate.retryAfterSeconds) });
    }
    return await fn();
  } catch (e) {
    console.error('[madoun-api]', e);
    return errorResponse(500, 'internal_error', 'Unexpected server error.');
  }
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
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return errorResponse(413, 'payload_too_large', `Body must be at most ${maxBytes} bytes.`);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) return errorResponse(413, 'payload_too_large', `Body must be at most ${maxBytes} bytes.`);
  try {
    return { body: JSON.parse(text) };
  } catch {
    return errorResponse(400, 'invalid_json', 'Body is not valid JSON.');
  }
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
