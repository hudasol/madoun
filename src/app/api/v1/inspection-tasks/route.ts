import { getWorld } from '@/server/world';
import { handle, json, paginate, parseEnum, parsePaging } from '@/server/http';
import { gatewayWorld, listTasks, storeInfo } from '@/server/inspection-gateway';

const STATUSES = ['open', 'completed'] as const;

/**
 * Inspection tasks for a robot, drone or scanner gateway to poll. MOCK: results posted to
 * /inspection-tasks/{id}/result are held in memory in this server process only (not persistent).
 */
export async function GET(request: Request) {
  return handle(request, () => {
    const sp = new URL(request.url).searchParams;
    const paging = parsePaging(sp);
    if (paging instanceof Response) return paging;
    const status = parseEnum(sp, 'status', STATUSES);
    if (status instanceof Response) return status;
    const tasks = listTasks(gatewayWorld(), getWorld().now, status ?? 'open');
    return json({ status: status ?? 'open', ...storeInfo(), ...paginate(tasks, paging) });
  }, { scope: 'tasks:read' });
}
