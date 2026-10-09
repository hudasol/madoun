/**
 * Receipt attestations: Ed25519 signatures over a receipt's chain hash.
 *
 * The hash chain proves a ledger was not edited after the fact. It cannot prove WHO vouched for a
 * receipt, because anyone can recompute a chain. An attestation closes that gap: the verifying
 * authority signs the receipt hash with its private key, and anyone holding only the public key
 * can check it. Because each hash commits to the previous one, one signature also binds the
 * whole history before it.
 *
 * Attestations are kept beside the ledger, not inside receipts, so the deterministic world state
 * (and its hash) does not depend on key material, and signing cost is paid only where it is needed.
 *
 * DEMO ONLY: `demoKeyring` derives keys from public strings so the demo is reproducible. Anyone
 * can forge those signatures. A real deployment keeps private keys in an HSM or KMS owned by each
 * authority, and the engine only ever sees a `Signer` that signs and a `PublicKeys` map that verifies.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { sha256Hex } from './hash';
import { verifyChain } from './evidence';
import type { AuthorityId, EvidenceReceipt } from './types';

export interface Attestation {
  receiptHash: string;
  signer: AuthorityId;
  /** Hex Ed25519 signature over the UTF-8 bytes of `domain + receiptHash`. */
  signature: string;
}

/** What the engine needs to sign: no private key ever crosses this boundary. */
export interface Signer {
  authorityId: AuthorityId;
  sign(message: Uint8Array): Uint8Array;
}

/** Authority id -> hex Ed25519 public key. */
export type PublicKeys = Record<string, string>;

/** Domain separation so a signature made for a receipt can never be replayed as another kind of message. */
export const SIGNING_DOMAIN = 'madoun/receipt/v1:';

const messageFor = (receiptHash: string) => utf8ToBytes(SIGNING_DOMAIN + receiptHash);

export function attest(receipt: EvidenceReceipt, signer: Signer): Attestation {
  return {
    receiptHash: receipt.hash,
    signer: signer.authorityId,
    signature: bytesToHex(signer.sign(messageFor(receipt.hash))),
  };
}

export type SignatureProblem = 'missing' | 'wrong-signer' | 'unknown-key' | 'bad-signature';

export interface SignatureReport {
  chain: { valid: boolean; brokenAt?: number };
  /** Receipts with a valid signature from the authority that verified them. */
  signed: number;
  total: number;
  problems: { index: number; receiptId: string; problem: SignatureProblem }[];
  /** True only when the chain is intact and every receipt is validly signed by its own custodian. */
  valid: boolean;
}

/**
 * Checks the chain and every attestation using public keys only. A receipt counts as signed only
 * if the signature verifies AND was made by the authority recorded as having verified it, so a
 * valid signature from the wrong authority is reported, not accepted.
 */
export function verifyAttestations(ledger: EvidenceReceipt[], attestations: Attestation[], keys: PublicKeys): SignatureReport {
  const chain = verifyChain(ledger);
  const byHash = new Map<string, Attestation>();
  for (const a of attestations) byHash.set(a.receiptHash, a);
  const problems: SignatureReport['problems'] = [];
  let signed = 0;
  ledger.forEach((r, index) => {
    const a = byHash.get(r.hash);
    const fail = (problem: SignatureProblem) => problems.push({ index, receiptId: r.id, problem });
    if (!a) return fail('missing');
    if (a.signer !== r.verifiedBy) return fail('wrong-signer');
    const pub = keys[a.signer];
    if (!pub) return fail('unknown-key');
    let ok = false;
    try {
      ok = ed25519.verify(hexToBytes(a.signature), messageFor(r.hash), hexToBytes(pub));
    } catch {
      ok = false; // malformed hex or wrong length
    }
    if (ok) signed++;
    else fail('bad-signature');
  });
  return { chain, signed, total: ledger.length, problems, valid: chain.valid && problems.length === 0 };
}

/* ------------------------------------------------------------------ */
/* DEMO ONLY keyring                                                   */
/* ------------------------------------------------------------------ */

const demoSecret = (authorityId: string) => hexToBytes(sha256Hex('madoun-demo-only-key:' + authorityId));

/** DEMO ONLY. Deterministic signer; see the file header. */
export function demoSigner(authorityId: AuthorityId): Signer {
  const secret = demoSecret(authorityId);
  return { authorityId, sign: (m) => ed25519.sign(m, secret) };
}

/** DEMO ONLY. Public keys for the given authorities. */
export function demoPublicKeys(authorityIds: AuthorityId[]): PublicKeys {
  const out: PublicKeys = {};
  for (const id of authorityIds) out[id] = bytesToHex(ed25519.getPublicKey(demoSecret(id)));
  return out;
}

/** DEMO ONLY. Signs a whole ledger, each receipt by the authority that verified it. */
export function demoAttestLedger(ledger: EvidenceReceipt[]): { attestations: Attestation[]; keys: PublicKeys } {
  const signers = new Map<string, Signer>();
  const attestations = ledger.map((r) => {
    let s = signers.get(r.verifiedBy);
    if (!s) signers.set(r.verifiedBy, (s = demoSigner(r.verifiedBy)));
    return attest(r, s);
  });
  return { attestations, keys: demoPublicKeys([...signers.keys()]) };
}
