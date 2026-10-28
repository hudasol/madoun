/**
 * API authentication and authorisation.
 *
 * Two modes, chosen by the environment variable MADOUN_AUTH:
 *  - `off` (default): every caller is the demo caller with every scope. This is what the public demo
 *    runs, because everything it serves is synthetic. It is announced by /api/v1/health.
 *  - `keys`: every request except a public route must carry `Authorization: Bearer <key>`. Keys are
 *    issued with scripts/new-api-key.mjs and configured by their SHA-256 hash, so the server never
 *    holds a usable key. Each key has a role, optionally an authority, and a set of scopes.
 *
 * Configuration (mode `keys`): MADOUN_API_KEYS holds a JSON array, or MADOUN_API_KEYS_FILE names a file
 * that holds it. If the configuration is missing or invalid the server refuses every non public request
 * with 503 rather than falling back to open access.
 *
 * What this is and is not. It is a bearer key check with least privilege scopes, evidence visibility that
 * follows each receipt's sharing policy, request identifiers and an audit log of who called what. It is
 * not mutual TLS, not key rotation tooling, not per trader scoping of shipments, and not tested against an
 * identity provider. docs/threat-model.md lists what a real deployment still needs.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import type { EvidenceReceipt } from '@/engine';

export const SCOPES = [
  'shipments:read',
  'receipts:read',
  'ledger:read',
  'kpis:read',
  'exceptions:read',
  'tasks:read',
  'tasks:write',
  'assessments:write',
  'ops:read',
] as const;
export type Scope = (typeof SCOPES)[number];

export const ROLES = ['authority', 'auditor', 'operator', 'gateway', 'ops'] as const;
export type Role = (typeof ROLES)[number];

/** What each role may do unless a key narrows or names its own scopes. */
export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  authority: ['shipments:read', 'receipts:read', 'ledger:read', 'kpis:read', 'exceptions:read', 'tasks:read', 'assessments:write'],
  auditor: ['shipments:read', 'receipts:read', 'ledger:read', 'kpis:read', 'exceptions:read', 'tasks:read'],
  operator: ['kpis:read', 'assessments:write'],
  gateway: ['tasks:read', 'tasks:write'],
  ops: ['ops:read', 'kpis:read'],
};

export interface KeyEntry {
  id: string;
  /** SHA-256 of the full key string, lower case hex. */
  sha256: string;
  role: Role;
  /** Required for role `authority`: the authority id this key acts for. */
  authority?: string;
  scopes?: Scope[];
}

export interface Caller {
  id: string;
  /** `demo` only when authentication is off. */
  role: Role | 'demo' | 'anonymous';
  authority?: string;
  scopes: ReadonlySet<Scope>;
}

export type AuthOutcome =
  | { ok: true; caller: Caller }
  | { ok: false; status: 401 | 403 | 503; code: 'unauthorized' | 'forbidden' | 'auth_misconfigured'; message: string; challenge?: boolean };

export const KEY_PREFIX = 'mdn_';
const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9._-]{1,62}$/;

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Validates a parsed configuration. Returns the entries or a list of problems. */
export function parseKeyConfig(raw: unknown): { entries: KeyEntry[] } | { problems: string[] } {
  const problems: string[] = [];
  if (!Array.isArray(raw)) return { problems: ['configuration must be a JSON array'] };
  const entries: KeyEntry[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  raw.forEach((e, i) => {
    const at = `entry ${i}`;
    if (typeof e !== 'object' || e === null) return problems.push(`${at}: must be an object`);
    const o = e as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID.test(o.id)) problems.push(`${at}: id must match ${ID}`);
    else if (ids.has(o.id)) problems.push(`${at}: duplicate id ${o.id}`);
    else ids.add(o.id);
    if (typeof o.sha256 !== 'string' || !HEX64.test(o.sha256)) problems.push(`${at}: sha256 must be 64 lower case hex characters`);
    else if (hashes.has(o.sha256)) problems.push(`${at}: duplicate sha256`);
    else hashes.add(o.sha256);
    if (!ROLES.includes(o.role as Role)) problems.push(`${at}: role must be one of ${ROLES.join(', ')}`);
    if (o.role === 'authority' && (typeof o.authority !== 'string' || !/^[a-z0-9-]+$/.test(o.authority))) problems.push(`${at}: role authority needs an authority id`);
    if (o.scopes !== undefined && (!Array.isArray(o.scopes) || o.scopes.some((s) => !SCOPES.includes(s as Scope)))) problems.push(`${at}: scopes must be a list drawn from ${SCOPES.join(', ')}`);
    if (!problems.some((p) => p.startsWith(at))) entries.push({ id: o.id as string, sha256: o.sha256 as string, role: o.role as Role, authority: o.authority as string | undefined, scopes: o.scopes as Scope[] | undefined });
  });
  if (!problems.length && !entries.length) problems.push('configuration holds no keys');
  return problems.length ? { problems } : { entries };
}

