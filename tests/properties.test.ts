import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { appendReceipt, demoAttestLedger, verifyAttestations, verifyChain, type EvidenceReceipt } from '@/engine';
import { validateAssessmentRequest } from '@/server/validate';

type Draft = Omit<EvidenceReceipt, 'hash' | 'prevHash' | 'reuseLog'>;
const AUTH = ['customs', 'adafsa', 'moiat', 'moh'];

const draftArb = fc
  .record({
    n: fc.nat(10_000),
    by: fc.constantFrom(...AUTH),
    until: fc.integer({ min: 1, max: 400 }),
    summary: fc.string({ maxLength: 40 }),
  })
  .map(
    ({ n, by, until, summary }): Draft => ({
      id: 'R' + n, type: 'commercial-invoice', subjectRef: 'S' + n, summary, summaryAr: summary, issuer: 'x', verifiedBy: by,
      method: 'document-check', scope: { level: 'shipment', shipmentId: 'S-' + n },
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: new Date(Date.UTC(2026, 0, 1 + until)).toISOString(),
      status: 'verified', sharedWith: 'all',
    }),
  );
const ledgerArb = fc.array(draftArb, { minLength: 1, maxLength: 12 }).map((ds) => ds.reduce<EvidenceReceipt[]>(appendReceipt, []));

describe('ledger properties', () => {
  it('any ledger built by appendReceipt has an intact chain', () => {
    fc.assert(fc.property(ledgerArb, (l) => verifyChain(l).valid));
  });

  it('changing any hashed field of any receipt is detected at or before that receipt', () => {
    fc.assert(
      fc.property(ledgerArb, fc.nat(), fc.constantFrom('subjectRef', 'issuer', 'validUntil', 'verifiedBy', 'id'), (l, k, field) => {
        const i = k % l.length;
        const edited = l.map((r, j) => (j === i ? { ...r, [field]: 'tampered' } : r));
        const res = verifyChain(edited);
        return !res.valid && res.brokenAt === i;
      }),
    );
  });

  it('dropping, reordering or duplicating receipts is detected', () => {
    fc.assert(
      fc.property(ledgerArb.filter((l) => l.length >= 2), fc.nat(), (l, k) => {
        const i = k % (l.length - 1);
        const swapped = [...l];
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        const dup = [...l, l[0]];
        const dropped = l.filter((_, j) => j !== i); // dropping a non-final receipt breaks the link after it
        return !verifyChain(swapped).valid && !verifyChain(dup).valid && !verifyChain(dropped).valid;
      }),
    );
  });

  it('signatures verify for honest ledgers and fail when a signature byte flips', () => {
    fc.assert(
      fc.property(ledgerArb, fc.nat(), (l, k) => {
        const { attestations, keys } = demoAttestLedger(l);
        if (!verifyAttestations(l, attestations, keys).valid) return false;
        const i = k % attestations.length;
        const flipped = attestations.map((a, j) => (j === i ? { ...a, signature: (a.signature[0] === '0' ? '1' : '0') + a.signature.slice(1) } : a));
        return !verifyAttestations(l, flipped, keys).valid;
      }),
      { numRuns: 25 },
    );
  });
});

describe('API input validation', () => {
  const ctx = { traderIds: new Set(['tr-1']), forwarderIds: new Set(['fw-1']), now: '2026-10-09T02:00:00.000Z', idPrefix: 'A' };

  it('never throws, whatever JSON it is handed', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = validateAssessmentRequest(v, ctx);
        return r.ok === false;
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on hostile object shapes', () => {
    const hostile = fc.dictionary(fc.constantFrom('__proto__', 'constructor', 'consignments', 'submitted', 'traderId', 'totalValue', 'prototype'), fc.jsonValue());
    fc.assert(fc.property(hostile, (v) => typeof validateAssessmentRequest(JSON.parse(JSON.stringify(v)), ctx).ok === 'boolean'), { numRuns: 300 });
  });
});
