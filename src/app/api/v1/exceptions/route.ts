import { getWorld } from '@/server/world';
import { errorResponse, handle, json, paginate, parseEnum, parsePaging } from '@/server/http';
import { ms, type ExceptionKind } from '@/engine';

const KINDS: readonly ExceptionKind[] = ['idle-review', 'missing-evidence', 'evidence-expiring', 'authority-conflict', 'unowned-handoff'];

export async function GET(request: Request) {
  return handle(request, () => {
    const sp = new URL(request.url).searchParams;
    const paging = parsePaging(sp);
    if (paging instanceof Response) return paging;
    const kind = parseEnum(sp, 'kind', KINDS);
    if (kind instanceof Response) return kind;
    const authorityId = sp.get('authorityId') || undefined;
    const shipmentId = sp.get('shipmentId') || undefined;
    const minEscalation = sp.get('minEscalation');
    let min = 0;
    if (minEscalation) {
      min = Number(minEscalation);
      if (!Number.isInteger(min) || min < 0) {
        return errorResponse(400, 'invalid_query', "'minEscalation' must be a non-negative integer.", { parameter: 'minEscalation', value: minEscalation });
      }
    }
    const rows = [...getWorld().exceptions]
      .sort((a, b) => ms(a.openedAt) - ms(b.openedAt) || (a.id < b.id ? -1 : 1))
      .filter((e) => !kind || e.kind === kind)
      .filter((e) => !authorityId || e.authorityId === authorityId)
      .filter((e) => !shipmentId || e.shipmentId === shipmentId)
      .filter((e) => e.escalationLevel >= min);
    return json(paginate(rows, paging));
  });
}
