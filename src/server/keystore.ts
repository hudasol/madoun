import fs from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { Signer } from '@/engine';

/**
 * FILE BASED DEVELOPMENT KEYSTORE. NOT FOR PRODUCTION.
 *
 * Reads an Ed25519 secret key (64 hex characters) from a file and exposes it only through the engine's
 * `Signer` interface, so no code outside this file touches the key bytes. It exists so a developer can
 * run the ledger with a private key that is not the public demo key. A key on disk can be copied by
 * anyone who can read the file, and nothing here rotates, revokes or audits it. Production keys belong
 * in an HSM or a cloud KMS; see docs/key-custody.md. Create a key with `node scripts/dev-keystore.mjs`.
 */
export class KeystoreError extends Error {}

export function fileSigner(path: string, authorityId: string): { signer: Signer; publicKey: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8').trim();
  } catch {
    throw new KeystoreError(`Cannot read key file ${path}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(raw)) throw new KeystoreError('Key file must hold exactly 64 lowercase hex characters (a 32 byte Ed25519 secret).');
  const secret = hexToBytes(raw);
  return {
    signer: { authorityId, sign: (m) => ed25519.sign(m, secret) },
    publicKey: bytesToHex(ed25519.getPublicKey(secret)),
  };
}
