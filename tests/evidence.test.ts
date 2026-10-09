import { describe, expect, it } from 'vitest';
import { appendReceipt, checkRequirement, verifyChain, requirementsFor } from '@/engine';
import { REQUIREMENTS, REQUIREMENT_BY_ID } from '@/data/authorities';
import { NOW, item, receipt, shipment } from './helpers';

const inst = (s = shipment(), id = 'moiat-conformity') => requirementsFor(s, REQUIREMENTS).find((i) => i.requirementId === id)!;
const check = (rs: ReturnType<typeof receipt>[], s = shipment(), id = 'moiat-conformity', now = NOW) =>
  checkRequirement(inst(s, id), REQUIREMENT_BY_ID[id], s, rs, now);

describe('hash chain', () => {
  const draft = (id: string) => {
    const { hash, prevHash, reuseLog, ...d } = receipt({ id });
    void hash; void prevHash; void reuseLog;
    return d;
  };
  it('verifies an untouched chain', () => {
    let l = appendReceipt([], draft('a'));
    l = appendReceipt(l, draft('b'));
    expect(verifyChain(l).valid).toBe(true);
  });
  it('detects tampering with an earlier receipt', () => {
    let l = appendReceipt([], draft('a'));
    l = appendReceipt(l, draft('b'));
    l[0] = { ...l[0], validUntil: '2099-01-01T00:00:00.000Z' };
    expect(verifyChain(l)).toEqual({ valid: false, brokenAt: 0 });
  });
});

describe('requirements', () => {
  it('maps wireless goods to conformity, type approval and customs cross-check', () => {
    const ids = requirementsFor(shipment(), REQUIREMENTS).map((i) => i.requirementId);
    expect(ids).toEqual(expect.arrayContaining(['cus-docs', 'moiat-conformity', 'tdra-type', 'cus-conf', 'cus-release', 'term-gateout']));
    expect(ids).not.toContain('adafsa-health');
  });
  it('adds the lab requirement only for higher-risk food', () => {
    const plain = shipment({}, [item({ id: 'a', category: 'food', hsCode: '10063000', flags: [] })]);
    const risky = shipment({}, [item({ id: 'b', category: 'food', hsCode: '02071400', flags: ['high-risk-food'] })]);
    expect(requirementsFor(plain, REQUIREMENTS).map((i) => i.requirementId)).not.toContain('adafsa-lab');
    expect(requirementsFor(risky, REQUIREMENTS).map((i) => i.requirementId)).toContain('adafsa-lab');
  });
});

describe('evidence verdicts', () => {
  it('missing when nothing submitted and no receipt', () => {
    const s = shipment({ submitted: [] });
    expect(check([], s).verdict).toBe('missing');
  });
  it('awaiting-review when submitted but not verified', () => {
    expect(check([]).verdict).toBe('awaiting-review');
  });
  it('satisfied-own for the authority that verified it', () => {
    expect(check([receipt()]).verdict).toBe('satisfied-own');
  });
  it('satisfied-reuse when another authority relies on it', () => {
    const c = check([receipt()], shipment(), 'cus-conf');
    expect(c.verdict).toBe('satisfied-reuse');
    expect(c.reusedFrom).toBe('moiat');
  });
  it('expired when validity has ended', () => {
    expect(check([receipt({ validUntil: '2026-10-08T00:00:00.000Z' })]).verdict).toBe('expired');
  });
  it('expires-before-eta when valid now but not on arrival', () => {
    expect(check([receipt({ validUntil: '2026-10-10T00:00:00.000Z' })]).verdict).toBe('expires-before-eta');
  });
  it('scope-partial when a receipt covers only some items', () => {
    const s = shipment({}, [item(), item({ id: 'S1-I2', hsCode: '85176900' })]);
    const c = check([receipt()], s);
    expect(c.verdict).toBe('scope-partial');
    expect(c.uncoveredItemIds).toEqual(['S1-I2']);
  });
  it('scope-partial when the receipt is for a different product', () => {
    expect(check([receipt({ scope: { level: 'trader-product', traderId: 'tr-t', hs6: ['999999'] } })]).verdict).toBe('scope-partial');
  });
  it('not-shared when the custodian limits reliance', () => {
    const c = check([receipt({ sharedWith: ['moiat'] })], shipment(), 'cus-conf');
    expect(c.verdict).toBe('not-shared');
  });
  it('revoked receipts are never relied on', () => {
    expect(check([receipt({ status: 'revoked' })]).verdict).toBe('revoked');
  });
  it('ignores receipts of other traders', () => {
    const c = check([receipt({ scope: { level: 'trader-product', traderId: 'someone-else', hs6: ['851762'] } })]);
    expect(c.verdict).toBe('awaiting-review');
  });
  it('ignores receipts that start in the future', () => {
    expect(check([receipt({ validFrom: '2026-10-10T00:00:00.000Z' })]).verdict).toBe('pending');
  });
});
