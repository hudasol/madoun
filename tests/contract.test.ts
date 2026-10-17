import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateInspectionResultRequest } from '@/server/validate';

/**
 * Structural checks on the published contract. The repository carries no YAML parser (no new
 * dependency for a test), so this checks what drifts in practice: every route file is documented with
 * its methods, every OpenAPI reference resolves, and the published JSON Schemas agree with the validator.
 */
const spec = fs.readFileSync('public/openapi.yaml', 'utf8');
const lines = spec.split(/\r?\n/);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? routeFiles(p) : d.name === 'route.ts' ? [p] : [];
  });
}

/** Methods documented under one path, read from the indentation structure. */
function documentedMethods(apiPath: string): string[] {
  const start = lines.indexOf(`  ${apiPath}:`);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && !/^ {0,2}\S/.test(lines[i]); i++) {
    const m = lines[i].match(/^ {4}(get|post|put|patch|delete):/);
    if (m) out.push(m[1].toUpperCase());
  }
  return out;
}

describe('OpenAPI contract', () => {
  const routes = routeFiles(path.join('src', 'app', 'api', 'v1'));

  it('documents every route file with exactly the methods it exports', () => {
    expect(routes.length).toBeGreaterThanOrEqual(11);
    for (const file of routes) {
      const rel = path.relative(path.join('src', 'app', 'api', 'v1'), path.dirname(file)).split(path.sep).join('/');
      const apiPath = '/' + rel.replace(/\[(\w+)\]/g, '{$1}');
      const exported = [...fs.readFileSync(file, 'utf8').matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]).sort();
      expect(documentedMethods(apiPath).sort(), apiPath).toEqual(exported);
    }
  });

  it('resolves every internal $ref', () => {
    const refs = [...spec.matchAll(/\$ref: '#\/components\/(schemas|responses|parameters)\/(\w+)'/g)];
    expect(refs.length).toBeGreaterThan(20);
    const comp = lines.indexOf('components:');
    for (const [, section, name] of refs) {
      const sec = lines.indexOf(`  ${section}:`, comp);
      expect(sec, section).toBeGreaterThan(comp);
      expect(lines.slice(sec).some((l) => l === `    ${name}:` || l.startsWith(`    ${name}: `)), `${section}/${name}`).toBe(true);
    }
  });

  it('declares OpenAPI 3.1 and has no tab characters', () => {
    expect(lines[0]).toBe('openapi: 3.1.0');
    expect(spec.includes('\t')).toBe(false);
  });
});

describe('published JSON Schemas', () => {
  const schemas = fs.readdirSync('docs/schemas').filter((f) => f.endsWith('.json'));

  it('all parse and name a draft 2020-12 meta schema', () => {
    expect(schemas.length).toBeGreaterThanOrEqual(4);
    for (const f of schemas) {
      const s = JSON.parse(fs.readFileSync(path.join('docs/schemas', f), 'utf8'));
      expect(s.$schema, f).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.title, f).toBeTruthy();
    }
  });

  it('the inspection result schema matches the validator: fields, required fields and its own example', () => {
    const s = JSON.parse(fs.readFileSync('docs/schemas/inspection-result-request.schema.json', 'utf8'));
    const task = { id: 'insp-X', shipmentId: 'X', containerIds: [], requestedAt: '2026-10-09T02:00:00.000Z', requestedBy: 'madoun', scope: [], priority: 'normal' as const, constraints: [] };
    const now = '2026-10-09T02:00:00.000Z';
    const example = s.examples[0];
    expect(validateInspectionResultRequest(example, { task, now }).ok).toBe(true);
    for (const k of s.required as string[]) {
      const { [k]: _drop, ...rest } = example;
      void _drop;
      const r = validateInspectionResultRequest(rest, { task, now });
      expect(r.ok, k).toBe(false);
      if (!r.ok) expect(r.issues.map((i) => i.path), k).toContain(k);
    }
    const extra = validateInspectionResultRequest({ ...example, notInSchema: 1 }, { task, now });
    expect(extra.ok).toBe(false);
    expect(Object.keys(s.properties).sort()).toEqual([...(s.required as string[])].sort());
  });
});
