import { getWorld } from '@/server/world';
import { handle, json, paginate, parseEnum, parsePaging } from '@/server/http';
import { ms } from '@/engine';
import { laneOf } from '@/server/lane';

const LANES = ['green', 'amber', 'red'] as const;
const STATUSES = ['in-flight', 'cleared'] as const;

export async function GET(request: Request) {
  return handle(request, () => {
    const sp = new URL(request.url).searchParams;
    const paging = parsePaging(sp);
    if (paging instanceof Response) return paging;
    const lane = parseEnum(sp, 'lane', LANES);
    if (lane instanceof Response) return lane;
    const status = parseEnum(sp, 'status', STATUSES);
    if (status instanceof Response) return status;
    const q = (sp.get('q') ?? '').trim().toLowerCase();

    const { world, g } = getWorld();
    const rows = Object.values(world.shipments)
      // Stable total order: filing time, then id. Pagination never skips or repeats rows.
      .sort((a, b) => ms(a.shipment.filedAt) - ms(b.shipment.filedAt) || (a.shipment.id < b.shipment.id ? -1 : 1))
      .map((f) => {
        const s = f.shipment;
        return {
          id: s.id,
          declarationRef: s.declarationRef,
          mode: s.mode,
          entryPoint: s.entryPoint,
          filedAt: s.filedAt,
          eta: s.eta,
          traderId: s.traderId,
          traderName: g.directory.traders[s.traderId]?.name,
          lane: laneOf(f),
          pathway: f.assessment?.pathway,
          status: f.cleared ? 'cleared' : 'in-flight',
          clearedAt: f.cleared?.at,
          preArrival: f.cleared?.preArrival,
          totalValue: s.totalValue,
          currency: s.currency,
          itemCount: s.consignments.reduce((n, c) => n + c.items.length, 0),
        };
      })
      .filter((r) => !lane || r.lane === lane)
      .filter((r) => !status || r.status === status)
      .filter((r) => !q || [r.id, r.declarationRef, r.traderName ?? '', r.entryPoint].some((v) => v.toLowerCase().includes(q))
        || world.shipments[r.id].shipment.consignments.some((c) => c.transportDocRef.toLowerCase().includes(q)
          || c.items.some((i) => i.description.toLowerCase().includes(q) || i.hsCode.startsWith(q))));

    return json(paginate(rows, paging));
  });
}
