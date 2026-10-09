import { describe, expect, it } from 'vitest';
import { appendReceipt, attest, demoAttestLedger, demoPublicKeys, demoSigner, verifyAttestations, type EvidenceReceipt } from '@/engine';
import { getWorld } from '@/server/world';

function draft(id: string, by: string): Omit<EvidenceReceipt, 'hash' | 'prevHash' | 'reuseLog'> {
  return {
    id, type: 'commercial-invoice', subjectRef: id, summary: 's', summaryAr: 's', issuer: 'x', verifiedBy: by,
    method: 'document-check', scope: { level: 'shipment', shipmentId: 'S-1' },
    validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2026-02-01T00:00:00.000Z', status: 'verified', sharedWith: 'all',
  } as never;
}
const ledgerOf = (...by: string[]) => by.reduce<EvidenceReceipt[]>((l, a, i) => appendReceipt(l, draft('R' + i, a)), []);

describe('receipt attestations', () => {
  it('verifies a correctly signed ledger using public keys only', () => {
    const ledger = ledgerOf('customs', 'adafsa', 'customs');
    const { attestations, keys } = demoAttestLedger(ledger);
    const rep = verifyAttestations(ledger, attestations, keys);
    expect(rep).toMatchObject({ valid: true, signed: 3, total: 3, problems: [] });
  });

  it('signatures are deterministic (Ed25519), so the demo is reproducible', () => {
    const ledger = ledgerOf('customs');
    expect(demoAttestLedger(ledger).attestations).toEqual(demoAttestLedger(ledger).attestations);
  });

  it('rejects a receipt edited after signing, and the chain break is reported too', () => {
    const ledger = ledgerOf('customs', 'adafsa');
    const { attestations, keys } = demoAttestLedger(ledger);
    const edited = ledger.map((r, i) => (i === 0 ? { ...r, validUntil: '2030-01-01T00:00:00.000Z' } : r));
    const rep = verifyAttestations(edited, attestations, keys);
    expect(rep.valid).toBe(false);
    expect(rep.chain.valid).toBe(false);
  });

  it('rejects a forged signature, a missing one, and an unknown key', () => {
    const ledger = ledgerOf('customs', 'adafsa', 'moh');
    const { attestations, keys } = demoAttestLedger(ledger);
    const forged = attestations.map((a, i) => (i === 0 ? { ...a, signature: a.signature.replace(/^../, (h) => (h === 'ff' ? '00' : 'ff')) } : a));
    const missing = attestations.slice(1);
    const noKey = { ...keys };
    delete noKey.moh;
    expect(verifyAttestations(ledger, forged, keys).problems).toEqual([{ index: 0, receiptId: 'R0', problem: 'bad-signature' }]);
    expect(verifyAttestations(ledger, missing, keys).problems[0]).toMatchObject({ index: 0, problem: 'missing' });
    expect(verifyAttestations(ledger, attestations, noKey).problems).toEqual([{ index: 2, receiptId: 'R2', problem: 'unknown-key' }]);
  });

  it('a valid signature by the wrong authority is not accepted', () => {
    const ledger = ledgerOf('adafsa');
    const keys = demoPublicKeys(['adafsa', 'customs']);
    const impostor = attest(ledger[0], demoSigner('customs'));
    const rep = verifyAttestations(ledger, [impostor], keys);
    expect(rep.valid).toBe(false);
    expect(rep.problems[0].problem).toBe('wrong-signer');
  });

  it('malformed signature or key material fails closed instead of throwing', () => {
    const ledger = ledgerOf('customs');
    const { attestations } = demoAttestLedger(ledger);
    expect(verifyAttestations(ledger, [{ ...attestations[0], signature: 'zz' }], demoPublicKeys(['customs'])).valid).toBe(false);
    expect(verifyAttestations(ledger, attestations, { customs: 'nothex' }).valid).toBe(false);
  });

  it('signs and verifies the whole seeded world ledger', () => {
    const { world } = getWorld();
    const { attestations, keys } = demoAttestLedger(world.receipts);
    expect(verifyAttestations(world.receipts, attestations, keys).valid).toBe(true);
  });
});
