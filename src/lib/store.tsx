'use client';

import {
  createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { generate, type Generated } from '@/data/generate';
import { actorId, can as canDo, canSeeReceipt, parseViewAs, DEFAULT_VIEW_AS, type Action, type ViewAs } from '@/lib/roles';
import {
  addHours, computeKpis, computeLearning, createInspectionTask, detectExceptions, hoursBetween, makeRng, ms,
  outcomeFromInspection, planShipment, replay, resultToReceiptDraft, simulate, simulateInspectionCell,
  type Directory, type ExceptionItem, type Kpis, type Lane, type LearningReport, type MadounEvent, type Outcome,
  type ShipmentFile, type ShipmentPlan, type SimOutput, type Suggestion, type World,
  apply, validateEvent,
} from '@/engine';

export interface InFlight {
  file: ShipmentFile;
  plan: ShipmentPlan;
  /** When release is predicted if nothing goes wrong. */
  predictedReleaseAt: string;
  /** Hours of margin before arrival (negative = predicted to clear after arrival). */
  slackHours: number;
  lane: Lane;
}

export interface SuggestionPreview {
  interventionsBefore: number;
  interventionsAfter: number;
  confirmedBefore: number;
  confirmedAfter: number;
  /** Confirmed findings that would have gone through un-inspected. */
  missedConfirmed: number;
}

interface Data {
  g: Generated;
  sim: SimOutput;
  startAt: string;
  endAt: string;
}

export interface Store {
  ready: boolean;
  g?: Generated;
  directory?: Directory;
  sim?: SimOutput;
  startAt: string;
  endAt: string;
  /** Snapshot time being viewed. */
  at: string;
  setAt: (iso: string) => void;
  world?: World;
  kpis?: Kpis;
  exceptions: ExceptionItem[];
  learning?: LearningReport;
  inFlight: InFlight[];
  /** Effective lane: officer override wins over the recommendation. */
  laneOf: (file: ShipmentFile) => Lane;
  plan: (shipmentId: string) => ShipmentPlan | undefined;
  overrideLane: (shipmentId: string, lane: Lane, reason: string) => void;
  resolveException: (id: string, note: string) => void;
  approveSuggestion: (s: Suggestion) => void;
  previewSuggestion: (s: Suggestion) => SuggestionPreview | undefined;
  runInspection: (shipmentId: string) => void;
  resetDemo: () => void;
  overlayCount: number;
  viewAs: ViewAs;
  setViewAs: (v: ViewAs) => void;
  can: (action: Action, authorityId?: string) => boolean;
  canSee: (r: Parameters<typeof canSeeReceipt>[1]) => boolean;
}

const Ctx = createContext<Store | null>(null);

function buildData(): Data {
  const g = generate();
  const sim = simulate({ seed: g.seed, directory: g.directory, shipments: g.shipments, truth: g.truth });
  const startAt = g.shipments[0]?.filedAt ?? g.now;
  return { g, sim, startAt, endAt: g.now };
}

export function MadounProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [at, setAt] = useState('');
  const [overlay, setOverlay] = useState<MadounEvent[]>([]);
  const [previewCache] = useState(() => new Map<string, SuggestionPreview>());
  const [viewAs, setViewAsState] = useState<ViewAs>(DEFAULT_VIEW_AS);
  useEffect(() => {
    try { setViewAsState(parseViewAs(localStorage.getItem('madoun.viewAs'))); } catch { /* ignore */ }
  }, []);
  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    try { localStorage.setItem('madoun.viewAs', v); } catch { /* ignore */ }
  }, []);
  const actor = actorId(viewAs);

  useEffect(() => {
    // Let the first paint happen, then build the synthetic world in the browser.
    const t = setTimeout(() => {
      const d = buildData();
      setData(d);
      setAt(d.endAt);
    }, 30);
    return () => clearTimeout(t);
  }, []);

  const deferredAt = useDeferredValue(at);

  const world = useMemo(() => {
    if (!data || !deferredAt) return undefined;
    const cut = ms(deferredAt);
    const evs = [...data.sim.events, ...overlay].filter((e) => ms(e.at) <= cut).sort((a, b) => ms(a.at) - ms(b.at));
    return replay(evs);
  }, [data, deferredAt, overlay]);

  const laneOf = useCallback((file: ShipmentFile): Lane => file.override?.lane ?? file.assessment?.lane ?? 'green', []);

  const plan = useCallback(
    (shipmentId: string) => {
      if (!data || !world || !deferredAt) return undefined;
      const f = world.shipments[shipmentId];
      if (!f) return undefined;
      return planShipment(world, data.g.directory, f.shipment, deferredAt);
    },
    [data, world, deferredAt],
  );

  const exceptions = useMemo(
    () => (data && world && deferredAt ? detectExceptions(world, data.g.directory, deferredAt) : []),
    [data, world, deferredAt],
  );

  const learning = useMemo(() => {
    if (!world) return undefined;
    const outcomes = Object.values(world.shipments).map((f) => f.outcome).filter((o): o is Outcome => !!o);
    return computeLearning(outcomes, world.weightOverrides);
  }, [world]);

  const inFlight = useMemo<InFlight[]>(() => {
    if (!data || !world || !deferredAt) return [];
    return Object.values(world.shipments)
      .filter((f) => !f.cleared)
      .map((file) => {
        const p = planShipment(world, data.g.directory, file.shipment, deferredAt);
        const predictedReleaseAt = addHours(deferredAt, p.reviewPlan.parallelHours);
        return { file, plan: p, predictedReleaseAt, slackHours: hoursBetween(predictedReleaseAt, file.shipment.eta), lane: file.override?.lane ?? p.assessment.lane };
      })
      .sort((a, b) => ms(a.file.shipment.eta) - ms(b.file.shipment.eta));
  }, [data, world, deferredAt]);

  const kpis = useMemo(() => {
    if (!data || !deferredAt) return undefined;
    const cut = ms(deferredAt);
    return computeKpis(data.sim.results.filter((r) => ms(r.clearedAt) <= cut));
  }, [data, deferredAt]);

  // Events are checked against the current world first: replay silently ignores a bad reference,
  // so an invalid UI action would otherwise be logged and then do nothing.
  const push = useCallback(
    (evs: MadounEvent[]) => {
      // A batch is checked in order against the world each earlier event produces (a request and its result travel together).
      let w = world;
      const ok: MadounEvent[] = [];
      for (const e of evs) {
        if (w && validateEvent(w, e).length > 0) continue;
        ok.push(e);
        if (w) w = apply(w, e);
      }
      if (ok.length) setOverlay((o) => [...o, ...ok]);
    },
    [world],
  );

  const overrideLane = useCallback(
    (shipmentId: string, lane: Lane, reason: string) => push([{ type: 'OfficerOverride', at, shipmentId, lane, officerId: actor, reason }]),
    [at, push, actor],
  );

  const resolveException = useCallback(
    (id: string, note: string) => {
      // Make sure the exception exists in the file history before resolving it.
      const ex = exceptions.find((e) => e.id === id);
      if (!ex) return;
      push([
        { type: 'ExceptionOpened', at, exception: { ...ex, state: 'open' } },
        { type: 'ExceptionResolved', at, exceptionId: id, officerId: actor, note },
      ]);
    },
    [at, exceptions, push, actor],
  );

  const approveSuggestion = useCallback(
    (s: Suggestion) => {
      if (s.kind === 'pre-check-forwarder' || !s.multiplier) return;
      push([{ type: 'RuleSuggestionApproved', at, key: s.key, multiplier: s.multiplier, officerId: actor }]);
    },
    [at, push, actor],
  );

  const previewSuggestion = useCallback(
    (s: Suggestion): SuggestionPreview | undefined => {
      if (!data || !s.multiplier) return undefined;
      const k = `${s.id}`;
      const cached = previewCache.get(k);
      if (cached) return cached;
      const alt = simulate({ seed: data.g.seed, directory: data.g.directory, shipments: data.g.shipments, truth: data.g.truth, weightOverrides: { [s.key]: s.multiplier } });
      const count = (events: MadounEvent[]) => {
        let inter = 0, conf = 0;
        for (const e of events) if (e.type === 'OutcomeRecorded' && e.outcome.result !== 'not-inspected') { inter++; if (e.outcome.result === 'confirmed') conf++; }
        return { inter, conf };
      };
      const before = count(data.sim.events);
      const after = count(alt.events);
      const res = { interventionsBefore: before.inter, interventionsAfter: after.inter, confirmedBefore: before.conf, confirmedAfter: after.conf, missedConfirmed: Math.max(0, before.conf - after.conf) };
      previewCache.set(k, res);
      return res;
    },
    [data, previewCache],
  );

  const runInspection = useCallback(
    (shipmentId: string) => {
      if (!data || !world) return;
      const p = plan(shipmentId);
      const f = world.shipments[shipmentId];
      if (!p || !f) return;
      const rng = makeRng(data.g.seed + shipmentId.length * 131 + overlay.length);
      const task = createInspectionTask(f.shipment, p.assessment, at, actor);
      const base = simulateInspectionCell(task, data.g.truth[shipmentId] ?? {}, rng, at);
      const result = { ...base, completedAt: at }; // completes at the viewed moment so it shows immediately
      push([
        { type: 'InspectionRequested', at, task },
        { type: 'InspectionCompleted', at, result },
        { type: 'ReceiptIssued', at, receipt: resultToReceiptDraft(result) },
        { type: 'OutcomeRecorded', at, outcome: outcomeFromInspection(f.shipment, p.assessment, result, [], at) },
      ]);
    },
    [data, world, plan, overlay.length, at, push, actor],
  );

  const resetDemo = useCallback(() => {
    setOverlay([]);
    previewCache.clear();
    if (data) setAt(data.endAt);
  }, [data, previewCache]);

  const value: Store = {
    ready: !!data && !!world,
    g: data?.g,
    directory: data?.g.directory,
    sim: data?.sim,
    startAt: data?.startAt ?? '',
    endAt: data?.endAt ?? '',
    at,
    setAt,
    world,
    kpis,
    exceptions,
    learning,
    inFlight,
    laneOf,
    plan,
    overrideLane,
    resolveException,
    approveSuggestion,
    previewSuggestion,
    runInspection,
    resetDemo,
    overlayCount: overlay.length,
    viewAs,
    setViewAs,
    can: (action, authorityId) => canDo(viewAs, action, authorityId),
    canSee: (r) => canSeeReceipt(viewAs, r),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside MadounProvider');
  return s;
}
