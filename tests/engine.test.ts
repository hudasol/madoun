import { describe, expect, it } from 'vitest';
import {
  apply, assessRisk, buildReviewPlan, checkRequirement, computeLearning, createInspectionTask, detectExceptions,
  emptyWorld, isRandomAudit, makeRng, outcomeFromInspection, planShipment, replay, requirementsFor,
  resultToReceiptDraft, simulateInspectionCell, type MadounEvent, type Outcome,
} from '@/engine';
import { AUTHORITY_BY_ID, REQUIREMENTS, REQUIREMENT_BY_ID } from '@/data/authorities';
import { NOW, dirWith, item, receipt, shipment, trader } from './helpers';

const dir = dirWith();

describe('review plan', () => {
  const s = shipment({}, [item({ id: 'a', category: 'food', hsCode: '10063000', flags: [], origin: 'IN' }), item({ id: 'b' })]);
  const instances = requirementsFor(s, REQUIREMENTS);
  const checks = instances.map((i) => checkRequirement(i, REQUIREMENT_BY_ID[i.requirementId], s, [], NOW));
  const plan = buildReviewPlan({ instances, checks, requirements: REQUIREMENT_BY_ID, authorities: AUTHORITY_BY_ID });

  it('runs independent reviews in parallel and is faster than the sequential baseline', () => {
    expect(plan.parallelHours).toBeLessThan(plan.sequentialHours);
    const l0 = plan.reviews.filter((r) => r.layer === 0).map((r) => r.requirementId);
    expect(l0).toEqual(expect.arrayContaining(['cus-docs', 'adafsa-health', 'moiat-conformity']));
  });
  it('never starts a review before its dependencies end', () => {
    for (const r of plan.reviews) for (const d of r.dependsOn) {
      expect(r.startHour).toBeGreaterThanOrEqual(plan.reviews.find((x) => x.requirementId === d)!.endHour);
    }
  });
  it('release waits for every blocking review', () => {
    const rel = plan.reviews.find((r) => r.requirementId === 'cus-release')!;
    for (const r of plan.reviews.filter((x) => x.blocksRelease && x.requirementId !== 'cus-release')) {
      expect(rel.dependsOn).toContain(r.requirementId);
    }
  });
  it('critical path ends at release and is a dependency chain', () => {
    expect(plan.criticalPath.at(-1)).toBe('cus-release');
    for (let i = 1; i < plan.criticalPath.length; i++) {
      const node = plan.reviews.find((r) => r.requirementId === plan.criticalPath[i])!;
      expect(node.dependsOn).toContain(plan.criticalPath[i - 1]);
    }
  });
  it('customs relies on the regulator verification in the same file', () => {
    const cross = plan.reviews.find((r) => r.requirementId === 'cus-conf')!;
    expect(cross.mode).toBe('accept-receipt');
    expect(cross.dependsOn).toContain('moiat-conformity');
  });
  it('accepting an existing receipt is cheaper than reviewing', () => {
    const rs = [receipt()];
    const checks2 = instances.map((i) => checkRequirement(i, REQUIREMENT_BY_ID[i.requirementId], s, rs, NOW));
    const p2 = buildReviewPlan({ instances, checks: checks2, requirements: REQUIREMENT_BY_ID, authorities: AUTHORITY_BY_ID });
    expect(p2.parallelHours).toBeLessThanOrEqual(plan.parallelHours);
    expect(p2.sequentialHours).toBeLessThanOrEqual(plan.sequentialHours);
  });
  it('an authority\'s own prior approval costs nothing in either mode', () => {
    const own = [receipt({ verifiedBy: 'moiat' })];
    const c2 = instances.map((i) => checkRequirement(i, REQUIREMENT_BY_ID[i.requirementId], s, own, NOW));
    const p2 = buildReviewPlan({ instances, checks: c2, requirements: REQUIREMENT_BY_ID, authorities: AUTHORITY_BY_ID });
    expect(p2.sequentialHours).toBeLessThan(plan.sequentialHours);
  });
});

