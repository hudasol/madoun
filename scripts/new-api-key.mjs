#!/usr/bin/env node
/**
 * Issues an API key for the Madoun API (MADOUN_AUTH=keys).
 *
 *   node scripts/new-api-key.mjs --id adafsa-gateway --role gateway
 *   node scripts/new-api-key.mjs --id adc-officers --role authority --authority adc --scopes shipments:read,receipts:read
 *
 * The key is printed once. The configuration entry holds only its SHA-256 hash: put the entry in the
 * JSON array named by MADOUN_API_KEYS (or the file named by MADOUN_API_KEYS_FILE) and hand the key to
 * its owner. A lost key cannot be recovered; issue a new one and remove the old entry.
 */
import { createHash, randomBytes } from 'node:crypto';

const ROLES = ['authority', 'auditor', 'operator', 'gateway', 'ops'];
const SCOPES = ['shipments:read', 'receipts:read', 'ledger:read', 'kpis:read', 'exceptions:read', 'tasks:read', 'tasks:write', 'assessments:write', 'ops:read'];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(`unexpected argument ${a}`);
    out[a.slice(2)] = argv[++i];
  }
  return out;
}

function fail(message) {
  console.error(`error: ${message}`);
  console.error('usage: node scripts/new-api-key.mjs --id <id> --role <' + ROLES.join('|') + '> [--authority <id>] [--scopes a,b]');
  process.exit(2);
}

const a = args(process.argv.slice(2));
if (!a.id || !/^[a-z0-9][a-z0-9._-]{1,62}$/.test(a.id)) fail('--id must be 2 to 63 characters: lower case letters, digits, dot, underscore, hyphen');
if (!ROLES.includes(a.role)) fail(`--role must be one of ${ROLES.join(', ')}`);
if (a.role === 'authority' && !/^[a-z0-9-]+$/.test(a.authority ?? '')) fail('role authority needs --authority <id>');
const scopes = a.scopes ? a.scopes.split(',') : undefined;
if (scopes?.some((s) => !SCOPES.includes(s))) fail(`--scopes must be drawn from ${SCOPES.join(', ')}`);

const key = 'mdn_' + randomBytes(32).toString('base64url');
const entry = { id: a.id, sha256: createHash('sha256').update(key, 'utf8').digest('hex'), role: a.role };
if (a.authority) entry.authority = a.authority;
if (scopes) entry.scopes = scopes;

console.log('API key (shown once, store it in a secret manager):');
console.log(`  ${key}\n`);
console.log('Configuration entry (safe to keep in the server configuration):');
console.log(JSON.stringify(entry, null, 2));
