import { requiresOfficerConfirmation } from './inspection';
import { makeRng, type Rng } from './rng';
import { mean, quantileOf } from './stats';

/**
 * Inspection cell digital twin: a seeded discrete event simulation of red lane containers waiting for
 * inspection by officers, a scanner with officer review, or a two robot cell whose serious findings an
 * officer must confirm. Time is in hours from the start of the run; no clock is read.
 *
 * Every number in CELL_BASE is an assumption written down in docs/preregistration-cell.md before the
 * model existed. None is a measurement of a real robot, scanner, officer team or port.
 */

export type CellMode = 'officers' | 'scanner' | 'robots';
export type CellScenarioId = 'S1' | 'S2' | 'S3' | 'S4';

export interface CellParams {
  mode: CellMode;
  horizonHours: number;
  arrivalsPerHour: number;
  violationRate: number;
  officersDay: number;
  officersNight: number;
  dayStartHour: number;
  dayEndHour: number;
  officer: { fixedHours: number; expMeanHours: number; sensitivity: number; falsePositive: number };
  scanner: { scanHours: number; reviewHours: number; sensitivity: number; falsePositive: number };
  robot: {
    count: number; fixedHours: number; expMeanHours: number; sensitivity: number; falsePositive: number;
    batteryHours: number; chargeHours: number; faultProb: number; recoveryHours: number;
  };
  confirmHours: number;
}

export const CELL_BASE: Omit<CellParams, 'mode'> = {
  horizonHours: 168,
  arrivalsPerHour: 1.5,
  violationRate: 0.08,
  officersDay: 4,
  officersNight: 3,
  dayStartHour: 6,
  dayEndHour: 18,
  officer: { fixedHours: 0.75, expMeanHours: 0.75, sensitivity: 0.95, falsePositive: 0.01 },
  scanner: { scanHours: 0.1, reviewHours: 0.2, sensitivity: 0.85, falsePositive: 0.1 },
  robot: {
    count: 2, fixedHours: 0.5, expMeanHours: 0.25, sensitivity: 0.9, falsePositive: 0.05,
    batteryHours: 6, chargeHours: 1.5, faultProb: 0.02, recoveryHours: 2,
  },
  confirmHours: 0.5,
};

export const CELL_SCENARIOS: { id: CellScenarioId; name: string; nameAr: string; params: CellParams }[] = [
  { id: 'S1', name: 'Officers only', nameAr: 'الضباط فقط', params: { ...CELL_BASE, mode: 'officers' } },
  { id: 'S2', name: 'Scanner plus officers', nameAr: 'ماسح مع الضباط', params: { ...CELL_BASE, mode: 'scanner' } },
  { id: 'S3', name: 'Robot cell plus officer confirmation', nameAr: 'خلية روبوتية مع تأكيد الضابط', params: { ...CELL_BASE, mode: 'robots' } },
  {
    id: 'S4', name: 'Robot cell with failures', nameAr: 'خلية روبوتية مع أعطال',
    params: { ...CELL_BASE, mode: 'robots', robot: { ...CELL_BASE.robot, faultProb: 0.15, recoveryHours: 4 } },
  },
];

interface Task {
  id: number;
  arrival: number;
  violation: boolean;
  handsOn: number;
  officerHours: number;
  attempts: number;
  flagged: boolean;
  seriousMachine: boolean;
  resultAt?: number;
  confirmedAt?: number;
  done?: number;
  established: boolean;
  completions: number;
}

type OfficerJob = { kind: 'confirm' | 'review'; task: Task };
type Ev =
  | { t: number; seq: number; kind: 'arrival'; task: Task }
  | { t: number; seq: number; kind: 'shift' }
  | { t: number; seq: number; kind: 'officer-end'; officer: number; job: 'inspect' | 'confirm' | 'review'; task: Task; detected: boolean }
  | { t: number; seq: number; kind: 'scan-end'; task: Task }
  | { t: number; seq: number; kind: 'robot-end'; robot: number; task: Task; dur: number }
  | { t: number; seq: number; kind: 'robot-fault'; robot: number; task: Task; dur: number }
  | { t: number; seq: number; kind: 'robot-up'; robot: number };
type EvInput = Ev extends infer E ? (E extends Ev ? Omit<E, 'seq'> : never) : never;