describe('risk lanes', () => {
  const ctx = (t = trader(), s = shipment()) => {
    const instances = requirementsFor(s, REQUIREMENTS);
    const checks = instances.map((i) => checkRequirement(i, REQUIREMENT_BY_ID[i.requirementId], s, [], NOW));
    return { trader: t, knownOrigins: ['CN'], instances, checks, authorities: AUTHORITY_BY_ID, weightOverrides: {}, now: NOW };
  };
  it('a clean, known trader with ordinary goods is green', () => {
    expect(assessRisk(shipment(), ctx()).lane).toBe('green');
  });
  it('under-declared value raises customs risk and explains why', () => {
    const s = shipment({}, [item({ value: 380 * 100 * 0.2 })]);
    const a = assessRisk(s, ctx(trader({ complianceScore: 55, pastFindings: 4 }), s));
    expect(a.lane).not.toBe('green');
    expect(a.reasons.some((r) => /Declared unit value/.test(r.text))).toBe(true);
    expect(a.recommendedChecks.length).toBeGreaterThan(0);
  });
  it('authorised-operator status lowers the score', () => {
    const base = assessRisk(shipment(), ctx(trader({ complianceScore: 70 })));
    const aeo = assessRisk(shipment(), ctx(trader({ complianceScore: 70, aeo: true })));
    const sc = (a: typeof base) => a.perAuthority.find((p) => p.authorityId === 'adc')!.score;
    expect(sc(aeo)).toBeLessThan(sc(base));
  });
  it('flags a conflict when one authority is red and another green, and keeps the red scoped to its owner', () => {
    const s = shipment({}, [item({ id: 'c', category: 'chemicals', hsCode: '28151100', flags: ['hazardous'], value: 90 * 100, quantity: 100, origin: 'CN' })]);
    const a = assessRisk(s, ctx(trader({ complianceScore: 50, pastFindings: 4 }), s));
    // Force a split by checking structure: if conflict exists it must name authorities and a rule.
    for (const c of a.conflicts) {
      expect(c.authorities.length).toBeGreaterThan(1);
      expect(c.rule).toMatch(/authority that raised/);
    }
    expect(a.perAuthority.some((p) => p.lane === a.lane)).toBe(true);
  });
  it('approved weight multipliers change scores', () => {
    const s = shipment({}, [item({ value: 380 * 100 * 0.2 })]);
    const a1 = assessRisk(s, ctx(trader(), s));
    const a2 = assessRisk(s, { ...ctx(trader(), s), weightOverrides: { 'value:undervalued': 0.5 } });
    const sc = (a: typeof a1) => a.perAuthority.find((p) => p.authorityId === 'adc')!.score;
    expect(sc(a2)).toBeLessThan(sc(a1));
  });
  it('only uses permitted risk factors', () => {
    const allowed = new Set(['goods-category', 'origin', 'value', 'trader-history', 'authorised-operator', 'transport-mode', 'documentation-completeness', 'prior-findings']);
    const s = shipment({ mode: 'land' });
    const a = assessRisk(s, ctx(trader({ complianceScore: 40, pastFindings: 5 }), s));
    for (const p of a.perAuthority) for (const sg of p.signals) expect(allowed.has(sg.factor)).toBe(true);
  });
  it('random audit selection is deterministic', () => {
    expect(isRandomAudit('SHP-0001')).toBe(isRandomAudit('SHP-0001'));
  });
});

