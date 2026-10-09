import { getWorld } from '@/server/world';
import { handle, json } from '@/server/http';

export async function GET(request: Request) {
  return handle(request, () => {
    const { kpis, now } = getWorld();
    return json({ snapshotAt: now, simulated: true, kpis });
  });
}
