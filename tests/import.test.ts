import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POST as importRoute } from '@/app/api/v1/declarations/import/route';
import { IMPORT_LIMITS, csvToPayloads, parseCsv } from '@/server/import';

const sample = fs.readFileSync('data/samples/declarations.csv', 'utf8');
const send = (body: string, type = 'text/csv') =>
  importRoute(new Request('http://localhost/api/v1/declarations/import', { method: 'POST', headers: { 'content-type': type }, body }));

describe('csv parser', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside cells, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line\nbreak",z')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['line\nbreak', 'z']]);
  });
  it('keeps empty cells and skips blank lines', () => {
    expect(parseCsv('a,b,c\n,,\n\nx,,z\n')).toEqual([['a', 'b', 'c'], ['', '', ''], ['x', '', 'z']]);
  });
  it('rejects an unclosed quote and a quote inside a bare cell', () => {
    expect(parseCsv('a,"b')).toEqual({ error: 'a quoted cell is not closed' });
    expect('error' in (parseCsv('a,b"c') as object)).toBe(true);
  });
});

describe('csv to adapter payloads', () => {
  it('groups rows into declarations and sums item values into the total', () => {
    const r = csvToPayloads(sample);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payloads.map((p) => p.declarationRef)).toEqual(['DEC-SAMPLE-001', 'DEC-SAMPLE-002']);
    const p = r.payloads[0].payload as { totalValue: number; consignments: { items: unknown[]; containerIds: string[] }[]; submitted: string[] };
    expect(p.totalValue).toBe(128783);
    expect(p.consignments).toHaveLength(1);
    expect(p.consignments[0].items).toHaveLength(2);
    expect(p.consignments[0].containerIds).toEqual(['XHBK9439500']);
    expect(p.submitted).toContain('packing-list');
  });

  it('names the row of a declaration whose header values disagree', () => {
    const lines = sample.trim().split('\n');
    lines[2] = lines[2].replace('Khalifa Port', 'Jebel Ali');
    const r = csvToPayloads(lines.join('\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatchObject({ row: 3, declarationRef: 'DEC-SAMPLE-001', path: 'entryPoint' });
  });

  it('reports missing and unknown columns, short rows and non numeric values', () => {
    expect(csvToPayloads('declarationRef,bogus\nA,1')).toMatchObject({ ok: false });
    const noHs = csvToPayloads('declarationRef\nA');
    expect(noHs.ok === false && noHs.issues[0].message).toContain('Missing required');
    const header = sample.split('\n')[0];
    expect(csvToPayloads(`${header}\nA,b`)).toMatchObject({ ok: false });
    const bad = csvToPayloads(sample.replace('100205', 'lots'));
    expect(bad.ok === false && bad.issues[0]).toMatchObject({ path: 'value' });
  });

  it('enforces size limits', () => {
    const header = sample.split('\n')[0];
    const row = sample.split('\n')[1];
    expect(csvToPayloads(`${header}\n${Array(IMPORT_LIMITS.rows + 1).fill(row).join('\n')}`)).toMatchObject({ ok: false });
  });
});

describe('POST /declarations/import', () => {
  it('assesses each declaration of a CSV and persists nothing', async () => {
    const res = await send(sample);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.persisted).toBe(false);
    expect(b.total).toBe(2);
    expect(b.accepted + b.rejected).toBe(2);
    for (const r of b.results.filter((x: { accepted: boolean }) => x.accepted)) expect(['green', 'amber', 'red']).toContain(r.lane);
  });

  it('answers per declaration, so one bad declaration does not hide a good one', async () => {
    const lines = sample.trim().split('\n');
    lines[3] = lines[3].replace('tr-01', 'tr-unknown');
    const b = await (await send(lines.join('\n'))).json();
    expect(b.accepted).toBe(1);
    expect(b.rejected).toBe(1);
    const bad = b.results.find((r: { accepted: boolean }) => !r.accepted);
    expect(bad.issues[0].path).toBe('traderId');
  });

  it('takes a JSON array in the assessment format', async () => {
    const csv = csvToPayloads(sample);
    if (!csv.ok) throw new Error('sample did not parse');
    const b = await (await send(JSON.stringify(csv.payloads.map((p) => p.payload)), 'application/json')).json();
    expect(b.total).toBe(2);
  });

  it('refuses other media types, bad JSON, empty arrays and a bad CSV', async () => {
    expect((await send('x', 'text/plain')).status).toBe(415);
    expect((await send('{', 'application/json')).status).toBe(400);
    expect((await send('[]', 'application/json')).status).toBe(422);
    expect((await send('declarationRef\nA')).status).toBe(422);
  });
});
