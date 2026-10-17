/**
 * Merkle tree over a list of leaves, following RFC 6962 section 2.1 (Certificate Transparency):
 *   MTH({})      = SHA-256()
 *   leaf hash    = SHA-256(0x00 || d)
 *   MTH(D[n])    = SHA-256(0x01 || MTH(D[0:k]) || MTH(D[k:n])), k the largest power of two below n
 * The 0x00 and 0x01 prefixes separate leaves from interior nodes, so a leaf can never be passed off as
 * a node. Audit paths (PATH) and consistency proofs (PROOF, SUBPROOF) are built exactly as defined in
 * RFC 6962 sections 2.1.1 and 2.1.2; verification follows RFC 9162 sections 2.1.3.2 and 2.1.4.2.
 * Pure: no I/O, no clock. Hashing comes from the audited @noble/hashes.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type Hash = Uint8Array;

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export const EMPTY_ROOT: Hash = sha256(new Uint8Array(0));
export const leafHash = (data: Uint8Array): Hash => sha256(concat(Uint8Array.of(0x00), data));
export const nodeHash = (left: Hash, right: Hash): Hash => sha256(concat(Uint8Array.of(0x01), left, right));

/** Largest power of two strictly smaller than n (n >= 2). */
function split(n: number): number {
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
}

/** MTH over leaf hashes [start, end). */
function mth(leaves: Hash[], start: number, end: number): Hash {
  const n = end - start;
  if (n === 0) return EMPTY_ROOT;
  if (n === 1) return leaves[start];
  const k = split(n);
  return nodeHash(mth(leaves, start, start + k), mth(leaves, start + k, end));
}

/** Root of the tree whose leaf hashes are given, optionally only over the first `size` leaves. */
export function merkleRoot(leaves: Hash[], size = leaves.length): Hash {
  if (size < 0 || size > leaves.length) throw new RangeError('size out of range');
  return mth(leaves, 0, size);
}

/** RFC 6962 PATH(m, D[n]): the audit path for leaf m in the tree of the first n leaves. */
export function inclusionProof(leaves: Hash[], m: number, n = leaves.length): Hash[] {
  if (!(n >= 1 && n <= leaves.length && m >= 0 && m < n)) throw new RangeError('leaf index or tree size out of range');
  const path = (m: number, start: number, end: number): Hash[] => {
    const size = end - start;
    if (size === 1) return [];
    const k = split(size);
    return m < k
      ? [...path(m, start, start + k), mth(leaves, start + k, end)]
      : [...path(m - k, start + k, end), mth(leaves, start, start + k)];
  };
  return path(m, 0, n);
}

/** RFC 6962 PROOF(m, D[n]): proves the tree of the first m leaves is a prefix of the tree of n leaves. */
export function consistencyProof(leaves: Hash[], m: number, n = leaves.length): Hash[] {
  if (!(m >= 1 && m <= n && n <= leaves.length)) throw new RangeError('sizes out of range');
  const sub = (m: number, start: number, end: number, b: boolean): Hash[] => {
    const size = end - start;
    if (m === size) return b ? [] : [mth(leaves, start, end)];
    const k = split(size);
    return m <= k
      ? [...sub(m, start, start + k, b), mth(leaves, start + k, end)]
      : [...sub(m - k, start + k, end, false), mth(leaves, start, start + k)];
  };
  return sub(m, 0, n, true);
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** RFC 9162 section 2.1.3.2. True only if `leaf` is at `index` in a tree of `size` leaves with `root`. */
export function verifyInclusion(leaf: Hash, index: number, size: number, path: Hash[], root: Hash): boolean {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leaf;
  for (const p of path) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equal(r, root);
}

/** RFC 9162 section 2.1.4.2. True only if the tree (size1, root1) is a prefix of the tree (size2, root2). */
export function verifyConsistency(size1: number, size2: number, root1: Hash, root2: Hash, proof: Hash[]): boolean {
  if (!Number.isInteger(size1) || !Number.isInteger(size2) || size1 < 0 || size2 < size1) return false;
  if (size1 === size2) return proof.length === 0 && equal(root1, root2);
  if (size1 === 0) return proof.length === 0 && equal(root1, EMPTY_ROOT); // the empty tree is a prefix of every tree
  if (proof.length === 0) return false;
  const path = (size1 & (size1 - 1)) === 0 ? [root1, ...proof] : [...proof];
  let fn = size1 - 1;
  let sn = size2 - 1;
  while (fn % 2 === 1) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
  let fr = path[0];
  let sr = path[0];
  for (const c of path.slice(1)) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      fr = nodeHash(c, fr);
      sr = nodeHash(c, sr);
      if (fn % 2 === 0) while (fn % 2 === 0 && fn !== 0) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }
    } else {
      sr = nodeHash(sr, c);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return equal(fr, root1) && equal(sr, root2) && sn === 0;
}

export const toHex = (h: Hash) => bytesToHex(h);
