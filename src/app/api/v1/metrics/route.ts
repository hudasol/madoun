import { handle } from '@/server/http';
import { renderMetrics } from '@/server/metrics';

/** Request counters in the Prometheus text format. Per process; see src/server/metrics.ts. */
export async function GET(request: Request) {
  return handle(request, () => new Response(renderMetrics(), { headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' } }), { scope: 'ops:read' });
}
