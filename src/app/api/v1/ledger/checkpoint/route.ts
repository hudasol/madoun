import { getWorld } from '@/server/world';
import { errorResponse, handle, json } from '@/server/http';
import { currentCheckpoint, ledgerPublicKey } from '@/server/ledger';
import { consistencyProofBetween } from '@/engine';

/**
 * The latest signed checkpoint of the evidence ledger: tree size, RFC 6962 root and time, signed with
 * Ed25519. With `?from=N` it also returns a consistency proof that the tree of the first N receipts is a
 * prefix of the current tree. DEMO KEY: the public key is derived from a public string.
 */
export async function GET(request: Request) {
  return handle(request, () => {
    const checkpoint = currentCheckpoint();
    const raw = new URL(request.url).searchParams.get('from');
    let consistency;
    if (raw !== null && raw !== '') {
      const from = Number(raw);
      if (!Number.isInteger(from) || from < 0 || from > checkpoint.treeSize) {
        return errorResponse(400, 'invalid_query', `'from' must be an integer between 0 and ${checkpoint.treeSize}.`, { parameter: 'from', value: raw });
      }
      consistency = consistencyProofBetween(getWorld().world.receipts, from, checkpoint.treeSize);
    }
    return json({
      checkpoint,
      publicKey: ledgerPublicKey(),
      algorithm: 'Ed25519',
      demoKey: true,
      ...(consistency ? { consistency } : {}),
    });
  });
}