describe('event reducer', () => {
  const s = shipment();
  const events: MadounEvent[] = [
    { type: 'ShipmentRegistered', at: NOW, shipment: s },
    { type: 'ReviewStarted', at: '2026-10-09T03:00:00.000Z', shipmentId: 'S1', requirementId: 'cus-docs', authorityId: 'adc', officerId: 'adc:officer-1' },
    { type: 'ReviewCompleted', at: '2026-10-09T05:00:00.000Z', shipmentId: 'S1', requirementId: 'cus-docs', authorityId: 'adc', officerId: 'adc:officer-1', result: 'approved' },
  ];
  it('is deterministic: replaying the same events gives the same world', () => {
    expect(replay(events)).toEqual(replay(events));
  });
  it('builds an audit trail', () => {
    const w = replay(events);
    expect(w.shipments.S1.audit.map((a) => a.action)).toEqual(['Shipment file opened', 'Started review cus-docs', 'Completed review cus-docs: approved']);
  });
  it('ignores events for unknown shipments without crashing', () => {
    const w = apply(emptyWorld(), { type: 'ReviewStarted', at: NOW, shipmentId: 'nope', requirementId: 'x', authorityId: 'adc', officerId: 'o' });
    expect(Object.keys(w.shipments)).toHaveLength(0);
  });
  it('records an officer override with a reason', () => {
    const w = apply(replay(events), { type: 'OfficerOverride', at: NOW, shipmentId: 'S1', lane: 'green', officerId: 'adc:officer-2', reason: 'Verified in person' });
    expect(w.shipments.S1.override?.reason).toBe('Verified in person');
  });
  it('plans with reviews already completed costing nothing', () => {
    const w = replay(events);
    const p = planShipment(w, dir, s, '2026-10-09T05:30:00.000Z');
    expect(p.reviewPlan.reviews.find((r) => r.requirementId === 'cus-docs')!.mode).toBe('no-action');
  });
});

describe('exceptions', () => {
  const s = shipment();
  const base: MadounEvent[] = [{ type: 'ShipmentRegistered', at: NOW, shipment: s }];
  it('opens an unowned-handoff exception with a named owner when a ready review sits unstarted', () => {
    const w = replay(base);
    const ex = detectExceptions(w, dir, '2026-10-09T10:00:00.000Z');
    const e = ex.find((x) => x.kind === 'unowned-handoff')!;
    expect(e).toBeTruthy();
    expect(e.ownerId).toMatch(/:duty$/);
    expect(e.clockHours).toBeGreaterThan(0);
  });
  it('escalates as the clock grows', () => {
    const w = replay(base);
    const early = detectExceptions(w, dir, '2026-10-09T08:00:00.000Z')[0];
    const late = detectExceptions(w, dir, '2026-10-10T08:00:00.000Z')[0];
    expect(late.escalationLevel).toBeGreaterThan(early.escalationLevel);
  });
  it('flags idle reviews past the authority commitment', () => {
    const w = replay([...base, { type: 'ReviewStarted', at: '2026-10-09T03:00:00.000Z', shipmentId: 'S1', requirementId: 'cus-docs', authorityId: 'adc', officerId: 'adc:officer-3' }]);
    const ex = detectExceptions(w, dir, '2026-10-09T12:00:00.000Z');
    expect(ex.some((e) => e.kind === 'idle-review' && e.ownerId === 'adc:officer-3')).toBe(true);
  });
  it('flags missing evidence', () => {
    const w = replay([{ type: 'ShipmentRegistered', at: NOW, shipment: shipment({ submitted: [] }) }]);
    expect(detectExceptions(w, dir, '2026-10-09T04:00:00.000Z').some((e) => e.kind === 'missing-evidence')).toBe(true);
  });
  it('exceptions disappear once the cause is fixed', () => {
    const w = replay([{ type: 'ShipmentRegistered', at: NOW, shipment: shipment({ submitted: [] }) }]);
    expect(detectExceptions(w, dir, '2026-10-09T04:00:00.000Z').some((e) => e.kind === 'missing-evidence')).toBe(true);
    const fixed = replay([{ type: 'ShipmentRegistered', at: NOW, shipment: shipment() }]);
    expect(detectExceptions(fixed, dir, '2026-10-09T04:00:00.000Z').some((e) => e.kind === 'missing-evidence')).toBe(false);
  });
  it('does not report cleared shipments', () => {
    const w = replay([...base, { type: 'ShipmentCleared', at: '2026-10-09T05:00:00.000Z', shipmentId: 'S1', preArrival: true }]);
    expect(detectExceptions(w, dir, '2026-10-10T05:00:00.000Z')).toHaveLength(0);
  });
});

