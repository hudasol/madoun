import { authorize } from './auth';

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

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: BASE_HEADERS });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return json(body, status);
}

export const notFound = (what: string, id: string) => errorResponse(404, 'not_found', `${what} '${id}' was not found.`);

/** Runs a handler behind the auth seam and a catch-all that keeps the error shape consistent. */
export async function handle(request: Request, fn: () => Response | Promise<Response>): Promise<Response> {
  try {
    const decision = authorize(request);
    if (!decision.allowed) return errorResponse(401, 'unauthorized', 'Authentication required.');
    return await fn();
  } catch (e) {
    console.error('[madoun-api]', e);
    return errorResponse(500, 'internal_error', 'Unexpected server error.');
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
