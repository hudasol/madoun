import type { EvidenceType, GoodsCategory, InspectionFinding, InspectionResult, InspectionTask, Shipment, TransportMode } from '@/engine';

export interface ValidationIssue { path: string; message: string }

export const CATEGORIES: readonly GoodsCategory[] = [
  'food', 'electronics', 'wireless', 'pharma', 'medical-device', 'chemicals', 'textiles', 'machinery', 'cosmetics', 'general',
];
export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  'commercial-invoice', 'packing-list', 'transport-document', 'certificate-of-origin', 'health-certificate', 'lab-result',
  'conformity-certificate', 'type-approval', 'import-permit', 'safety-data-sheet', 'inspection-result', 'release-order',
];
/** Upper bounds per declaration. Real declarations are far smaller; these keep one request cheap to evaluate. */
export const LIMITS = { consignments: 20, itemsPerConsignment: 200, containersPerConsignment: 100 } as const;
export const MODES: readonly TransportMode[] = ['sea', 'air', 'land'];

export interface ValidationContext {
  traderIds: ReadonlySet<string>;
  forwarderIds: ReadonlySet<string>;
  /** Used when the payload omits filedAt. */
  now: string;
  /** Prefix and number for generated internal ids. */
  idPrefix: string;
}

export type ValidationResult = { ok: true; shipment: Shipment } | { ok: false; issues: ValidationIssue[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Strict, hand-written validation of an adapter-supplied declaration. Unknown fields are rejected. */
export function validateAssessmentRequest(input: unknown, ctx: ValidationContext): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!isObj(input)) return { ok: false, issues: [{ path: '$', message: 'Body must be a JSON object.' }] };

  const optStr = (o: Obj, k: string, base: string): string | undefined => {
    if (o[k] === undefined) return undefined;
    const p = base ? `${base}.${k}` : k;
    if (typeof o[k] !== 'string' || (o[k] as string).length > 300) { add(p, 'Must be a string of at most 300 characters.'); return undefined; }
    return o[k] as string;
  };
  const noExtra = (o: Obj, allowed: string[], base: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add(base ? `${base}.${k}` : k, 'Unknown field.');
  };
  const str = (o: Obj, k: string, base: string, opts: { max?: number } = {}): string | undefined => {
    const p = base ? `${base}.${k}` : k;
    const v = o[k];
    if (v === undefined) { add(p, 'Required.'); return undefined; }
    if (typeof v !== 'string' || v.trim() === '') { add(p, 'Must be a non-empty string.'); return undefined; }
    if (v.length > (opts.max ?? 200)) { add(p, `Must be at most ${opts.max ?? 200} characters.`); return undefined; }
    return v;
  };
  const num = (o: Obj, k: string, base: string, opts: { int?: boolean; min: number }): number | undefined => {
    const p = base ? `${base}.${k}` : k;
    const v = o[k];
    if (v === undefined) { add(p, 'Required.'); return undefined; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { add(p, 'Must be a finite number.'); return undefined; }
    if (opts.int && !Number.isInteger(v)) { add(p, 'Must be an integer.'); return undefined; }
    if (v < opts.min) { add(p, `Must be >= ${opts.min}.`); return undefined; }
    return v;
  };
  const iso = (v: string | undefined, p: string): string | undefined => {
    if (v === undefined) return undefined;
    if (!ISO.test(v) || Number.isNaN(Date.parse(v))) { add(p, 'Must be an ISO-8601 date-time with a timezone, e.g. 2026-10-12T06:00:00Z.'); return undefined; }
    return v;
  };

  noExtra(input, [
    'declarationRef', 'mode', 'carrier', 'conveyance', 'entryPoint', 'eta', 'filedAt', 'traderId', 'forwarderId',
    'invoiceRef', 'incoterm', 'currency', 'totalValue', 'submitted', 'consignments', 'carrierAr', 'conveyanceAr',
  ], '');

  const declarationRef = str(input, 'declarationRef', '', { max: 64 });
  const carrier = str(input, 'carrier', '');
  const conveyance = str(input, 'conveyance', '');
  const entryPoint = str(input, 'entryPoint', '');
  const invoiceRef = str(input, 'invoiceRef', '', { max: 64 });
  const incoterm = str(input, 'incoterm', '', { max: 8 });
  const carrierAr = optStr(input, 'carrierAr', '');
  const conveyanceAr = optStr(input, 'conveyanceAr', '');

  let mode: TransportMode | undefined;
  if (input.mode === undefined) add('mode', 'Required.');
  else if (typeof input.mode !== 'string' || !MODES.includes(input.mode as TransportMode)) add('mode', `Must be one of: ${MODES.join(', ')}.`);
  else mode = input.mode as TransportMode;

  const eta = iso(str(input, 'eta', ''), 'eta');
  let filedAt = ctx.now;
  if (input.filedAt !== undefined) {
    const f = iso(typeof input.filedAt === 'string' ? input.filedAt : (add('filedAt', 'Must be a string.'), undefined), 'filedAt');
    if (f) filedAt = f;
  }
  if (eta && Date.parse(eta) < Date.parse(filedAt)) add('eta', 'Must not be earlier than filedAt.');

  const traderId = str(input, 'traderId', '');
  if (traderId && !ctx.traderIds.has(traderId)) add('traderId', `Unknown trader '${traderId}'. The adapter must map the filer to a Madoun trader id.`);
  const forwarderId = str(input, 'forwarderId', '');
  if (forwarderId && !ctx.forwarderIds.has(forwarderId)) add('forwarderId', `Unknown forwarder '${forwarderId}'.`);

  if (input.currency === undefined) add('currency', 'Required.');
  else if (input.currency !== 'AED') add('currency', "Must be 'AED'. Values are declared in AED.");

  const totalValue = num(input, 'totalValue', '', { min: 0 });

  const submitted: EvidenceType[] = [];
  if (input.submitted === undefined) add('submitted', 'Required (use [] if no documents were submitted).');
  else if (!Array.isArray(input.submitted)) add('submitted', 'Must be an array of evidence types.');
  else {
    input.submitted.forEach((v, i) => {
      if (typeof v !== 'string' || !EVIDENCE_TYPES.includes(v as EvidenceType)) add(`submitted[${i}]`, `Must be one of: ${EVIDENCE_TYPES.join(', ')}.`);
      else if (submitted.includes(v as EvidenceType)) add(`submitted[${i}]`, `Duplicate '${v}'.`);
      else submitted.push(v as EvidenceType);
    });
  }

  const id = `${ctx.idPrefix}`;
  const consignments: Shipment['consignments'] = [];
  let itemValueSum = 0;
  if (input.consignments === undefined) add('consignments', 'Required.');
  else if (!Array.isArray(input.consignments) || input.consignments.length === 0) add('consignments', 'Must be a non-empty array.');
  else if (input.consignments.length > LIMITS.consignments) add('consignments', `At most ${LIMITS.consignments} consignments per declaration.`);
  else {
    input.consignments.forEach((c, ci) => {
      const cp = `consignments[${ci}]`;
      if (!isObj(c)) { add(cp, 'Must be an object.'); return; }
      noExtra(c, ['transportDocRef', 'containerIds', 'items'], cp);
      const transportDocRef = str(c, 'transportDocRef', cp, { max: 64 });
      const containerIds: string[] = [];
      if (c.containerIds === undefined) add(`${cp}.containerIds`, 'Required (use [] for none).');
      else if (!Array.isArray(c.containerIds)) add(`${cp}.containerIds`, 'Must be an array of strings.');
      else if (c.containerIds.length > LIMITS.containersPerConsignment) add(`${cp}.containerIds`, `At most ${LIMITS.containersPerConsignment} containers per consignment.`);
      else c.containerIds.forEach((x, xi) => {
        if (typeof x !== 'string' || !/^[A-Z]{4}\d{7}$/.test(x)) add(`${cp}.containerIds[${xi}]`, 'Must match ISO 6346 shape: four capital letters then seven digits.');
        else containerIds.push(x);
      });
      const items: Shipment['consignments'][number]['items'] = [];
      if (c.items === undefined) add(`${cp}.items`, 'Required.');
      else if (!Array.isArray(c.items) || c.items.length === 0) add(`${cp}.items`, 'Must be a non-empty array.');
      else if (c.items.length > LIMITS.itemsPerConsignment) add(`${cp}.items`, `At most ${LIMITS.itemsPerConsignment} items per consignment.`);
      else c.items.forEach((it, ii) => {
        const ip = `${cp}.items[${ii}]`;
        if (!isObj(it)) { add(ip, 'Must be an object.'); return; }
        noExtra(it, ['hsCode', 'description', 'descriptionAr', 'category', 'origin', 'value', 'quantity', 'packages', 'flags'], ip);
        const hsCode = str(it, 'hsCode', ip, { max: 12 });
        if (hsCode && !/^\d{6,12}$/.test(hsCode)) add(`${ip}.hsCode`, 'Must be 6 to 12 digits, no dots or spaces.');
        const description = str(it, 'description', ip, { max: 300 });
        const descriptionAr = optStr(it, 'descriptionAr', ip);
        let category: GoodsCategory | undefined;
        if (it.category === undefined) add(`${ip}.category`, 'Required.');
        else if (typeof it.category !== 'string' || !CATEGORIES.includes(it.category as GoodsCategory)) add(`${ip}.category`, `Must be one of: ${CATEGORIES.join(', ')}.`);
        else category = it.category as GoodsCategory;
        const origin = str(it, 'origin', ip, { max: 2 });
        if (origin && !/^[A-Z]{2}$/.test(origin)) add(`${ip}.origin`, 'Must be an ISO 3166-1 alpha-2 code in capitals, e.g. CN.');
        const value = num(it, 'value', ip, { min: 0 });
        const quantity = num(it, 'quantity', ip, { min: 1, int: true });
        const packages = num(it, 'packages', ip, { min: 1, int: true });
        const flags: string[] = [];
        if (it.flags !== undefined) {
          if (!Array.isArray(it.flags)) add(`${ip}.flags`, 'Must be an array of strings.');
          else it.flags.forEach((f, fi) => {
            if (typeof f !== 'string' || !/^[a-z0-9-]{1,40}$/.test(f)) add(`${ip}.flags[${fi}]`, 'Must be a lowercase handling flag such as perishable or cold-chain.');
            else flags.push(f);
          });
        }
        if (value !== undefined) itemValueSum += value;
        if (hsCode && /^\d{6,12}$/.test(hsCode) && description && category && origin && /^[A-Z]{2}$/.test(origin)
          && value !== undefined && quantity !== undefined && packages !== undefined) {
          items.push({ id: `${id}-C${ci + 1}-I${ii + 1}`, hsCode, description, ...(descriptionAr ? { descriptionAr } : {}), category, origin, value, quantity, packages, flags });
        }
      });
      if (transportDocRef) consignments.push({ id: `${id}-C${ci + 1}`, transportDocRef, containerIds, items });
    });
  }

  if (totalValue !== undefined && itemValueSum > 0 && Math.abs(totalValue - itemValueSum) > 0.005) {
    add('totalValue', `Must equal the sum of item values (${itemValueSum}).`);
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    shipment: {
      id, declarationRef: declarationRef!, mode: mode!, carrier: carrier!, ...(carrierAr ? { carrierAr } : {}), conveyance: conveyance!, ...(conveyanceAr ? { conveyanceAr } : {}), entryPoint: entryPoint!,
      eta: eta!, filedAt, traderId: traderId!, forwarderId: forwarderId!, invoiceRef: invoiceRef!, incoterm: incoterm!,
      currency: 'AED', totalValue: totalValue!, submitted, consignments,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Inspection result posted by an inspection gateway                    */
/* ------------------------------------------------------------------ */

export const PERFORMER_KINDS: readonly InspectionResult['performerKind'][] = ['robot', 'drone', 'scanner', 'officer'];
export const FINDING_KINDS: readonly InspectionFinding['kind'][] = [
  'none', 'seal-broken', 'undeclared-goods', 'quantity-mismatch', 'damage', 'temperature-excursion', 'prohibited-item',
];
export const SEVERITIES: readonly InspectionFinding['severity'][] = ['info', 'minor', 'major'];
export const RESULT_LIMITS = { findings: 50, media: 20, noteChars: 500, refChars: 300, mediaBytes: 10_000_000_000 } as const;
/** How far after the dataset snapshot a gateway may date a result (clock skew allowance). */
export const RESULT_FUTURE_HOURS = 24;

export type InspectionResultValidation = { ok: true; result: InspectionResult } | { ok: false; issues: ValidationIssue[] };

/**
 * Strict validation of a result posted for an open inspection task. Unknown fields are rejected at every
 * level. The task id and shipment id come from the URL and the task, never from the body.
 */
export function validateInspectionResultRequest(input: unknown, ctx: { task: InspectionTask; now: string }): InspectionResultValidation {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!isObj(input)) return { ok: false, issues: [{ path: '$', message: 'Body must be a JSON object.' }] };
  const noExtra = (o: Obj, allowed: string[], base: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add(base ? `${base}.${k}` : k, 'Unknown field.');
  };
  const str = (o: Obj, k: string, p: string, max: number, required = true): string | undefined => {
    const v = o[k];
    if (v === undefined) { if (required) add(p, 'Required.'); return undefined; }
    if (typeof v !== 'string' || v.trim() === '') { add(p, 'Must be a non-empty string.'); return undefined; }
    if (v.length > max) { add(p, `Must be at most ${max} characters.`); return undefined; }
    return v;
  };
  const oneOf = <T extends string>(o: Obj, k: string, p: string, allowed: readonly T[]): T | undefined => {
    const v = o[k];
    if (v === undefined) { add(p, 'Required.'); return undefined; }
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) { add(p, `Must be one of: ${allowed.join(', ')}.`); return undefined; }
    return v as T;
  };

  noExtra(input, ['performedBy', 'performerKind', 'completedAt', 'seal', 'findings', 'media'], '');
  const performedBy = str(input, 'performedBy', 'performedBy', 120);
  if (performedBy !== undefined && !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(performedBy)) add('performedBy', 'Use letters, digits and : . _ - only.');
  const performerKind = oneOf(input, 'performerKind', 'performerKind', PERFORMER_KINDS);

  const completedAt = str(input, 'completedAt', 'completedAt', 40);
  if (completedAt !== undefined) {
    if (!ISO.test(completedAt) || Number.isNaN(Date.parse(completedAt))) add('completedAt', 'Must be an ISO-8601 date-time with a timezone.');
    else if (Date.parse(completedAt) < Date.parse(ctx.task.requestedAt)) add('completedAt', 'Must not be before the task was requested.');
    else if (Date.parse(completedAt) > Date.parse(ctx.now) + RESULT_FUTURE_HOURS * 3_600_000) add('completedAt', `Must not be more than ${RESULT_FUTURE_HOURS} hours after the dataset snapshot time.`);
  }

  let seal: InspectionResult['seal'] | undefined;
  if (!isObj(input.seal)) add('seal', 'Required object with id and intact.');
  else {
    noExtra(input.seal, ['id', 'intact'], 'seal');
    const id = str(input.seal, 'id', 'seal.id', 64);
    if (typeof input.seal.intact !== 'boolean') add('seal.intact', 'Must be true or false.');
    if (id !== undefined && typeof input.seal.intact === 'boolean') seal = { id, intact: input.seal.intact };
  }

  const findings: InspectionFinding[] = [];
  if (!Array.isArray(input.findings) || input.findings.length === 0) add('findings', 'Required non-empty array. Report kind "none" when nothing was found.');
  else if (input.findings.length > RESULT_LIMITS.findings) add('findings', `At most ${RESULT_LIMITS.findings} findings.`);
  else input.findings.forEach((f, i) => {
    const p = `findings[${i}]`;
    if (!isObj(f)) { add(p, 'Must be an object.'); return; }
    noExtra(f, ['kind', 'severity', 'note', 'noteAr'], p);
    const kind = oneOf(f, 'kind', `${p}.kind`, FINDING_KINDS);
    const severity = oneOf(f, 'severity', `${p}.severity`, SEVERITIES);
    const note = str(f, 'note', `${p}.note`, RESULT_LIMITS.noteChars);
    const noteAr = str(f, 'noteAr', `${p}.noteAr`, RESULT_LIMITS.noteChars, false);
    if (kind === 'none' && severity !== undefined && severity !== 'info') add(`${p}.severity`, 'A "none" finding must have severity info.');
    if (kind && severity && note !== undefined) findings.push({ kind, severity, note, ...(noteAr === undefined ? {} : { noteAr }) });
  });

  const media: NonNullable<InspectionResult['media']> = [];
  if (!Array.isArray(input.media)) add('media', 'Required array (may be empty).');
  else if (input.media.length > RESULT_LIMITS.media) add('media', `At most ${RESULT_LIMITS.media} media items.`);
  else input.media.forEach((m, i) => {
    const p = `media[${i}]`;
    if (!isObj(m)) { add(p, 'Must be an object.'); return; }
    noExtra(m, ['ref', 'sha256', 'bytes'], p);
    const ref = str(m, 'ref', `${p}.ref`, RESULT_LIMITS.refChars);
    const sha = m.sha256;
    if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) add(`${p}.sha256`, 'Must be 64 lowercase hex characters (SHA-256).');
    const bytes = m.bytes;
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0 || bytes > RESULT_LIMITS.mediaBytes) add(`${p}.bytes`, `Must be an integer from 0 to ${RESULT_LIMITS.mediaBytes}.`);
    if (ref !== undefined && typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha) && typeof bytes === 'number') media.push({ ref, sha256: sha, bytes });
  });

  if (issues.length || !performedBy || !performerKind || !completedAt || !seal) return { ok: false, issues };
  return {
    ok: true,
    result: {
      taskId: ctx.task.id, shipmentId: ctx.task.shipmentId, performedBy, performerKind, completedAt, seal, findings,
      mediaRefs: media.map((m) => m.ref), media,
    },
  };
}
