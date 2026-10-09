import { describe, expect, it } from 'vitest';
import { generate } from '@/data/generate';
import { computeKpis, detectExceptions, simulate, verifyChain, worldAt } from '@/engine';

const g = generate();
const run = () => simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
const sim = run();

describe('synthetic data', () => {
  it('is deterministic for a seed', () => {
    const g2 = generate();
    expect(g2.shipments.map((s) => s.id + s.eta)).toEqual(g.shipments.map((s) => s.id + s.eta));
  });
  it('contains no real-looking personal data fields', () => {
    expect(JSON.stringify(g.shipments)).not.toMatch(/@|\+971/);
  });
});

describe('simulation', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(run().results)).toEqual(JSON.stringify(sim.results));
  });
  it('clears every shipment exactly once', () => {
    const cleared = sim.events.filter((e) => e.type === 'ShipmentCleared');
    expect(cleared).toHaveLength(g.shipments.length);
  });
  it('Madoun is never slower than today for any shipment', () => {
    for (const r of sim.results) expect(r.madounHours).toBeLessThanOrEqual(r.todayHours + 0.01);
  });
  it('improves pre-arrival clearance and median release time', () => {
    const k = computeKpis(sim.results);
    expect(k.madounPreArrivalPct).toBeGreaterThan(k.todayPreArrivalPct);
    expect(k.madounMedianHours).toBeLessThan(k.todayMedianHours);
    expect(k.repeatChecksAvoided).toBeGreaterThan(0);
  });
  it('has all three lanes, with red the rarest', () => {
    const k = computeKpis(sim.results);
    expect(k.byLane.green.count).toBeGreaterThan(k.byLane.amber.count);
    expect(k.byLane.amber.count).toBeGreaterThan(k.byLane.red.count);
    expect(k.byLane.red.count).toBeGreaterThan(0);
  });
  it('events are ordered in time after sorting', () => {
    for (let i = 1; i < sim.events.length; i++) expect(Date.parse(sim.events[i].at)).toBeGreaterThanOrEqual(Date.parse(sim.events[i - 1].at));
  });
});

describe('time travel and the ledger', () => {
  const mid = worldAt(sim.events, '2026-10-07T12:00:00.000Z');
  const end = worldAt(sim.events, g.now);
  it('earlier worlds contain fewer shipments and receipts', () => {
    expect(Object.keys(mid.shipments).length).toBeLessThan(Object.keys(end.shipments).length);
    expect(mid.receipts.length).toBeLessThan(end.receipts.length);
  });
  it('the replayed ledger hash chain verifies', () => {
    expect(verifyChain(end.receipts).valid).toBe(true);
  });
  it('shows receipts reused across authorities and shipments', () => {
    expect(end.receipts.reduce((a, r) => a + r.reuseLog.length, 0)).toBeGreaterThan(20);
    const crossAuthority = end.receipts.some((r) => r.reuseLog.some((u) => u.acceptedByAuthorityId !== r.verifiedBy));
    expect(crossAuthority).toBe(true);
  });
  it('the snapshot has open exceptions and every one has an owner', () => {
    const ex = detectExceptions(end, g.directory, g.now);
    expect(ex.length).toBeGreaterThan(3);
    for (const e of ex) expect(e.ownerId).toBeTruthy();
  });
  it('plants the recurring missing document for one forwarder', () => {
    const missing = Object.values(g.truth).filter((t) => t.missing.includes('packing-list')).length;
    expect(missing).toBeGreaterThan(5);
  });
});