/** Binary min heap on (time, insertion order), so ties resolve the same way on every run. */
class Agenda {
  private h: Ev[] = [];
  private n = 0;
  get size() { return this.h.length; }
  push(e: EvInput) {
    const ev = { ...e, seq: this.n++ } as Ev;
    const h = this.h;
    h.push(ev);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }
  pop(): Ev | undefined {
    const h = this.h;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
  private less(a: Ev, b: Ev) { return a.t < b.t || (a.t === b.t && a.seq < b.seq); }
}

const expDraw = (rng: Rng, meanHours: number) => -Math.log(1 - rng.next()) * meanHours;

/** Arrival times and violations for a seed. Shared by every scenario (common random numbers). */
export function cellArrivals(seed: number, p: Pick<CellParams, 'horizonHours' | 'arrivalsPerHour' | 'violationRate'>): { arrival: number; violation: boolean }[] {
  const rng = makeRng((seed * 7919 + 1) >>> 0);
  const out: { arrival: number; violation: boolean }[] = [];
  let t = 0;
  for (;;) {
    t += expDraw(rng, 1 / p.arrivalsPerHour);
    if (t > p.horizonHours) break;
    out.push({ arrival: t, violation: rng.chance(p.violationRate) });
  }
  return out;
}

export interface CellRun {
  scenario: CellScenarioId;
  seed: number;
  tasks: number;
  completed: number;
  /** True when every task completed exactly once. */
  conserved: boolean;
  violations: number;
  /** Hours from the start of the run (t = 0) until the last task completed. */
  drainedAt: number;
  medianLead: number;
  p90Lead: number;
  medianHandsOn: number;
  officerHoursPerContainer: number;
  missedViolationShare: number;
  seriousMachineFindings: number;
  /** 90th percentile of machine result to end of confirmation; NaN when there were none. */
  p90ConfirmDelay: number;
  /** Share of serious machine findings confirmed before their task completed (1 when there were none). */
  confirmedBeforeCompletion: number;
  robotFaults: number;
}

/** Runs one scenario for one seed. Pure and deterministic. */
export function simulateCell(scenario: { id: CellScenarioId; params: CellParams }, seed: number): CellRun {
  const p = scenario.params;
  // Separate streams for service times, detection and faults, as preregistered (amendment A1).
  const rng = makeRng((seed * 7919 + 2) >>> 0);
  const detectRng = makeRng((seed * 7919 + 3) >>> 0);
  const faultRng = makeRng((seed * 7919 + 4) >>> 0);
  const tasks: Task[] = cellArrivals(seed, p).map((a, id) => ({
    id, arrival: a.arrival, violation: a.violation, handsOn: 0, officerHours: 0, attempts: 0, flagged: false,
    seriousMachine: false, established: false, completions: 0,
  }));
  const agenda = new Agenda();
  const inspectQ: Task[] = [];
  const scanQ: Task[] = [];
  const officerQ: OfficerJob[] = [];
  const officers = [
    ...Array.from({ length: p.officersDay }, () => ({ day: true, busy: false })),
    ...Array.from({ length: p.officersNight }, () => ({ day: false, busy: false })),
  ];
  const robots = Array.from({ length: p.mode === 'robots' ? p.robot.count : 0 }, () => ({ state: 'idle' as 'idle' | 'busy' | 'charging' | 'down', work: 0 }));
  let scannerBusy = false;
  let completed = 0;
  let robotFaults = 0;

  const isDay = (t: number) => {
    const h = ((t % 24) + 24) % 24;
    return h >= p.dayStartHour && h < p.dayEndHour;
  };
  const onShift = (o: { day: boolean }, t: number) => o.day === isDay(t);
  const robotOperational = () => robots.some((r) => r.state === 'idle' || r.state === 'busy');
  const complete = (task: Task, t: number, established: boolean) => {
    task.completions++;
    if (task.completions === 1) completed++;
    task.done = t;
    task.established = established;
  };

  const dispatch = (t: number) => {
    if (p.mode === 'scanner' && !scannerBusy && scanQ.length) {
      const task = scanQ.shift()!;
      scannerBusy = true;
      task.handsOn += p.scanner.scanHours;
      agenda.push({ t: t + p.scanner.scanHours, kind: 'scan-end', task });
    }
    robots.forEach((r, i) => {
      if (r.state !== 'idle' || !inspectQ.length) return;
      const task = inspectQ.shift()!;
      task.attempts++;
      r.state = 'busy';
      const dur = p.robot.fixedHours + expDraw(rng, p.robot.expMeanHours);
      if (faultRng.chance(p.robot.faultProb)) {
        const spent = faultRng.next() * dur; // the fault strikes at a uniformly random point of the job
        agenda.push({ t: t + spent, kind: 'robot-fault', robot: i, task, dur: spent });
      }
      else agenda.push({ t: t + dur, kind: 'robot-end', robot: i, task, dur });
    });
    officers.forEach((o, i) => {
      if (o.busy || !onShift(o, t)) return;
      const job = officerQ.shift();
      if (job) {
        const dur = job.kind === 'confirm' ? p.confirmHours : p.scanner.reviewHours;
        o.busy = true;
        job.task.handsOn += dur;
        job.task.officerHours += dur;
        agenda.push({ t: t + dur, kind: 'officer-end', officer: i, job: job.kind, task: job.task, detected: false });
        return;
      }
      if (!inspectQ.length || (p.mode === 'robots' && robotOperational())) return;
      const task = inspectQ.shift()!;
      task.attempts++;
      o.busy = true;
      const dur = p.officer.fixedHours + expDraw(rng, p.officer.expMeanHours);
      const detected = task.violation ? detectRng.chance(p.officer.sensitivity) : detectRng.chance(p.officer.falsePositive);
      task.handsOn += dur;
      task.officerHours += dur;
      agenda.push({ t: t + dur, kind: 'officer-end', officer: i, job: 'inspect', task, detected });
    });
  };

  for (const task of tasks) agenda.push({ t: task.arrival, kind: 'arrival', task });
  const nextBoundary = (t: number) => {
    const day = Math.floor(t / 24) * 24;
    for (const b of [day + p.dayStartHour, day + p.dayEndHour, day + 24 + p.dayStartHour]) if (b > t) return b;
    return day + 24 + p.dayStartHour;
  };
  agenda.push({ t: nextBoundary(0), kind: 'shift' });

  const cap = p.horizonHours * 20;
  let now = 0;
  while (completed < tasks.length) {
    const ev = agenda.pop();
    if (!ev) throw new Error('Cell simulation stalled with tasks outstanding.');
    now = ev.t;
    if (now > cap) throw new Error(`Cell simulation did not drain within ${cap} hours.`);
    switch (ev.kind) {
      case 'arrival':
        (p.mode === 'scanner' ? scanQ : inspectQ).push(ev.task);
        break;
      case 'shift':
        agenda.push({ t: nextBoundary(now), kind: 'shift' });
        break;
      case 'scan-end':
        scannerBusy = false;
        ev.task.flagged = ev.task.violation ? detectRng.chance(p.scanner.sensitivity) : detectRng.chance(p.scanner.falsePositive);
        officerQ.push({ kind: 'review', task: ev.task });
        break;
      case 'officer-end':
        officers[ev.officer].busy = false;
        if (ev.job === 'inspect') complete(ev.task, now, ev.task.violation && ev.detected);
        else if (ev.job === 'review') {
          if (ev.task.flagged) inspectQ.push(ev.task);
          else complete(ev.task, now, false);
        } else {
          ev.task.confirmedAt = now;
          complete(ev.task, now, ev.task.violation); // the officer establishes the truth on site (assumption)
        }
        break;
      case 'robot-end': {
        const r = robots[ev.robot];
        r.work += ev.dur;
        ev.task.handsOn += ev.dur;
        const major = ev.task.violation ? detectRng.chance(p.robot.sensitivity) : detectRng.chance(p.robot.falsePositive);
        const result = { performerKind: 'robot' as const, seal: { id: '', intact: true }, findings: major ? [{ kind: 'undeclared-goods' as const, severity: 'major' as const, note: '' }] : [{ kind: 'none' as const, severity: 'info' as const, note: '' }] };
        if (requiresOfficerConfirmation(result)) {
          ev.task.seriousMachine = true;
          ev.task.resultAt = now;
          officerQ.push({ kind: 'confirm', task: ev.task });
        } else complete(ev.task, now, false);
        if (r.work >= p.robot.batteryHours) {
          r.state = 'charging';
          r.work = 0;
          agenda.push({ t: now + p.robot.chargeHours, kind: 'robot-up', robot: ev.robot });
        } else r.state = 'idle';
        break;
      }
      case 'robot-fault': {
        const r = robots[ev.robot];
        r.work += ev.dur;
        ev.task.handsOn += ev.dur; // the cut short attempt still counts as hands on time
        robotFaults++;
        r.state = 'down';
        agenda.push({ t: now + p.robot.recoveryHours, kind: 'robot-up', robot: ev.robot });
        inspectQ.unshift(ev.task); // back to the front of the queue
        break;
      }
      case 'robot-up':
        robots[ev.robot].state = 'idle';
        break;
    }
    dispatch(now);
  }

  const leads = tasks.map((t) => t.done! - t.arrival);
  const violations = tasks.filter((t) => t.violation);
  const serious = tasks.filter((t) => t.seriousMachine);
  const delays = serious.filter((t) => t.confirmedAt !== undefined).map((t) => t.confirmedAt! - t.resultAt!);
  return {
    scenario: scenario.id,
    seed,
    tasks: tasks.length,
    completed,
    conserved: tasks.every((t) => t.completions === 1) && completed === tasks.length,
    violations: violations.length,
    drainedAt: now,
    medianLead: quantileOf(leads, 0.5),
    p90Lead: quantileOf(leads, 0.9),
    medianHandsOn: quantileOf(tasks.map((t) => t.handsOn), 0.5),
    officerHoursPerContainer: tasks.reduce((a, t) => a + t.officerHours, 0) / tasks.length,
    missedViolationShare: violations.length ? violations.filter((t) => !t.established).length / violations.length : 0,
    seriousMachineFindings: serious.length,
    p90ConfirmDelay: delays.length ? quantileOf(delays, 0.9) : NaN,
    confirmedBeforeCompletion: serious.length ? serious.filter((t) => t.confirmedAt !== undefined && t.confirmedAt <= t.done!).length / serious.length : 1,
    robotFaults,
  };
}

/* ------------------------------------------------------------------ */
/* Experiment summary                                                  */
/* ------------------------------------------------------------------ */

export interface Interval { mean: number; lo: number; hi: number; sd: number; n: number }

const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
/** Two sided 95 percent t quantile for df degrees of freedom: exact table to 30, then 1.96 + 2.4/df (within 0.005 of the true value). */
export const t975 = (df: number) => (df <= 30 ? T975[df] : 1.96 + 2.4 / df);

/** Mean over seeds with a 95 percent t interval. NaN values (a metric that does not apply) are dropped. */
export function meanInterval(values: number[]): Interval {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  const m = mean(v);
  if (n < 2) return { mean: m, lo: m, hi: m, sd: 0, n };
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  const half = t975(n - 1) * (sd / Math.sqrt(n));
  return { mean: m, lo: m - half, hi: m + half, sd, n };
}

export const CELL_METRICS = [
  'medianLead', 'p90Lead', 'medianHandsOn', 'officerHoursPerContainer', 'missedViolationShare', 'p90ConfirmDelay', 'confirmedBeforeCompletion',
] as const;
export type CellMetric = (typeof CELL_METRICS)[number];

export interface CellExperiment {
  seeds: number[];
  runs: CellRun[];
  summary: Record<CellScenarioId, Record<CellMetric, Interval>>;
  /** Paired differences per seed, a minus b. */
  diff: (metric: CellMetric, a: CellScenarioId, b: CellScenarioId) => Interval;
}

export function runCellExperiment(seeds: number[]): CellExperiment {
  const runs = CELL_SCENARIOS.flatMap((s) => seeds.map((seed) => simulateCell(s, seed)));
  const by = (id: CellScenarioId) => runs.filter((r) => r.scenario === id);
  const summary = Object.fromEntries(
    CELL_SCENARIOS.map((s) => [s.id, Object.fromEntries(CELL_METRICS.map((m) => [m, meanInterval(by(s.id).map((r) => r[m]))]))]),
  ) as CellExperiment['summary'];
  const diff = (metric: CellMetric, a: CellScenarioId, b: CellScenarioId) => {
    const ra = by(a), rb = by(b);
    return meanInterval(ra.map((r, i) => r[metric] - rb[i][metric]));
  };
  return { seeds, runs, summary, diff };
}

/**
 * 'prediction' can fail; 'invariant' is a structural check that cannot fail by construction (a task with a
 * serious machine finding only completes at confirmation) and is reported separately (amendment A2).
 */
export interface PredictionCheck { id: string; kind: 'prediction' | 'invariant'; prediction: string; condition: string; observed: string; hit: boolean }

const h = (x: number) => `${x.toFixed(2)} h`;
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const iv = (i: Interval, f: (x: number) => string) => `${f(i.mean)} [${f(i.lo)}, ${f(i.hi)}]`;

/** The predictions of docs/preregistration-cell.md, checked exactly as written there. */
export function checkCellPredictions(x: CellExperiment): PredictionCheck[] {
  const S = x.summary;
  const d1 = x.diff('medianLead', 'S3', 'S1');
  const d3 = x.diff('medianHandsOn', 'S3', 'S1');
  const d4 = x.diff('p90Lead', 'S3', 'S1');
  const d5 = x.diff('medianLead', 'S4', 'S1');
  const d7 = x.diff('missedViolationShare', 'S3', 'S1');
  const d8 = x.diff('medianLead', 'S2', 'S3');
  const allConfirmed = x.runs.filter((r) => r.scenario === 'S3' || r.scenario === 'S4').every((r) => r.confirmedBeforeCompletion === 1);
  const minConfirmed = Math.min(...x.runs.filter((r) => r.scenario === 'S3' || r.scenario === 'S4').map((r) => r.confirmedBeforeCompletion));
  const missed = (id: CellScenarioId) => S[id].missedViolationShare.mean;
  const checks: Omit<PredictionCheck, 'kind'>[] = [
    { id: 'P1', prediction: 'A robot cell with officer confirmation shortens median lead time.', condition: 'Upper bound of M1(S3) minus M1(S1) below 0', observed: iv(d1, h), hit: d1.hi < 0 },
    { id: 'P2a', prediction: 'Officers only, median lead time.', condition: 'Mean M1(S1) between 1.3 h and 2.5 h', observed: iv(S.S1.medianLead, h), hit: S.S1.medianLead.mean >= 1.3 && S.S1.medianLead.mean <= 2.5 },
    { id: 'P2b', prediction: 'Robot cell, median lead time.', condition: 'Mean M1(S3) between 0.6 h and 1.4 h', observed: iv(S.S3.medianLead, h), hit: S.S3.medianLead.mean >= 0.6 && S.S3.medianLead.mean <= 1.4 },
    { id: 'P3a', prediction: 'Officers only, median hands on time per container.', condition: 'Mean M3(S1) between 1.17 h and 1.37 h', observed: iv(S.S1.medianHandsOn, h), hit: S.S1.medianHandsOn.mean >= 1.17 && S.S1.medianHandsOn.mean <= 1.37 },
    { id: 'P3b', prediction: 'Robot cell, median hands on time per container.', condition: 'Mean M3(S3) between 0.57 h and 0.77 h', observed: iv(S.S3.medianHandsOn, h), hit: S.S3.medianHandsOn.mean >= 0.57 && S.S3.medianHandsOn.mean <= 0.77 },
    { id: 'P3c', prediction: 'The robot cell lowers median inspection time per container.', condition: 'Upper bound of M3(S3) minus M3(S1) below 0', observed: iv(d3, h), hit: d3.hi < 0 },
    { id: 'P4', prediction: 'The robot cell does not lengthen the tail by more than 15 minutes.', condition: 'Upper bound of M2(S3) minus M2(S1) below 0.25 h', observed: iv(d4, h), hit: d4.hi < 0.25 },
    { id: 'P5', prediction: 'Frequent robot failures make the cell slower than officers alone.', condition: 'Lower bound of M1(S4) minus M1(S1) above 0', observed: iv(d5, h), hit: d5.lo > 0 },
    { id: 'P6', prediction: 'Every serious machine finding is confirmed by an officer before its task completes.', condition: 'M7 equals 100% in every seed of S3 and S4', observed: `lowest seed ${pc(minConfirmed)}`, hit: allConfirmed },
    { id: 'P7', prediction: 'The robot cell misses more violations than officers alone.', condition: 'Mean of M5(S3) minus M5(S1) above 0', observed: iv(d7, pc), hit: d7.mean > 0 },
    { id: 'P8a', prediction: 'The scanner path is the fastest.', condition: 'Upper bound of M1(S2) minus M1(S3) below 0', observed: iv(d8, h), hit: d8.hi < 0 },
    { id: 'P8b', prediction: 'The scanner path misses the most violations.', condition: 'Mean M5(S2) above the mean M5 of each other scenario', observed: `S2 ${pc(missed('S2'))}; S1 ${pc(missed('S1'))}, S3 ${pc(missed('S3'))}, S4 ${pc(missed('S4'))}`, hit: missed('S2') > missed('S1') && missed('S2') > missed('S3') && missed('S2') > missed('S4') },
    { id: 'P9', prediction: 'The one hour confirmation delay assumed in the release simulator is not optimistic.', condition: 'Mean M6(S3) at most 1.0 h', observed: iv(S.S3.p90ConfirmDelay, h), hit: S.S3.p90ConfirmDelay.mean <= 1.0 },
    { id: 'P10', prediction: 'The robot cell frees officer time.', condition: 'Upper bound of M4(S3) below 0.25 h per container', observed: iv(S.S3.officerHoursPerContainer, h), hit: S.S3.officerHoursPerContainer.hi < 0.25 },
  ];
  return checks.map((c) => ({ ...c, kind: c.id === 'P6' ? 'invariant' : 'prediction' }));
}

export const CELL_SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
