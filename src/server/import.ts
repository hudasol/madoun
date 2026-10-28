/**
 * Declaration import: turns a flat table (one row per declared item) into the adapter payload that
 * validateAssessmentRequest accepts, one payload per declaration.
 *
 * The column names follow the data elements of the WCO Data Model (declaration reference, transport
 * document, container, commodity code, description, country of origin, item value, quantity, packages)
 * but this is a convenience mapping, not a conformant WCO message and not a replacement for the ATLP or
 * MAMAR adapter. Nothing here reads files from disk or writes anything.
 */
export const IMPORT_COLUMNS = [
  'declarationRef', 'mode', 'carrier', 'conveyance', 'entryPoint', 'eta', 'filedAt', 'traderId', 'forwarderId',
  'invoiceRef', 'incoterm', 'currency', 'submitted', 'transportDocRef', 'containerIds',
  'hsCode', 'description', 'category', 'origin', 'value', 'quantity', 'packages', 'flags',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns whose cell holds several values separated by semicolons. */
const LIST_COLUMNS = new Set<ImportColumn>(['submitted', 'containerIds', 'flags']);
const NUMBER_COLUMNS = new Set<ImportColumn>(['value', 'quantity', 'packages']);
/** Columns that belong to the declaration and must read the same on every row of it. */
const DECLARATION_COLUMNS: ImportColumn[] = ['mode', 'carrier', 'conveyance', 'entryPoint', 'eta', 'filedAt', 'traderId', 'forwarderId', 'invoiceRef', 'incoterm', 'currency', 'submitted'];
const REQUIRED_COLUMNS: ImportColumn[] = ['declarationRef', 'transportDocRef', 'hsCode', 'description', 'category', 'origin', 'value', 'quantity', 'packages'];

export const IMPORT_LIMITS = { bytes: 1_000_000, rows: 2000, declarations: 50 } as const;

export interface ImportIssue { row?: number; declarationRef?: string; path?: string; message: string }

/** RFC 4180 parser: quoted cells, doubled quotes, line breaks inside quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] | { error: string } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false;
        i++;
        if (i < src.length && src[i] !== ',' && src[i] !== '\n' && src[i] !== '\r') return { error: `unexpected character after closing quote near row ${rows.length + 1}` };
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (cell !== '') return { error: `quote inside an unquoted cell near row ${rows.length + 1}` };
      quoted = true;
      i++;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += c;
      i++;
    }
  }
  if (quoted) return { error: 'a quoted cell is not closed' };
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export type ParsedImport = { ok: true; payloads: { declarationRef: string; payload: Record<string, unknown> }[] } | { ok: false; issues: ImportIssue[] };

/** Groups rows into declarations and consignments and returns one adapter payload each. */
export function csvToPayloads(text: string): ParsedImport {
  if (new TextEncoder().encode(text).length > IMPORT_LIMITS.bytes) return { ok: false, issues: [{ message: `File must be at most ${IMPORT_LIMITS.bytes} bytes.` }] };
  const table = parseCsv(text);
  if ('error' in table) return { ok: false, issues: [{ message: `Not valid CSV: ${table.error}.` }] };
  if (table.length < 2) return { ok: false, issues: [{ message: 'The file needs a header row and at least one data row.' }] };
  if (table.length - 1 > IMPORT_LIMITS.rows) return { ok: false, issues: [{ message: `At most ${IMPORT_LIMITS.rows} data rows per import.` }] };

  const header = table[0].map((h) => h.trim());
  const issues: ImportIssue[] = [];
  const unknown = header.filter((h) => !(IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) issues.push({ row: 1, message: `Unknown column(s): ${unknown.join(', ')}.` });
  const dupes = header.filter((h, i) => header.indexOf(h) !== i);
  if (dupes.length) issues.push({ row: 1, message: `Repeated column(s): ${[...new Set(dupes)].join(', ')}.` });
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) issues.push({ row: 1, message: `Missing required column(s): ${missing.join(', ')}.` });
  if (issues.length) return { ok: false, issues };

  type Row = { n: number; cells: Partial<Record<ImportColumn, string>> };
  const byDeclaration = new Map<string, Row[]>();
  table.slice(1).forEach((cells, k) => {
    const n = k + 2;
    if (cells.length !== header.length) { issues.push({ row: n, message: `Has ${cells.length} cells, expected ${header.length}.` }); return; }
    const rec: Partial<Record<ImportColumn, string>> = {};
    header.forEach((h, j) => { rec[h as ImportColumn] = cells[j].trim(); });
    const ref = rec.declarationRef ?? '';
    if (!ref) { issues.push({ row: n, path: 'declarationRef', message: 'Required.' }); return; }
    byDeclaration.set(ref, [...(byDeclaration.get(ref) ?? []), { n, cells: rec }]);
  });
  if (byDeclaration.size > IMPORT_LIMITS.declarations) issues.push({ message: `At most ${IMPORT_LIMITS.declarations} declarations per import.` });
  if (issues.length) return { ok: false, issues };

  const list = (v: string | undefined) => (v ? v.split(';').map((x) => x.trim()).filter(Boolean) : []);
  const payloads: { declarationRef: string; payload: Record<string, unknown> }[] = [];
  const problems: ImportIssue[] = [];

  for (const [ref, rows] of byDeclaration) {
    const first = rows[0];
    for (const col of DECLARATION_COLUMNS) {
      if (!header.includes(col)) continue;
      const odd = rows.find((r) => (r.cells[col] ?? '') !== (first.cells[col] ?? ''));
      if (odd) problems.push({ row: odd.n, declarationRef: ref, path: col, message: `Differs from row ${first.n}; a declaration has one value per column.` });
    }
    const consignments = new Map<string, Record<string, unknown>[]>();
    const containers = new Map<string, string[]>();
    const total = { sum: 0 };
    for (const r of rows) {
      const doc = r.cells.transportDocRef ?? '';
      const item: Record<string, unknown> = {};
      for (const col of ['hsCode', 'description', 'category', 'origin', 'value', 'quantity', 'packages', 'flags'] as ImportColumn[]) {
        const raw = r.cells[col];
        if (raw === undefined || (raw === '' && col === 'flags')) continue;
        if (NUMBER_COLUMNS.has(col)) {
          const n = raw === '' ? NaN : Number(raw);
          if (!Number.isFinite(n)) { problems.push({ row: r.n, declarationRef: ref, path: col, message: `'${raw}' is not a number.` }); continue; }
          item[col] = n;
          if (col === 'value') total.sum += n;
        } else if (LIST_COLUMNS.has(col)) item[col] = list(raw);
        else item[col] = raw;
      }
      const cs = list(r.cells.containerIds);
      const seen = containers.get(doc) ?? [];
      containers.set(doc, [...seen, ...cs.filter((c) => !seen.includes(c))]);
      consignments.set(doc, [...(consignments.get(doc) ?? []), item]);
    }
    const payload: Record<string, unknown> = { declarationRef: ref };
    for (const col of DECLARATION_COLUMNS) {
      const raw = first.cells[col];
      if (raw === undefined || (raw === '' && (col === 'filedAt' || col === 'submitted'))) continue;
      payload[col] = LIST_COLUMNS.has(col) ? list(raw) : raw;
    }
    if (!header.includes('submitted')) payload.submitted = [];
    else if (payload.submitted === undefined) payload.submitted = [];
    payload.totalValue = Math.round(total.sum * 100) / 100;
    payload.consignments = [...consignments].map(([transportDocRef, items]) => ({ transportDocRef, containerIds: containers.get(transportDocRef) ?? [], items }));
    payloads.push({ declarationRef: ref, payload });
  }
  return problems.length ? { ok: false, issues: problems } : { ok: true, payloads };
}