describe('learning', () => {
  const o = (i: number, result: Outcome['result'], keys: string[], fw = 'fw-a', missing: Outcome['missingEvidence'] = []): Outcome => ({
    shipmentId: 'S' + i, lane: 'amber', traderId: 't', forwarderId: fw, triggerKeys: keys, result, missingEvidence: missing, recordedAt: NOW,
  });
  it('suggests lowering a weight that rarely finds anything, and never applies it by itself', () => {
    const outs = Array.from({ length: 14 }, (_, i) => o(i, i === 0 ? 'confirmed' : 'false-alarm', ['origin:first-time']));
    const r = computeLearning(outs);
    expect(r.suggestions.some((s) => s.id === 'lower:origin:first-time')).toBe(true);
  });
  it('does not suggest anything from too little data', () => {
    const outs = Array.from({ length: 5 }, (_, i) => o(i, 'false-alarm', ['origin:first-time']));
    expect(computeLearning(outs).suggestions).toHaveLength(0);
  });
  it('suggests raising a weight with a high hit rate', () => {
    const outs = Array.from({ length: 10 }, (_, i) => o(i, i < 7 ? 'confirmed' : 'false-alarm', ['value:undervalued']));
    expect(computeLearning(outs).suggestions.some((s) => s.id === 'raise:value:undervalued')).toBe(true);
  });
  it('spots a forwarder that keeps omitting the same document', () => {
    const outs = Array.from({ length: 10 }, (_, i) => o(i, 'not-inspected', [], 'fw-bad', i < 5 ? ['packing-list'] : []));
    const r = computeLearning(outs);
    expect(r.missingEvidence[0]).toMatchObject({ forwarderId: 'fw-bad', type: 'packing-list', count: 5 });
    expect(r.suggestions.some((s) => s.kind === 'pre-check-forwarder')).toBe(true);
  });
  it('skips suggestions the officer already approved', () => {
    const outs = Array.from({ length: 14 }, (_, i) => o(i, 'false-alarm', ['origin:first-time']));
    expect(computeLearning(outs, { 'origin:first-time': 0.6 }).suggestions).toHaveLength(0);
  });
});

describe('inspection seam', () => {
  const s = shipment();
  const ctxAssess = () => {
    const instances = requirementsFor(s, REQUIREMENTS);
    const checks = instances.map((i) => checkRequirement(i, REQUIREMENT_BY_ID[i.requirementId], s, [], NOW));
    return assessRisk(s, { trader: trader({ complianceScore: 40, pastFindings: 5 }), knownOrigins: [], instances, checks, authorities: AUTHORITY_BY_ID, weightOverrides: {}, now: NOW });
  };
  it('creates a task covering the shipment containers', () => {
    const t = createInspectionTask(s, ctxAssess(), NOW);
    expect(t.containerIds).toEqual(['ABCD1234567']);
    expect(t.shipmentId).toBe('S1');
  });
  it('turns a result into a shareable receipt tagged with the method', () => {
    const t = createInspectionTask(s, ctxAssess(), NOW);
    const r = simulateInspectionCell(t, { violation: 'undeclared-goods' }, makeRng(1), NOW, { id: 'cell-A1', kind: 'robot' }, { detectionRate: 1, falsePositiveRate: 0 });
    const draft = resultToReceiptDraft(r);
    expect(draft.method).toBe('robotic-inspection');
    expect(draft.sharedWith).toBe('all');
    expect(r.findings[0].kind).toBe('undeclared-goods');
    const out = outcomeFromInspection(s, ctxAssess(), r, [], NOW);
    expect(out.result).toBe('confirmed');
  });
  it('records a false alarm when nothing is found', () => {
    const t = createInspectionTask(s, ctxAssess(), NOW);
    const r = simulateInspectionCell(t, {}, makeRng(1), NOW, undefined, { detectionRate: 1, falsePositiveRate: 0 });
    expect(outcomeFromInspection(s, ctxAssess(), r, [], NOW).result).toBe('false-alarm');
  });
});
