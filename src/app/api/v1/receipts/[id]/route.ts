import { getWorld } from '@/server/world';
import { handle, json, notFound } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const r = getWorld().world.receipts.find((x) => x.id === id);
    return r ? json(r) : notFound('Receipt', id);
  });
}