type Loaded = { entries: KeyEntry[] } | { problems: string[] };
let cache: { source: string; loaded: Loaded } | undefined;

function loadConfig(env: NodeJS.ProcessEnv): Loaded {
  let source = env.MADOUN_API_KEYS ?? '';
  if (!source && env.MADOUN_API_KEYS_FILE) {
    try {
      source = fs.readFileSync(env.MADOUN_API_KEYS_FILE, 'utf8');
    } catch {
      return { problems: ['MADOUN_API_KEYS_FILE could not be read'] };
    }
  }
  if (cache?.source === source) return cache.loaded;
  let loaded: Loaded;
  if (!source.trim()) loaded = { problems: ['no keys configured: set MADOUN_API_KEYS or MADOUN_API_KEYS_FILE'] };
  else {
    try {
      loaded = parseKeyConfig(JSON.parse(source));
    } catch {
      loaded = { problems: ['configuration is not valid JSON'] };
    }
  }
  cache = { source, loaded };
  return loaded;
}

export function authMode(env: NodeJS.ProcessEnv = process.env): 'off' | 'keys' {
  return env.MADOUN_AUTH === 'keys' ? 'keys' : 'off';
}

const DEMO: Caller = { id: 'demo', role: 'demo', scopes: new Set(SCOPES) };
const ANONYMOUS: Caller = { id: 'anonymous', role: 'anonymous', scopes: new Set() };

/** Compares a presented key with every configured hash without stopping at the first match. */
function findEntry(entries: KeyEntry[], presentedHash: string): KeyEntry | undefined {
  const want = Buffer.from(presentedHash, 'hex');
  let found: KeyEntry | undefined;
  for (const e of entries) {
    const have = Buffer.from(e.sha256, 'hex');
    if (have.length === want.length && timingSafeEqual(have, want)) found = e;
  }
  return found;
}

/**
 * Decides whether a request may proceed.
 * `scope` is what the route needs; `isPublic` routes accept an anonymous caller (the key is still checked if one is sent).
 */
export function authenticate(request: Request, scope: Scope | undefined, isPublic = false, env: NodeJS.ProcessEnv = process.env): AuthOutcome {
  if (authMode(env) === 'off') return { ok: true, caller: DEMO };

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    if (isPublic && !header) return { ok: true, caller: ANONYMOUS };
    return { ok: false, status: 401, code: 'unauthorized', message: 'Send an API key as "Authorization: Bearer <key>".', challenge: true };
  }
  const config = loadConfig(env);
  if ('problems' in config) {
    return { ok: false, status: 503, code: 'auth_misconfigured', message: 'API keys are not configured correctly on the server. The request was refused.' };
  }
  const entry = match[1].startsWith(KEY_PREFIX) ? findEntry(config.entries, hashKey(match[1])) : undefined;
  if (!entry) return { ok: false, status: 401, code: 'unauthorized', message: 'The API key is not recognised.', challenge: true };

  const scopes = new Set<Scope>(entry.scopes ?? ROLE_SCOPES[entry.role]);
  const caller: Caller = { id: entry.id, role: entry.role, authority: entry.authority, scopes };
  if (scope && !scopes.has(scope)) return { ok: false, status: 403, code: 'forbidden', message: `This key does not have the scope ${scope}.` };
  return { ok: true, caller };
}

/** Why the configuration is unusable, or undefined when it is fine or authentication is off. For health and startup messages. */
export function configProblems(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  if (authMode(env) === 'off') return undefined;
  const config = loadConfig(env);
  return 'problems' in config ? config.problems : undefined;
}

/**
 * Evidence visibility follows the custodian's sharing policy. An authority sees receipts it issued and
 * receipts shared with it or with everyone; an auditor sees all (post clearance audit, TFA 7.5); other
 * roles see none. The demo caller sees all, as the browser demo does.
 */
export function canSeeReceipt(caller: Caller, r: Pick<EvidenceReceipt, 'verifiedBy' | 'sharedWith'>): boolean {
  if (caller.role === 'demo' || caller.role === 'auditor') return true;
  if (caller.role !== 'authority' || !caller.authority) return false;
  return r.verifiedBy === caller.authority || r.sharedWith === 'all' || r.sharedWith.includes(caller.authority);
}
