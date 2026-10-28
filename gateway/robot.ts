/**
 * Reference inspection gateway. It plays the part of a robotic inspection cell talking to Madoun:
 * it polls open inspection tasks, simulates the cell with seeded randomness, and posts a result with
 * SHA-256 digests of the media it "captured" (generated placeholder bytes, not images).
 *
 * No real robot is connected. Detection and seal rates are parameters chosen for the demo, not claims
 * about any device. Dependency free: Node built-ins only, and nothing from the app's source tree, so it
 * shows exactly what an external adapter needs to know (the HTTP contract in public/openapi.yaml).
 *
 *   npx tsx gateway/robot.ts --base http://localhost:3200 --seed 7 --max 3
 *   options: --base URL  --seed N  --max N (tasks per poll)  --polls N  --interval MS  --cell ID
 */
import { createHash } from 'node:crypto';

export interface Task {
  id: string;
  shipmentId: string;
  containerIds: string[];
  requestedAt: string;
  scope: string[];
  priority: 'normal' | 'high';
  constraints: string[];
}

export interface ResultBody {
  performedBy: string;
  performerKind: 'robot';
  completedAt: string;
  seal: { id: string; intact: boolean };
  findings: { kind: string; severity: 'info' | 'minor' | 'major'; note: string }[];
  media: { ref: string; sha256: string; bytes: number }[];
}

export interface CellParams {
  /** Chance that the cell reports a major finding (stands in for a real violation being present and seen). */
  majorFindingRate: number;
  /** Chance that the seal is reported broken. */
  brokenSealRate: number;
  /** Chance of a minor damage note. */
  minorDamageRate: number;
  /** Hours from task request to result. */
  cycleHours: number;
  /** Placeholder bytes per media file. */
  mediaBytes: number;
}

export const DEFAULT_CELL: CellParams = { majorFindingRate: 0.1, brokenSealRate: 0.04, minorDamageRate: 0.1, cycleHours: 1.5, mediaBytes: 4096 };

/** mulberry32, the same small seeded generator the engine uses, copied so the gateway stays standalone. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedFor = (seed: number, taskId: string) => (seed ^ parseInt(createHash('sha256').update(taskId).digest('hex').slice(0, 8), 16)) >>> 0;

/** Simulates one inspection. Deterministic for a given seed and task. */
export function simulateCell(task: Task, seed: number, cell = 'cell-G1', p: CellParams = DEFAULT_CELL): ResultBody {
  const next = rng(seedFor(seed, task.id));
  const findings: ResultBody['findings'] = [];
  if (next() < p.majorFindingRate) findings.push({ kind: 'undeclared-goods', severity: 'major', note: 'Load does not match the declared goods (simulated)' });
  const sealIntact = !(next() < p.brokenSealRate);
  if (!sealIntact) findings.push({ kind: 'seal-broken', severity: 'major', note: 'Seal reported broken (simulated)' });
  if (next() < p.minorDamageRate) findings.push({ kind: 'damage', severity: 'minor', note: 'Packaging damage (simulated)' });
  if (findings.length === 0) findings.push({ kind: 'none', severity: 'info', note: 'No discrepancies found (simulated)' });
  const media = ['overview.jpg', 'seal.jpg'].map((name) => {
    const bytes = Buffer.alloc(p.mediaBytes);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(next() * 256);
    return { ref: `media/${task.id}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  });
  return {
    performedBy: cell,
    performerKind: 'robot',
    completedAt: new Date(Date.parse(task.requestedAt) + p.cycleHours * 3_600_000).toISOString(),
    seal: { id: `SEAL-${task.shipmentId.slice(-4)}`, intact: sealIntact },
    findings,
    media,
  };
}

/** The only thing the gateway needs from the outside world. Real runs pass globalThis.fetch. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface PollReport {
  polled: number;
  posted: { taskId: string; status: number; awaitingOfficerConfirmation?: boolean; error?: string }[];
}

/** One poll: list open tasks, inspect up to `max`, post each result. */
export async function pollOnce(fetchFn: Fetch, base: string, opts: { seed: number; max: number; cell?: string }): Promise<PollReport> {
  const list = await fetchFn(`${base}/api/v1/inspection-tasks?status=open&pageSize=100`);
  if (list.status !== 200) throw new Error(`Listing tasks failed with HTTP ${list.status}`);
  const tasks = ((await list.json()) as { data: Task[] }).data;
  const report: PollReport = { polled: tasks.length, posted: [] };
  for (const task of tasks.slice(0, opts.max)) {
    const body = simulateCell(task, opts.seed, opts.cell);
    const res = await fetchFn(`${base}/api/v1/inspection-tasks/${encodeURIComponent(task.id)}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = (await res.json()) as { awaitingOfficerConfirmation?: boolean; error?: { message: string } };
    report.posted.push({ taskId: task.id, status: res.status, awaitingOfficerConfirmation: out.awaitingOfficerConfirmation, error: out.error?.message });
  }
  return report;
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const base = arg('base', 'http://localhost:3000').replace(/\/$/, '');
  const seed = Number(arg('seed', '7'));
  const max = Number(arg('max', '3'));
  const polls = Number(arg('polls', '1'));
  const interval = Number(arg('interval', '5000'));
  const cell = arg('cell', 'cell-G1');
  console.log(`Reference gateway (simulated robot ${cell}) polling ${base}. No real robot is connected.`);
  for (let i = 0; i < polls; i++) {
    const r = await pollOnce(globalThis.fetch as unknown as Fetch, base, { seed, max, cell });
    console.log(`poll ${i + 1}: ${r.polled} open task(s)`);
    for (const p of r.posted) {
      const what = p.status === 201 ? (p.awaitingOfficerConfirmation ? 'recorded, awaiting officer confirmation' : 'recorded') : `rejected: ${p.error}`;
      console.log(`  ${p.taskId}: HTTP ${p.status}, ${what}`);
    }
    if (i + 1 < polls) await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

if (process.argv[1] && /robot\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}
