import { gatewayWorld } from '@/server/inspection-gateway';
import { canSeeReceipt } from '@/server/auth';
import { handle, json, notFound } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return handle(request, async ({ caller }) => {
    const { id } = await ctx.params;
    const r = gatewayWorld().receipts.find((x) => x.id === id);
    // A receipt the caller may not see is reported as missing, so its existence is not disclosed.
    return r && canSeeReceipt(caller, r) ? json(r) : notFound('Receipt', id);
  }, { scope: 'receipts:read' });
}
