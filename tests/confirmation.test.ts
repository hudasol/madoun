import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  apply, createInspectionTask, emptyWorld, inspectionReceiptId, outcomeFromInspection, replay, requiresOfficerConfirmation,
  resultToReceiptDraft, validateEvent, verifyChain,
  type InspectionFinding, type InspectionResult, type MadounEvent, type RiskAssessment, type World,
} from '@/engine';
import { getWorld } from '@/server/world';
import { NOW, shipment } from './helpers';

const S = shipment();
const ASSESS: RiskAssessment = {
  shipmentId: S.id, lane: 'red', perAuthority: [], conflicts: [], reasons: [], recommendedChecks: [],
  pathway: 'physical-inspection', auditFlag: false, assessedAt: NOW,
};
const TASK = createInspectionTask(S, ASSESS, NOW);
const LATER = '2026-10-09T05:00:00.000Z';

const finding = (severity: InspectionFinding['severity'], kind: InspectionFinding['kind'] = 'undeclared-goods'): InspectionFinding => ({ kind, severity, note: 'n' });
const result = (over: Partial<InspectionResult> = {}): InspectionResult => ({
  taskId: TASK.id, shipmentId: S.id, performedBy: 'cell-A1', performerKind: 'robot', completedAt: '2026-10-09T04:00:00.000Z',
  seal: { id: 'SEAL-1', intact: true }, findings: [finding('major')], mediaRefs: [], ...over,
});

/** Validate then apply, the way every ingestion path admits events. Returns the problems of the last event. */
function feed(events: MadounEvent[], from: World = emptyWorld()): { world: World; rejected: string[][] } {
  let w = from;
  const rejected: string[][] = [];
  for (const e of events) {
    const p = validateEvent(w, e);
    if (p.length) rejected.push(p);
    else w = apply(w, e);
  }
  return { world: w, rejected };
}

const upTo = (r: InspectionResult): MadounEvent[] => [
  { type: 'ShipmentRegistered', at: NOW, shipment: S },
  { type: 'InspectionRequested', at: NOW, task: TASK },
  { type: 'InspectionCompleted', at: r.completedAt, result: r },
  { type: 'ReceiptIssued', at: r.completedAt, receipt: resultToReceiptDraft(r) },
];
const confirm = (decision: 'upheld' | 'overturned', note = 'Checked at the container'): MadounEvent =>
  ({ type: 'InspectionConfirmed', at: LATER, shipmentId: S.id, officerId: 'adc:officer-you', decision, note });
const outcome = (r: InspectionResult, decision?: 'upheld' | 'overturned'): MadounEvent =>
  ({ type: 'OutcomeRecorded', at: LATER, outcome: outcomeFromInspection(S, ASSESS, r, [], LATER, 'risk', decision) });

describe('requiresOfficerConfirmation', () => {
  it('is true for a major finding or a broken seal reported by a machine', () => {
    for (const kind of ['robot', 'drone', 'scanner'] as const) {
      expect(requiresOfficerConfirmation(result({ performerKind: kind }))).toBe(true);
      expect(requiresOfficerConfirmation(result({ performerKind: kind, findings: [finding('info', 'none')], seal: { id: 's', intact: false } }))).toBe(true);
    }
  });
  it('is false for minor or informational machine findings with an intact seal', () => {
    expect(requiresOfficerConfirmation(result({ findings: [finding('minor', 'damage')] }))).toBe(false);
    expect(requiresOfficerConfirmation(result({ findings: [finding('info', 'none')] }))).toBe(false);
  });
  it('is false for any result an officer reported', () => {
    expect(requiresOfficerConfirmation(result({ performerKind: 'officer', seal: { id: 's', intact: false } }))).toBe(false);
  });
  it('makes the receipt pending only when confirmation is needed', () => {
    expect(resultToReceiptDraft(result()).status).toBe('pending');
    expect(resultToReceiptDraft(result({ performerKind: 'officer' })).status).toBe('verified');
    expect(resultToReceiptDraft(result({ findings: [finding('minor', 'damage')] })).status).toBe('verified');
  });
});

