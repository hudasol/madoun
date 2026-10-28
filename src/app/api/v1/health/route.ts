import { getWorld } from '@/server/world';
import { authMode, configProblems } from '@/server/auth';
import { API_VERSION, handle, json } from '@/server/http';

/**
 * Public liveness and configuration report. The dataset block is shown to a key with ops:read, or when
 * authentication is off (the demo), and withheld otherwise.
 */
export async function GET(request: Request) {
  return handle(request, ({ caller }) => {
    const mode = authMode();
    const problems = configProblems();
    const body: Record<string, unknown> = {
      status: problems ? 'degraded' : 'ok',
      apiVersion: API_VERSION,
      synthetic: true,
      auth: {
        mode,
        ...(mode === 'off' ? { warning: 'Authentication is off. This is the public demo, which serves synthetic data only. Do not expose real data in this mode.' } : {}),
        ...(problems ? { problems } : {}),
      },
    };
    if (caller.scopes.has('ops:read')) {
      const w = getWorld();
      body.dataset = {
        seed: w.g.seed,
        snapshotAt: w.now,
        shipments: Object.keys(w.world.shipments).length,
        receipts: w.world.receipts.length,
        openExceptions: w.exceptions.length,
        traders: Object.keys(w.g.directory.traders).length,
        authorities: Object.keys(w.g.directory.authorities).length,
        requirements: w.g.directory.requirements.length,
      };
    }
    return json(body, problems ? 503 : 200);
  }, { isPublic: true });
}
