import { describe, expect, it } from 'vitest';
import { actorId, authorityOf, can, canSeeReceipt, parseViewAs } from '@/lib/roles';
import { auditCsv, ledgerCsv, toCsv, clearanceRecord, RECORD_SCHEMA } from '@/lib/export';
import { generate } from '@/data/generate';
import { planShipment, simulate, replay } from '@/engine';

describe('role lens', () => {
  it('parses unknown values to customs', () => {
    expect(parseViewAs(null)).toBe('customs');
    expect(parseViewAs('root')).toBe('customs');
    expect(parseViewAs('reg:adafsa')).toBe('reg:adafsa');
    expect(parseViewAs('reg:../x')).toBe('customs');
  });
  it('customs can act, auditors and operators cannot', () => {
    for (const a of ['override-lane', 'resolve-exception', 'run-inspection', 'approve-suggestion'] as const) {
      expect(can('customs', a, 'adafsa')).toBe(true);
      expect(can('auditor', a, 'adc')).toBe(false);
      expect(can('operator', a, 'adc')).toBe(false);
    }
  });
  it('a regulator may only resolve its own authority\'s exceptions', () => {
    expect(can('reg:adafsa', 'resolve-exception', 'adafsa')).toBe(true);
    expect(can('reg:adafsa', 'resolve-exception', 'moiat')).toBe(false);
    expect(can('reg:adafsa', 'resolve-exception')).toBe(false);
    expect(can('reg:adafsa', 'override-lane')).toBe(false);
    expect(can('reg:adafsa', 'approve-suggestion')).toBe(false);
  });
  it('evidence visibility follows the custodian sharing policy', () => {
    const own = { verifiedBy: 'adafsa', sharedWith: [] as string[] };
    const toCustoms = { verifiedBy: 'adafsa', sharedWith: ['adc'] };
    const all = { verifiedBy: 'moiat', sharedWith: 'all' as const };
    expect(canSeeReceipt('reg:adafsa', own)).toBe(true);
    expect(canSeeReceipt('customs', own)).toBe(false);
    expect(canSeeReceipt('customs', toCustoms)).toBe(true);
    expect(canSeeReceipt('reg:tdra', all)).toBe(true);
    expect(canSeeReceipt('reg:tdra', own)).toBe(false);
    expect(canSeeReceipt('auditor', own)).toBe(true);
    expect(canSeeReceipt('operator', all)).toBe(false);
  });
  it('actor ids are stable', () => {
    expect(authorityOf('customs')).toBe('adc');
    expect(actorId('reg:moiat')).toBe('moiat:officer-you');
    expect(actorId('auditor')).toBe('auditor:you');
  });
});

describe('export', () => {
  it('neutralises spreadsheet formulas and quotes cells', () => {
    const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'plain, with comma'], ['+1', '-2']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"plain, with comma"');
    expect(csv).toContain("'+1,'-2");
  });
  it('builds a clearance record and CSVs from the synthetic world', () => {
    const g = generate();
    const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
    const world = replay(sim.events);
    const file = Object.values(world.shipments).find((f) => f.cleared)!;
    const plan = planShipment(world, g.directory, file.shipment, g.now);
    const rec = clearanceRecord(world, g.directory, file, plan, plan.assessment.lane, g.now);
    expect(rec.schema).toBe(RECORD_SCHEMA);
    expect(rec.synthetic).toBe(true);
    expect(rec.declarationRef).toBe(file.shipment.declarationRef);
    expect(rec.approvals.length).toBe(plan.reviewPlan.reviews.length);
    expect(JSON.parse(JSON.stringify(rec)).auditTrail.length).toBe(file.audit.length);
    expect(auditCsv(file).split('\r\n').length).toBeGreaterThan(2);
    expect(ledgerCsv(world.receipts.slice(0, 5)).split('\r\n').length).toBe(7);
  });
});
