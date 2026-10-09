import { describe, expect, it } from 'vitest';
import { replay, validateEvent, type MadounEvent } from '@/engine';
import { getWorld } from '@/server/world';

const { world, sim } = getWorld();
const someId = Object.keys(world.shipments)[0];
const AT = '2026-10-09T02:00:00.000Z';

describe('validateEvent', () => {
  it('accepts every event the simulator itself produced, in order', () => {
    let w = replay([]);
    const events = [...sim.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 600);
    const builder = replay;
    const bad: string[] = [];
    for (let i = 0; i < events.length; i++) {
      const prefix = builder(events.slice(0, i));
      const p = validateEvent(prefix, events[i]);
      if (p.length) bad.push(`${i} ${events[i].type}: ${p.join(' ')}`);
      w = prefix;
    }
    expect(bad).toEqual([]);
    expect(w).toBeDefined();
  }, 60_000);

  it('rejects references to things that do not exist', () => {
    const cases: MadounEvent[] = [
      { type: 'ReviewStarted', at: AT, shipmentId: 'NOPE', requirementId: 'r', authorityId: 'customs', officerId: 'o' },
      { type: 'ReceiptRevoked', at: AT, receiptId: 'NOPE', reason: 'x' },
      { type: 'ReceiptReused', at: AT, receiptId: 'NOPE', entry: {} as never },
      { type: 'ShipmentCleared', at: AT, shipmentId: 'NOPE', preArrival: false },
    ];
    for (const ev of cases) expect(validateEvent(world, ev).length, ev.type).toBeGreaterThan(0);
  });

  it('rejects blank or oversized free text, bad enums and bad timestamps', () => {
    const base = { at: AT, shipmentId: someId, requirementId: 'r', authorityId: 'customs', officerId: 'o' } as const;
    expect(validateEvent(world, { type: 'ReviewCompleted', ...base, result: 'approved', note: ' ' })).not.toEqual([]);
    expect(validateEvent(world, { type: 'ReviewCompleted', ...base, result: 'maybe' as never })).not.toEqual([]);
    expect(validateEvent(world, { type: 'ReviewCompleted', ...base, result: 'approved', note: 'x'.repeat(1001) })).not.toEqual([]);
    expect(validateEvent(world, { type: 'ReviewStarted', ...base, at: 'yesterday' })).not.toEqual([]);
    expect(validateEvent(world, { type: 'OfficerOverride', at: AT, shipmentId: someId, lane: 'purple' as never, officerId: 'o', reason: 'r' })).not.toEqual([]);
    expect(validateEvent(world, { type: 'RuleSuggestionApproved', at: AT, key: 'k', multiplier: 50, officerId: 'o' })).not.toEqual([]);
  });

  it('accepts a well-formed override', () => {
    expect(validateEvent(world, { type: 'OfficerOverride', at: AT, shipmentId: someId, lane: 'red', officerId: 'o', reason: 'seal looked tampered' })).toEqual([]);
  });

  it('rejects registering the same shipment twice', () => {
    expect(validateEvent(world, { type: 'ShipmentRegistered', at: AT, shipment: world.shipments[someId].shipment })).not.toEqual([]);
  });
});
