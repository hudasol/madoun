import { getWorld } from '@/server/world';
import { API_VERSION, handle, json } from '@/server/http';

export async function GET(request: Request) {
  return handle(request, () => {
    const w = getWorld();
    return json({
      status: 'ok',
      apiVersion: API_VERSION,
      synthetic: true,
      auth: 'none (placeholder, see src/server/auth.ts)',
      dataset: {
        seed: w.g.seed,
        snapshotAt: w.now,
        shipments: Object.keys(w.world.shipments).length,
        receipts: w.world.receipts.length,
        openExceptions: w.exceptions.length,
        traders: Object.keys(w.g.directory.traders).length,
        authorities: Object.keys(w.g.directory.authorities).length,
        requirements: w.g.directory.requirements.length,
      },
    });
  });
}
