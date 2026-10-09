import { describe, expect, it } from 'vitest';
import { generate } from '@/data/generate';
import { AUTHORITIES } from '@/data/authorities';
import { allItems, simulate } from '@/engine';
import { sha256Hex } from '@/engine/hash';
import { actorName, inlineActors } from '@/lib/actors';

const g = generate();
const ARABIC = /[؀-ۿ]/;
const names = { authorities: g.directory.authorities, traders: g.directory.traders };

describe('Arabic twins for data text', () => {
  it('every goods item has a non-empty Arabic description', () => {
    const items = g.shipments.flatMap(allItems);
    expect(items.length).toBeGreaterThan(200);
    for (const i of items) {
      expect(i.descriptionAr, i.description).toBeTruthy();
      expect(i.descriptionAr).toMatch(ARABIC);
      expect(i.descriptionAr).not.toBe(i.description);
    }
  });

  it('every forwarder has an Arabic name', () => {
    const fws = Object.values(g.directory.forwarders);
    expect(fws.length).toBeGreaterThan(0);
    for (const f of fws) expect(f.nameAr, f.id).toMatch(ARABIC);
  });

  it('every carrier and vessel has an Arabic form', () => {
    for (const s of g.shipments) {
      expect(s.carrierAr, s.carrier).toMatch(ARABIC);
      if (s.mode === 'sea') expect(s.conveyanceAr).toMatch(ARABIC);
    }
  });

  it('resolves every duty officer and officer shape to readable Arabic', () => {
    for (const a of AUTHORITIES) {
      const duty = actorName(a.dutyOfficer, 'ar', names);
      expect(duty).toMatch(ARABIC);
      expect(duty).toContain(a.nameAr);
      expect(duty).not.toContain(':');
      expect(actorName(a.dutyOfficer, 'en', names)).toBe(`${a.name} duty officer`);
      expect(actorName(`${a.id}:officer-3`, 'ar', names)).toContain(a.nameAr);
      expect(actorName(`${a.id}:officer`, 'ar', names)).toContain(a.nameAr);
    }
    expect(actorName('adc:duty', 'ar', names)).toBe('ضابط المناوبة، جمارك أبوظبي');
    expect(actorName('adc:officer-you', 'ar', names)).toMatch(ARABIC);
    expect(actorName('system', 'ar', names)).toMatch(ARABIC);
    expect(actorName('cell-A1', 'ar', names)).toMatch(ARABIC);
    expect(actorName('tr-01 supplier', 'ar', names)).toContain(g.directory.traders['tr-01'].nameAr);
    expect(actorName('unknown-thing', 'ar', names)).toBe('unknown-thing');
    expect(inlineActors('owner adc:duty, by cell-B1', 'ar', names)).not.toMatch(/adc:duty|cell-B1/);
  });

  it('simulated actors and issuers all resolve', () => {
    const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
    const ids = new Set<string>();
    for (const e of sim.events) {
      if ('officerId' in e) ids.add(e.officerId);
      if (e.type === 'InspectionCompleted') ids.add(e.result.performedBy);
      if (e.type === 'ReceiptIssued') ids.add(e.receipt.issuer);
      if (e.type === 'InspectionRequested') ids.add(e.task.requestedBy);
    }
    expect(ids.size).toBeGreaterThan(5);
    for (const id of ids) expect(actorName(id, 'ar', names), id).toMatch(ARABIC);
    for (const e of sim.events) {
      if (e.type === 'InspectionCompleted') {
        for (const f of e.result.findings) expect(f.noteAr).toMatch(ARABIC);
      }
      if (e.type === 'InspectionRequested') expect(e.task.scopeAr).toHaveLength(e.task.scope.length);
    }
  });
});

describe('determinism', () => {
  // Baseline hashes were taken from the generator before the Arabic fields existed.
  const NEW_FIELDS = new Set(['descriptionAr', 'carrierAr', 'conveyanceAr']);
  it('generate() for the default seed is unchanged apart from the new Arabic fields', () => {
    const { directory, ...rest } = generate();
    const forwarders = Object.values(directory.forwarders).map(({ id, name }) => ({ id, name }));
    const json = JSON.stringify([rest, forwarders], (k, v) => (NEW_FIELDS.has(k) ? undefined : v));
    expect(sha256Hex(json)).toBe('7c9a27671cae94d887f1992b9ed8001bf7281212cf4bc1c49e7ea9006bd22f3f');
  });
  it('simulation results for the default seed are unchanged', () => {
    const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
    expect(sha256Hex(JSON.stringify(sim.results))).toBe('500aad9e9dad83115215ef5d398f85a36dd3634a2dc355f8c3297692f63d966c');
  });
});
