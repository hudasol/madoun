import { getWorld } from '@/server/world';
import { handle, json, paginate, parseEnum, parsePaging } from '@/server/http';
import type { EvidenceType } from '@/engine';
import { EVIDENCE_TYPES } from '@/server/validate';

const STATUSES = ['verified', 'pending', 'revoked'] as const;

export async function GET(request: Request) {
  return handle(request, () => {
    const sp = new URL(request.url).searchParams;
    const paging = parsePaging(sp);
    if (paging instanceof Response) return paging;
    const type = parseEnum<EvidenceType>(sp, 'type', EVIDENCE_TYPES);
    if (type instanceof Response) return type;
    const status = parseEnum(sp, 'status', STATUSES);
    if (status instanceof Response) return status;
    const verifiedBy = sp.get('verifiedBy') || undefined;
    const sharedWith = sp.get('sharedWith') || undefined;

    // Ledger order (the order the hash chain was written) is already stable.
    const rows = getWorld().world.receipts
      .filter((r) => !type || r.type === type)
      .filter((r) => !status || r.status === status)
      .filter((r) => !verifiedBy || r.verifiedBy === verifiedBy)
      // "Receipts that authority X may rely on": open-to-all, or X listed by the custodian.
      .filter((r) => !sharedWith || r.sharedWith === 'all' || r.sharedWith.includes(sharedWith));
    return json(paginate(rows, paging));
  });
}
