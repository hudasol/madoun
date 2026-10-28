/**
 * Request counters for /api/v1/metrics in the Prometheus text format.
 *
 * Per process: counters live in memory, reset on restart and are not shared between instances, so a
 * scraper must scrape every instance. Paths are reduced to route templates so that ids do not create
 * an unbounded number of series.
 */
interface Counter { count: number; totalMs: number }

const KEY = Symbol.for('madoun.api.metrics');
type Holder = { [KEY]?: { startedAt: number; byRoute: Map<string, Counter> } };

function store() {
  const h = globalThis as unknown as Holder;
  return (h[KEY] ??= { startedAt: Date.now(), byRoute: new Map() });
}

const LITERAL_SEGMENTS = new Set(['api', 'v1', 'verify', 'proof', 'result', 'checkpoint', 'assessments', 'shipments', 'receipts', 'kpis', 'exceptions', 'health', 'metrics', 'inspection-tasks', 'ledger']);

/** `/api/v1/shipments/SHP-0005` becomes `/api/v1/shipments/:id`. */
export function routeTemplate(pathname: string): string {
  return pathname.split('/').map((seg) => (seg === '' || LITERAL_SEGMENTS.has(seg) ? seg : ':id')).join('/');
}

export function recordRequest(method: string, pathname: string, status: number, ms: number): void {
  const key = `${method}\t${routeTemplate(pathname)}\t${status}`;
  const m = store().byRoute;
  const c = m.get(key) ?? { count: 0, totalMs: 0 };
  c.count++;
  c.totalMs += ms;
  m.set(key, c);
  if (m.size > 500) m.delete(m.keys().next().value!);
}

export function renderMetrics(now = Date.now()): string {
  const s = store();
  const lines = [
    '# HELP madoun_requests_total API requests handled by this process.',
    '# TYPE madoun_requests_total counter',
  ];
  const rows = [...s.byRoute.entries()].map(([k, v]) => ({ k: k.split('\t'), v }));
  for (const { k, v } of rows) lines.push(`madoun_requests_total{method="${k[0]}",route="${k[1]}",status="${k[2]}"} ${v.count}`);
  lines.push('# HELP madoun_request_duration_ms_sum Total time spent handling requests, in milliseconds.', '# TYPE madoun_request_duration_ms_sum counter');
  for (const { k, v } of rows) lines.push(`madoun_request_duration_ms_sum{method="${k[0]}",route="${k[1]}",status="${k[2]}"} ${v.totalMs.toFixed(1)}`);
  lines.push('# HELP madoun_uptime_seconds Seconds since this process first handled a request.', '# TYPE madoun_uptime_seconds gauge', `madoun_uptime_seconds ${Math.floor((now - s.startedAt) / 1000)}`);
  return lines.join('\n') + '\n';
}

export function resetMetrics(): void {
  delete (globalThis as unknown as Holder)[KEY];
}
