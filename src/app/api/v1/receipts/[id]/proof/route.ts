import { gatewayWorld } from '@/server/inspection-gateway';
import { handle, json, notFound } from '@/server/http';
import { currentCheckpoint } from '@/server/ledger';
import { inclusionProofFor } from '@/engine';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Inclusion proof for one receipt against the latest signed checkpoint. Verify it offline with
 * `node scripts/verify-proof.mjs proof.json <public key>`; take the key from a channel you trust,
 * not from this response.
 */
export async function GET(request: Request, ctx: Ctx) {
  return handle(request, async () => {
    const { id } = await ctx.params;
    const proof = inclusionProofFor(gatewayWorld().receipts, id, currentCheckpoint());
    return proof ? json(proof) : notFound('Receipt', id);
  });
}
