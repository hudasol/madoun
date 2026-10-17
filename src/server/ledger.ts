import {
  LEDGER_SIGNER_ID, demoPublicKeys, demoSigner, makeCheckpoint, type Checkpoint, type Signer,
} from '@/engine';
import { gatewayWorld } from './inspection-gateway';
import { fileSigner } from './keystore';
import { getWorld } from './world';

/**
 * Signed checkpoint of the ledger served by the API: the synthetic snapshot plus any receipts the
 * inspection gateway added in this process. NOT PERSISTENT: the cached checkpoint, the key and the gateway
 * receipts live in this server process only and are rebuilt after a restart.
 *
 * By default the ledger operator's key is the DEMO key, derived from a public string (demoSigner), so the
 * signature demonstrates the mechanism, not identity. With MADOUN_LEDGER_KEY_FILE set, the key comes from
 * the file based development keystore instead (src/server/keystore.ts), which is still not a production
 * custody model. Production custody (HSM or KMS) is described in docs/key-custody.md.
 */
interface LedgerKey { signer: Signer; publicKey: string; demoKey: boolean }

const KEY = Symbol.for('madoun.api.checkpoint');
type Holder = { [KEY]?: { head: string; checkpoint: Checkpoint }; [KEY_SIGNER]?: LedgerKey };
const KEY_SIGNER = Symbol.for('madoun.api.ledger-key');

export function ledgerKey(): LedgerKey {
  const h = globalThis as unknown as Holder;
  if (!h[KEY_SIGNER]) {
    const file = process.env.MADOUN_LEDGER_KEY_FILE;
    h[KEY_SIGNER] = file
      ? { ...fileSigner(file, LEDGER_SIGNER_ID), demoKey: false }
      : { signer: demoSigner(LEDGER_SIGNER_ID), publicKey: demoPublicKeys([LEDGER_SIGNER_ID])[LEDGER_SIGNER_ID], demoKey: true };
  }
  return h[KEY_SIGNER]!;
}

export const ledgerPublicKey = (): string => ledgerKey().publicKey;

export function currentCheckpoint(): Checkpoint {
  const { now } = getWorld();
  const ledger = gatewayWorld().receipts;
  const head = ledger.length ? ledger[ledger.length - 1].hash : 'empty';
  const h = globalThis as unknown as Holder;
  if (h[KEY]?.head !== head) h[KEY] = { head, checkpoint: makeCheckpoint(ledger, now, ledgerKey().signer) };
  return h[KEY]!.checkpoint;
}
