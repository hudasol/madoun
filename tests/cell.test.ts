import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CELL_BASE, CELL_SCENARIOS, CELL_SEEDS, cellArrivals, meanInterval, simulateCell, type CellParams } from '@/engine';
import { buildCellReport } from '../scripts/cell';

const scenario = (id: string) => CELL_SCENARIOS.find((s) => s.id === id)!;

describe('inspection cell digital twin', () => {
  it('queue conservation: every task ends exactly once, in every scenario and every preregistered seed', () => {
    for (const s of CELL_SCENARIOS) {
      for (const seed of CELL_SEEDS) {
        const r = simulateCell(s, seed);
        expect(r.conserved, `${s.id} seed ${seed}`).toBe(true);
        expect(r.completed).toBe(r.tasks);
        expect(r.tasks).toBe(cellArrivals(seed, CELL_BASE).length);
      }
    }
  });

  it('conservation also holds under heavy faults, no robots on shift help and a long horizon', () => {
    const harsh: CellParams = { ...CELL_BASE, mode: 'robots', horizonHours: 336, robot: { ...CELL_BASE.robot, faultProb: 0.5, recoveryHours: 6 } };
    const r = simulateCell({ id: 'S4', params: harsh }, 3);
    expect(r.conserved).toBe(true);
    expect(r.robotFaults).toBeGreaterThan(50);
    expect(r.confirmedBeforeCompletion).toBe(1);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(simulateCell(scenario('S3'), 5)).toEqual(simulateCell(scenario('S3'), 5));
    expect(simulateCell(scenario('S3'), 5)).not.toEqual(simulateCell(scenario('S3'), 6));
  });

  it('every scenario of a seed sees the same arrivals and violations (common random numbers)', () => {
    const runs = CELL_SCENARIOS.map((s) => simulateCell(s, 9));
    expect(new Set(runs.map((r) => r.tasks)).size).toBe(1);
    expect(new Set(runs.map((r) => r.violations)).size).toBe(1);
  });

  it('only machine scenarios produce findings that need confirmation, and all of them are confirmed', () => {
    for (const seed of [1, 2, 3]) {
      expect(simulateCell(scenario('S1'), seed).seriousMachineFindings).toBe(0);
      expect(simulateCell(scenario('S2'), seed).seriousMachineFindings).toBe(0);
      const r = simulateCell(scenario('S3'), seed);
      expect(r.seriousMachineFindings).toBeGreaterThan(0);
      expect(r.confirmedBeforeCompletion).toBe(1);
      expect(Number.isFinite(r.p90ConfirmDelay)).toBe(true);
    }
  });

  it('with officers only, all hands on time is officer time', () => {
    const r = simulateCell(scenario('S1'), 4);
    expect(r.officerHoursPerContainer).toBeGreaterThan(1);
    expect(r.robotFaults).toBe(0);
  });

  it('computes a t interval that contains the mean and narrows with more seeds', () => {
    const a = meanInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(a.lo).toBeLessThan(a.mean);
    expect(a.hi).toBeGreaterThan(a.mean);
    expect(a.mean).toBe(5.5);
    const b = meanInterval([...Array(5)].flatMap(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
    expect(meanInterval([NaN, 2, 4]).n).toBe(2);
  });

  it('the engine model stays pure: no I/O, clock or network', () => {
    const src = fs.readFileSync('src/engine/cell.ts', 'utf8');
    for (const banned of ['node:', 'Date.now', 'new Date(', 'Math.random', 'fetch(', 'process.']) expect(src.includes(banned), banned).toBe(false);
    for (const m of src.matchAll(/from '([^']+)'/g)) expect(m[1].startsWith('./'), m[1]).toBe(true);
  });

  it('docs/cell-results.json and docs/cell-experiment.md are exactly what npm run cell produces', () => {
    const fresh = buildCellReport();
    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    expect(norm(fs.readFileSync('docs/cell-results.json', 'utf8'))).toBe(fresh.json);
    expect(norm(fs.readFileSync('docs/cell-experiment.md', 'utf8'))).toBe(fresh.markdown);
  });
});