describe('validateEvent for confirmation', () => {
  const r = result();
  const base = feed(upTo(r)).world;

  it('accepts a well formed confirmation of an unconfirmed machine finding', () => {
    expect(validateEvent(base, confirm('upheld'))).toEqual([]);
  });
  it('requires an officer id and a note', () => {
    expect(validateEvent(base, { ...confirm('upheld'), officerId: ' ' } as MadounEvent)).not.toEqual([]);
    expect(validateEvent(base, confirm('upheld', ''))).not.toEqual([]);
    expect(validateEvent(base, confirm('upheld', 'x'.repeat(1001)))).not.toEqual([]);
  });
  it('rejects an unknown decision, an unknown shipment and a confirmation that predates the result', () => {
    expect(validateEvent(base, confirm('maybe' as never))).not.toEqual([]);
    expect(validateEvent(base, { ...confirm('upheld'), shipmentId: 'NOPE' } as MadounEvent)).not.toEqual([]);
    expect(validateEvent(base, { ...confirm('upheld'), at: NOW } as MadounEvent)).not.toEqual([]);
  });
  it('rejects a confirmation when there is no unconfirmed machine finding', () => {
    const noResult = feed(upTo(r).slice(0, 2)).world;
    expect(validateEvent(noResult, confirm('upheld'))).not.toEqual([]);
    const officer = feed(upTo(result({ performerKind: 'officer' }))).world;
    expect(validateEvent(officer, confirm('upheld'))).not.toEqual([]);
    const minor = feed(upTo(result({ findings: [finding('minor', 'damage')] }))).world;
    expect(validateEvent(minor, confirm('upheld'))).not.toEqual([]);
  });
  it('rejects a second confirmation', () => {
    const once = feed([confirm('upheld')], base).world;
    expect(validateEvent(once, confirm('overturned'))).not.toEqual([]);
  });
  it('rejects a learning outcome before confirmation and accepts it after', () => {
    expect(validateEvent(base, outcome(r))).not.toEqual([]);
    const once = feed([confirm('upheld')], base).world;
    expect(validateEvent(once, outcome(r, 'upheld'))).toEqual([]);
  });
  it('rejects issuing the receipt of a serious machine finding as verified before it is upheld', () => {
    const noReceipt = feed(upTo(r).slice(0, 3)).world;
    const forged: MadounEvent = { type: 'ReceiptIssued', at: r.completedAt, receipt: { ...resultToReceiptDraft(r), status: 'verified' } };
    expect(validateEvent(noReceipt, forged)).not.toEqual([]);
  });
});

describe('confirm and overturn, end to end', () => {
  const r = result();
  const rid = inspectionReceiptId(r.taskId);

  it('upheld: the pending receipt becomes verified and the outcome is a confirmed finding', () => {
    const { world: before } = feed(upTo(r));
    expect(before.receipts.find((x) => x.id === rid)?.status).toBe('pending');
    const events = [...upTo(r), confirm('upheld'), outcome(r, 'upheld')];
    const { world, rejected } = feed(events);
    expect(rejected).toEqual([]);
    expect(world.receipts.find((x) => x.id === rid)?.status).toBe('verified');
    expect(world.shipments[S.id].inspectionConfirmation).toMatchObject({ decision: 'upheld', officerId: 'adc:officer-you' });
    expect(world.shipments[S.id].outcome?.result).toBe('confirmed');
    expect(world.shipments[S.id].audit.some((a) => a.action.includes('upheld') && /[؀-ۿ]/.test(a.actionAr))).toBe(true);
    expect(verifyChain(world.receipts).valid).toBe(true);
    expect(replay(events)).toEqual(world);
  });

  it('overturned: the receipt is revoked with the note as reason and the outcome is a false alarm', () => {
    const events = [...upTo(r), confirm('overturned', 'Goods match the declaration'), outcome(r, 'overturned')];
    const { world, rejected } = feed(events);
    expect(rejected).toEqual([]);
    const rc = world.receipts.find((x) => x.id === rid)!;
    expect(rc.status).toBe('revoked');
    expect(rc.revokedReason).toBe('Goods match the declaration');
    expect(world.shipments[S.id].outcome?.result).toBe('false-alarm');
    expect(verifyChain(world.receipts).valid).toBe(true);
    expect(replay(events)).toEqual(world);
  });

  it('replay keeps the first confirmation if a duplicate slips into history', () => {
    const events = [...upTo(r), confirm('upheld'), confirm('overturned')];
    const w = replay(events);
    expect(w.shipments[S.id].inspectionConfirmation?.decision).toBe('upheld');
    expect(w.receipts.find((x) => x.id === rid)?.status).toBe('verified');
    expect(events.reduce<World>(apply, emptyWorld())).toEqual(w);
  });
});

