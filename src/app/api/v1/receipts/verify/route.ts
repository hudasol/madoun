import { getWorld } from '@/server/world';
import { handle, json } from '@/server/http';
import { demoAttestLedger, verifyAttestations, type EvidenceReceipt, type SignatureReport } from '@/engine';

// Signing ~1k receipts costs seconds, so the result is cached per ledger head hash.
const cache = new Map<string, SignatureReport>();

function signatures(ledger: EvidenceReceipt[]) {
  const head = ledger.length ? ledger[ledger.length - 1].hash : 'empty';
  let rep = cache.get(head);
  if (!rep) {
    const { attestations, keys } = demoAttestLedger(ledger);
    rep = verifyAttestations(ledger, attestations, keys);
    cache.set(head, rep);
  }
  return rep;
}

export async function GET(request: Request) {
  return handle(request, () => {
    const ledger = getWorld().world.receipts;
    const rep = signatures(ledger);
    return json({
      ok: rep.chain.valid,
      length: ledger.length,
      headHash: ledger.length ? ledger[ledger.length - 1].hash : null,
      ...(rep.chain.brokenAt === undefined ? {} : { brokenAt: rep.chain.brokenAt }),
      signatures: {
        algorithm: 'Ed25519',
        valid: rep.valid,
        signed: rep.signed,
        total: rep.total,
        // The mock signs with public, reproducible demo keys. These prove the mechanism, not the signer.
        demoKeys: true,
      },
    });
  });
}
