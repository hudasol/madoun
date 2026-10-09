import { getWorld } from '@/server/world';
import { handle, json } from '@/server/http';
import { verifyChain } from '@/engine';

export async function GET(request: Request) {
  return handle(request, () => {
    const ledger = getWorld().world.receipts;
    const res = verifyChain(ledger);
    return json({
      ok: res.valid,
      length: ledger.length,
      headHash: ledger.length ? ledger[ledger.length - 1].hash : null,
      ...(res.brokenAt === undefined ? {} : { brokenAt: res.brokenAt }),
    });
  });
}