describe('property: no serious machine finding is ever verified without a confirmation event', () => {
  const findingArb = fc.record({
    kind: fc.constantFrom<InspectionFinding['kind']>('none', 'seal-broken', 'undeclared-goods', 'quantity-mismatch', 'damage', 'prohibited-item'),
    severity: fc.constantFrom<InspectionFinding['severity']>('info', 'minor', 'major'),
    note: fc.constant('n'),
  });
  const resultArb = fc.record({
    performerKind: fc.constantFrom<InspectionResult['performerKind']>('robot', 'drone', 'scanner', 'officer'),
    findings: fc.array(findingArb, { minLength: 1, maxLength: 3 }),
    intact: fc.boolean(),
  }).map(({ performerKind, findings, intact }) => result({ performerKind, findings, seal: { id: 'S', intact } }));
  // Arbitrary attempts an adversarial or careless client could make, in any order.
  const stepArb = fc.constantFrom('confirm-upheld', 'confirm-overturned', 'outcome', 'forge-verified-receipt', 'blank-note');

  it('holds for every sequence of validated events, under both reducers', () => {
    fc.assert(
      fc.property(resultArb, fc.boolean(), fc.array(stepArb, { maxLength: 6 }), (r, issueFirst, steps) => {
        const events: MadounEvent[] = upTo(r).slice(0, 3);
        if (issueFirst) events.push(upTo(r)[3]);
        for (const s of steps) {
          if (s === 'confirm-upheld') events.push(confirm('upheld'));
          if (s === 'confirm-overturned') events.push(confirm('overturned'));
          if (s === 'outcome') events.push(outcome(r));
          if (s === 'blank-note') events.push(confirm('upheld', ' '));
          if (s === 'forge-verified-receipt') events.push({ type: 'ReceiptIssued', at: LATER, receipt: { ...resultToReceiptDraft(r), status: 'verified' } });
        }
        const { world } = feed(events);
        const accepted = world.log;
        const upheld = accepted.some((e) => e.type === 'InspectionConfirmed' && e.decision === 'upheld');
        const rc = world.receipts.find((x) => x.id === inspectionReceiptId(r.taskId));
        if (requiresOfficerConfirmation(r) && rc?.status === 'verified' && !upheld) return false;
        if (requiresOfficerConfirmation(r) && world.shipments[S.id].outcome && !world.shipments[S.id].inspectionConfirmation) return false;
        return JSON.stringify(replay(accepted)) === JSON.stringify(world);
      }),
      { numRuns: 400 },
    );
  });

  it('holds across the whole simulated history, and every confirmation lands inside the release window', () => {
    const { sim } = getWorld();
    const events = [...sim.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const w = replay(events);
    let serious = 0;
    for (const f of Object.values(w.shipments)) {
      const r = f.inspectionResult;
      if (!r || !requiresOfficerConfirmation(r)) continue;
      serious++;
      expect(f.inspectionConfirmation, f.shipment.id).toBeDefined();
      const rc = w.receipts.find((x) => x.id === inspectionReceiptId(r.taskId))!;
      expect(rc.status === 'verified').toBe(f.inspectionConfirmation!.decision === 'upheld');
      const releaseStart = events.find((e) => e.type === 'ReviewStarted' && e.shipmentId === f.shipment.id && e.requirementId === 'cus-release');
      expect(Date.parse(f.inspectionConfirmation!.at)).toBeLessThanOrEqual(Date.parse(releaseStart!.at));
      expect(Date.parse(f.inspectionConfirmation!.at)).toBeLessThanOrEqual(Date.parse(f.outcome!.recordedAt));
    }
    expect(serious).toBeGreaterThan(0);
  });
});
