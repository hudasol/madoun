/**
 * Signed checkpoints and proofs for the evidence ledger.
 *
 * The receipt hash chain (evidence.ts) stays exactly as it is. On top of it, every receipt's chain hash
 * is a leaf of an RFC 6962 Merkle tree (merkle.ts). A checkpoint states (origin, tree size, root hash,
 * time) and is signed through the same Signer interface as receipt attestations. With a checkpoint and
 * a short inclusion proof, anyone holding only the ledger operator's public key can check that one
 * receipt is in the ledger, offline, without the rest of the ledger. A consistency proof shows that a
 * later checkpoint extends an earlier one, so history cannot be rewritten between two checkpoints that
 * someone kept.
 *
 * What a proof does NOT cover: only HASHED_RECEIPT_FIELDS are in the hash. The summary text, the status
 * (verified, pending, revoked) and the revocation reason are not, so a proof shows the receipt was recorded
 * with those fields, not what its summary says or whether it is still valid. Status changes are events in
 * the audit log.
 *
 * DEMO ONLY: the checkpoint key comes from demoSigner, whose secret is derived from a public string.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { consistencyProof, inclusionProof, leafHash, merkleRoot, verifyConsistency, verifyInclusion, type Hash } from './merkle';
import type { Signer } from './sign';
import type { EvidenceReceipt, ISODate } from './types';

export const CHECKPOINT_DOMAIN = 'madoun/checkpoint/v1';
export const LEDGER_ORIGIN = 'madoun-demo-evidence-ledger';
/** Authority id under which the ledger operator signs checkpoints. */
export const LEDGER_SIGNER_ID = 'madoun-ledger';

export interface Checkpoint {
  origin: string;
  treeSize: number;
  /** Hex RFC 6962 root over the receipts' chain hashes, in ledger order. */
  rootHash: string;
  timestamp: ISODate;
  signer: string;
  /** Hex Ed25519 signature over checkpointMessage(...). */
  signature: string;
}

/** The exact bytes that are signed. Line based, so it is easy to rebuild in any language. */
export function checkpointMessage(c: Pick<Checkpoint, 'origin' | 'treeSize' | 'rootHash' | 'timestamp'>): Uint8Array {
  return utf8ToBytes(`${CHECKPOINT_DOMAIN}\n${c.origin}\n${c.treeSize}\n${c.rootHash}\n${c.timestamp}\n`);
}

/** A receipt's leaf: RFC 6962 leaf hash of the 32 bytes of its chain hash. */
export const receiptLeaf = (r: Pick<EvidenceReceipt, 'hash'>): Hash => leafHash(hexToBytes(r.hash));
export const ledgerLeaves = (ledger: Pick<EvidenceReceipt, 'hash'>[]): Hash[] => ledger.map(receiptLeaf);

export function makeCheckpoint(ledger: EvidenceReceipt[], at: ISODate, signer: Signer, origin = LEDGER_ORIGIN, size = ledger.length): Checkpoint {
  const body = { origin, treeSize: size, rootHash: bytesToHex(merkleRoot(ledgerLeaves(ledger), size)), timestamp: at };
  return { ...body, signer: signer.authorityId, signature: bytesToHex(signer.sign(checkpointMessage(body))) };
}

export function verifyCheckpointSignature(c: Checkpoint, publicKeyHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(c.signature), checkpointMessage(c), hexToBytes(publicKeyHex));
  } catch {
    return false; // malformed hex or wrong lengths fail closed
  }
}

export interface InclusionProof {
  format: 'madoun-inclusion-proof/v1';
  receipt: EvidenceReceipt;
  leafIndex: number;
  treeSize: number;
  inclusionPath: string[];
  checkpoint: Checkpoint;
}

/** Proof that the receipt with this id is in the tree the checkpoint signs. Undefined if it is not in that tree. */
export function inclusionProofFor(ledger: EvidenceReceipt[], receiptId: string, checkpoint: Checkpoint): InclusionProof | undefined {
  const index = ledger.findIndex((r) => r.id === receiptId);
  if (index < 0 || index >= checkpoint.treeSize) return undefined;
  return {
    format: 'madoun-inclusion-proof/v1',
    receipt: ledger[index],
    leafIndex: index,
    treeSize: checkpoint.treeSize,
    inclusionPath: inclusionProof(ledgerLeaves(ledger), index, checkpoint.treeSize).map(bytesToHex),
    checkpoint,
  };
}

export type ProofCheck = { ok: true } | { ok: false; reason: string };

/**
 * Receipt fields covered by the hash, and so by a proof. Everything else (summary text, status, revocation
 * reason, reuse log) is not covered: a proof says the receipt was recorded with these fields, nothing more.
 */
export const HASHED_RECEIPT_FIELDS = ['id', 'type', 'subjectRef', 'issuer', 'verifiedBy', 'method', 'scope', 'validFrom', 'validUntil', 'sharedWith'] as const;

/** Engine side verification of an inclusion proof (scripts/verify-proof.mjs does the same with no app code). */
export function verifyInclusionProof(p: InclusionProof, publicKeyHex: string, recomputeReceiptHash: (r: EvidenceReceipt) => string, origin = LEDGER_ORIGIN): ProofCheck {
  if (p.checkpoint.origin !== origin) return { ok: false, reason: 'checkpoint is for another ledger' };
  if (!verifyCheckpointSignature(p.checkpoint, publicKeyHex)) return { ok: false, reason: 'checkpoint signature does not verify' };
  if (p.treeSize !== p.checkpoint.treeSize) return { ok: false, reason: 'tree size differs from the checkpoint' };
  if (recomputeReceiptHash(p.receipt) !== p.receipt.hash) return { ok: false, reason: 'receipt content does not match its hash' };
  let path: Hash[];
  try {
    path = p.inclusionPath.map(hexToBytes);
  } catch {
    return { ok: false, reason: 'malformed inclusion path' };
  }
  const ok = verifyInclusion(receiptLeaf(p.receipt), p.leafIndex, p.treeSize, path, hexToBytes(p.checkpoint.rootHash));
  return ok ? { ok: true } : { ok: false, reason: 'inclusion path does not lead to the signed root' };
}

export interface ConsistencyProof {
  format: 'madoun-consistency-proof/v1';
  first: { treeSize: number; rootHash: string };
  second: { treeSize: number; rootHash: string };
  path: string[];
}

export function consistencyProofBetween(ledger: EvidenceReceipt[], size1: number, size2: number): ConsistencyProof {
  const leaves = ledgerLeaves(ledger);
  return {
    format: 'madoun-consistency-proof/v1',
    first: { treeSize: size1, rootHash: bytesToHex(merkleRoot(leaves, size1)) },
    second: { treeSize: size2, rootHash: bytesToHex(merkleRoot(leaves, size2)) },
    path: size1 === 0 || size1 === size2 ? [] : consistencyProof(leaves, size1, size2).map(bytesToHex),
  };
}

export function verifyConsistencyProof(p: ConsistencyProof): boolean {
  try {
    return verifyConsistency(p.first.treeSize, p.second.treeSize, hexToBytes(p.first.rootHash), hexToBytes(p.second.rootHash), p.path.map(hexToBytes));
  } catch {
    return false;
  }
}
