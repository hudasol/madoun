import {
  LEDGER_SIGNER_ID, demoPublicKeys, demoSigner, makeCheckpoint, type Checkpoint,
} from '@/engine';
import { getWorld } from './world';

/**
 * Signed checkpoint of the synthetic ledger at the snapshot time. DEMO KEY: the ledger operator's key is
 * derived from a public string (demoSigner), so the signature demonstrates the mechanism, not identity.
 * A real operator keeps this key in an HSM or KMS (docs/key-custody.md).
 */
const KEY = Symbol.for('madoun.api.checkpoint');
type Holder = { [KEY]?: { head: string; checkpoint: Checkpoint } };

export function ledgerPublicKey(): string {
  return demoPublicKeys([LEDGER_SIGNER_ID])[LEDGER_SIGNER_ID];
}

export function currentCheckpoint(): Checkpoint {
  const { world, now } = getWorld();
  const ledger = world.receipts;
  const head = ledger.length ? ledger[ledger.length - 1].hash : 'empty';
  const h = globalThis as unknown as Holder;
  if (h[KEY]?.head !== head) h[KEY] = { head, checkpoint: makeCheckpoint(ledger, now, demoSigner(LEDGER_SIGNER_ID)) };
  return h[KEY]!.checkpoint;
}
